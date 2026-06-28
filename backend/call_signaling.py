"""
WebRTC audio call signaling — relay SDP/ICE over the existing chat WebSocket.
1:1 direct conversations only; global user_id socket routing (not conversation rooms).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from fastapi import Depends, HTTPException, Query

logger = logging.getLogger(__name__)

CALL_SIGNAL_TYPES = frozenset({
    "call-offer",
    "call-answer",
    "ice-candidate",
    "call-decline",
    "call-end",
})

_active_calls: Dict[str, dict] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connection_count(manager: Any, user_id: str) -> int:
    active = getattr(manager, "active", {}) or {}
    return len(active.get(user_id) or set())


async def send_to_user(manager: Any, user_id: str, event: dict) -> int:
    if hasattr(manager, "send_to_user"):
        return await manager.send_to_user(user_id, event)
    await manager.send_event(user_id, event)
    sockets = connection_count(manager, user_id)
    return sockets


async def _assert_direct_participants(db, conversation_id: str, user_id: str, target_user_id: str) -> dict:
    conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.get("type") != "direct":
        raise HTTPException(status_code=400, detail="Calls are only supported in direct conversations")
    participants = list(conv.get("participants") or [])
    if user_id not in participants or target_user_id not in participants:
        raise HTTPException(status_code=403, detail="Not a participant in this conversation")
    return conv


async def _upsert_call_log(db, call_id: str, patch: dict) -> None:
    if not db:
        return
    await db.call_logs.update_one({"call_id": call_id}, {"$set": patch, "$setOnInsert": {"call_id": call_id}}, upsert=True)


async def _finalize_call(db, call_id: str, status: str, ended_reason: Optional[str] = None) -> None:
    entry = _active_calls.pop(call_id, None)
    if not db or not entry:
        return
    ended_at = _now_iso()
    started = entry.get("started_at")
    answered_at = entry.get("answered_at")
    duration = 0
    if answered_at and status == "answered":
        try:
            a = datetime.fromisoformat(answered_at.replace("Z", "+00:00"))
            e = datetime.fromisoformat(ended_at.replace("Z", "+00:00"))
            duration = max(0, int((e - a).total_seconds()))
        except Exception:
            duration = 0
    await _upsert_call_log(
        db,
        call_id,
        {
            "conversation_id": entry.get("conversation_id"),
            "caller_id": entry.get("caller_id"),
            "callee_id": entry.get("callee_id"),
            "started_at": started,
            "answered_at": answered_at,
            "ended_at": ended_at,
            "duration_seconds": duration,
            "status": status,
            "ended_reason": ended_reason,
        },
    )


async def handle_call_signal(
    *,
    user_id: str,
    user: dict,
    payload: dict,
    manager: Any,
    db: Any,
) -> None:
    signal_type = (payload.get("type") or "").strip()
    if signal_type not in CALL_SIGNAL_TYPES:
        return

    if signal_type == "call-offer":
        await _handle_call_offer(user_id, user, payload, manager, db)
    elif signal_type == "call-answer":
        await _handle_call_answer(user_id, payload, manager, db)
    elif signal_type == "ice-candidate":
        await _handle_ice_candidate(user_id, payload, manager)
    elif signal_type == "call-decline":
        await _handle_call_decline(user_id, payload, manager, db)
    elif signal_type == "call-end":
        await _handle_call_end(user_id, payload, manager, db)


async def _handle_call_offer(user_id: str, user: dict, payload: dict, manager: Any, db: Any) -> None:
    call_id = (payload.get("call_id") or "").strip() or str(uuid.uuid4())
    conversation_id = (payload.get("conversation_id") or "").strip()
    target_user_id = (payload.get("target_user_id") or "").strip()
    sdp = payload.get("sdp")
    if not conversation_id or not target_user_id or not sdp:
        await send_to_user(
            manager,
            user_id,
            {"type": "call-error", "call_id": call_id, "reason": "invalid_offer"},
        )
        return

    try:
        await _assert_direct_participants(db, conversation_id, user_id, target_user_id)
    except HTTPException as exc:
        await send_to_user(
            manager,
            user_id,
            {"type": "call-error", "call_id": call_id, "reason": "forbidden", "detail": str(exc.detail)},
        )
        return

    callee_sockets = connection_count(manager, target_user_id)
    if callee_sockets <= 0:
        logger.info("call_signal call-offer rejected: callee offline user_id=%s", target_user_id)
        await send_to_user(
            manager,
            user_id,
            {"type": "call-error", "call_id": call_id, "reason": "callee_offline"},
        )
        return

    started_at = _now_iso()
    _active_calls[call_id] = {
        "call_id": call_id,
        "conversation_id": conversation_id,
        "caller_id": user_id,
        "callee_id": target_user_id,
        "state": "ringing",
        "started_at": started_at,
        "answered_at": None,
    }
    await _upsert_call_log(
        db,
        call_id,
        {
            "conversation_id": conversation_id,
            "caller_id": user_id,
            "callee_id": target_user_id,
            "started_at": started_at,
            "answered_at": None,
            "ended_at": None,
            "duration_seconds": 0,
            "status": "ringing",
        },
    )

    caller_name = user.get("full_name") or user.get("username") or "Unknown"
    offer_event = {
        "type": "call-offer",
        "call_id": call_id,
        "conversation_id": conversation_id,
        "caller_id": user_id,
        "caller_name": caller_name,
        "sdp": sdp,
    }
    ring_event = {
        "type": "call-ring",
        "call_id": call_id,
        "conversation_id": conversation_id,
        "caller_id": user_id,
        "caller_name": caller_name,
    }
    await send_to_user(manager, target_user_id, offer_event)
    await send_to_user(manager, target_user_id, ring_event)
    await send_to_user(manager, user_id, {"type": "call-ringing", "call_id": call_id})
    logger.info(
        "call_signal call-offer accepted: call_id=%s callee_id=%s online (%s socket(s))",
        call_id,
        target_user_id,
        callee_sockets,
    )


async def _peer_for_call(user_id: str, call_id: str) -> Optional[str]:
    entry = _active_calls.get(call_id)
    if not entry:
        return None
    if entry.get("caller_id") == user_id:
        return entry.get("callee_id")
    if entry.get("callee_id") == user_id:
        return entry.get("caller_id")
    return None


async def _handle_call_answer(user_id: str, payload: dict, manager: Any, db: Any) -> None:
    call_id = (payload.get("call_id") or "").strip()
    sdp = payload.get("sdp")
    if not call_id or not sdp:
        return
    entry = _active_calls.get(call_id)
    if not entry or entry.get("callee_id") != user_id:
        await send_to_user(manager, user_id, {"type": "call-error", "call_id": call_id, "reason": "forbidden"})
        return
    answered_at = _now_iso()
    entry["answered_at"] = answered_at
    entry["state"] = "answered"
    await _upsert_call_log(db, call_id, {"answered_at": answered_at, "status": "answered"})
    caller_id = entry.get("caller_id")
    await send_to_user(
        manager,
        caller_id,
        {"type": "call-answer", "call_id": call_id, "sdp": sdp},
    )


async def _handle_ice_candidate(user_id: str, payload: dict, manager: Any) -> None:
    call_id = (payload.get("call_id") or "").strip()
    candidate = payload.get("candidate")
    if not call_id:
        return
    peer_id = await _peer_for_call(user_id, call_id)
    if not peer_id:
        return
    await send_to_user(
        manager,
        peer_id,
        {"type": "ice-candidate", "call_id": call_id, "candidate": candidate},
    )


async def _handle_call_decline(user_id: str, payload: dict, manager: Any, db: Any) -> None:
    call_id = (payload.get("call_id") or "").strip()
    if not call_id:
        return
    entry = _active_calls.get(call_id)
    if not entry:
        return
    caller_id = entry.get("caller_id")
    callee_id = entry.get("callee_id")
    reason = payload.get("reason") or "declined"
    if user_id not in {caller_id, callee_id}:
        return
    peer_id = caller_id if user_id == callee_id else callee_id
    await send_to_user(
        manager,
        peer_id,
        {"type": "call-decline", "call_id": call_id, "reason": reason},
    )
    await send_to_user(manager, user_id, {"type": "call-ended", "call_id": call_id, "reason": reason})
    await send_to_user(manager, peer_id, {"type": "call-ended", "call_id": call_id, "reason": reason})
    await _finalize_call(db, call_id, "declined" if user_id == callee_id else "missed", reason)


async def _handle_call_end(user_id: str, payload: dict, manager: Any, db: Any) -> None:
    call_id = (payload.get("call_id") or "").strip()
    if not call_id:
        return
    entry = _active_calls.get(call_id)
    if not entry:
        return
    caller_id = entry.get("caller_id")
    callee_id = entry.get("callee_id")
    if user_id not in {caller_id, callee_id}:
        return
    reason = payload.get("reason") or "hangup"
    peer_id = caller_id if user_id == callee_id else callee_id
    await send_to_user(
        manager,
        peer_id,
        {"type": "call-end", "call_id": call_id, "reason": reason},
    )
    await send_to_user(manager, user_id, {"type": "call-ended", "call_id": call_id, "reason": reason})
    await send_to_user(manager, peer_id, {"type": "call-ended", "call_id": call_id, "reason": reason})
    status = "answered" if entry.get("answered_at") else ("missed" if user_id == caller_id else "declined")
    await _finalize_call(db, call_id, status, reason)


def register_call_routes(
    router,
    *,
    db,
    require_admin: Callable,
    get_current_user: Callable,
    clean_user: Callable,
) -> None:
    @router.get("/call-history/me")
    async def my_call_history(user: dict = Depends(get_current_user)):
        rows = (
            await db.call_logs.find(
                {"$or": [{"caller_id": user["id"]}, {"callee_id": user["id"]}]},
                {"_id": 0},
            )
            .sort("started_at", -1)
            .to_list(100)
        )
        return {"items": rows}

    @router.get("/admin/call-logs")
    async def admin_call_logs(
        user_id: Optional[str] = Query(None),
        limit: int = Query(100, ge=1, le=500),
        _: dict = Depends(require_admin),
    ):
        query: dict = {}
        if user_id:
            query = {"$or": [{"caller_id": user_id}, {"callee_id": user_id}]}
        rows = await db.call_logs.find(query, {"_id": 0}).sort("started_at", -1).to_list(limit)
        return {"items": rows}
