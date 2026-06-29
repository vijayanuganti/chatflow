"""
WebRTC audio call signaling — relay SDP/ICE over the existing chat WebSocket.
1:1 direct conversations only; global user_id socket routing (not conversation rooms).
"""
from __future__ import annotations

import asyncio
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
_call_message_inserted: set = set()
_call_message_broadcast: set = set()
_finalize_locks: Dict[str, asyncio.Lock] = {}


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
    if db is None:
        return
    await db.call_logs.update_one({"call_id": call_id}, {"$set": patch, "$setOnInsert": {"call_id": call_id}}, upsert=True)


def _call_subtype_for_status(status: str) -> str:
    if status == "answered":
        return "call_answered"
    if status == "missed":
        return "call_missed"
    if status == "declined":
        return "call_declined"
    return "call_ended"


def _call_preview_text(subtype: str, duration: Optional[int]) -> str:
    if subtype == "call_answered":
        if duration and duration >= 1:
            m, s = divmod(int(duration), 60)
            dur = f"{m}m {s}s" if m else f"{s}s"
            return f"📞 Voice call · {dur}"
        return "📞 Voice call"
    if subtype == "call_missed":
        return "📵 Missed voice call"
    if subtype == "call_declined":
        return "📵 Declined voice call"
    return "📞 Voice call"


async def _insert_call_message(
    db, conversation_id: str, sender_id: str, call_log: dict
) -> tuple[Optional[dict], bool]:
    """Insert a system call message into the conversation thread.

    Returns (message, inserted) where inserted is False when a row already exists.
    Uses an atomic upsert so concurrent finalizers cannot create two rows per call.
    """
    if db is None or not conversation_id:
        return None, False
    call_id = call_log.get("call_id")
    if not call_id:
        return None, False

    status = call_log.get("status")
    subtype = _call_subtype_for_status(status or "")
    duration = call_log.get("duration_seconds")
    caller_id = call_log.get("caller_id")
    callee_id = call_log.get("callee_id")
    created_at = _now_iso()
    if status == "answered":
        duration_value = max(0, int(duration or 0))
    else:
        duration_value = int(duration) if duration and int(duration) > 0 else None

    caller = await db.users.find_one({"id": caller_id}, {"_id": 0, "full_name": 1, "username": 1})
    sender_name = (caller or {}).get("full_name") or (caller or {}).get("username") or "Caller"

    conv = await db.conversations.find_one({"id": conversation_id}, {"_id": 0, "type": 1, "participants": 1})
    participants = list((conv or {}).get("participants") or [])
    recipient_ids = [p for p in participants if p != sender_id]

    msg = {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "conversation_type": (conv or {}).get("type") or "direct",
        "sender_id": sender_id,
        "sender_name": sender_name,
        "recipient_ids": recipient_ids,
        "message_type": "call",
        "call_subtype": subtype,
        "call_status": status,
        "call_id": call_id,
        "caller_id": caller_id,
        "callee_id": callee_id,
        "duration_seconds": duration_value,
        "content": _call_preview_text(subtype, duration_value if status == "answered" else duration),
        "created_at": created_at,
        "read_by": [sender_id],
        "status": "sent",
    }

    result = await db.messages.update_one(
        {"call_id": call_id, "message_type": "call"},
        {"$setOnInsert": dict(msg)},
        upsert=True,
    )
    if not result.upserted_id:
        existing = await db.messages.find_one(
            {"call_id": call_id, "message_type": "call"},
            {"_id": 0},
        )
        return existing, False

    preview = msg["content"]
    conv_update = {
        "last_message": preview,
        "last_message_at": created_at,
        "last_message_sender_id": sender_id,
        "last_message_type": "call",
        "last_message_call_subtype": subtype,
        "last_message_read_by": [sender_id],
    }
    if subtype == "call_answered" and duration_value is not None and int(duration_value) > 0:
        conv_update["last_message_duration_seconds"] = int(duration_value)
    await db.conversations.update_one({"id": conversation_id}, {"$set": conv_update})
    return msg, True


async def _broadcast_call_message(manager: Any, db: Any, msg: dict) -> None:
    if manager is None or db is None or not msg:
        return
    conv = await db.conversations.find_one({"id": msg["conversation_id"]}, {"_id": 0})
    if not conv:
        return
    event = {
        "type": "message",
        "message": msg,
        "conversation": {
            "id": conv["id"],
            "type": conv.get("type"),
            "name": conv.get("name"),
            "participants": conv.get("participants") or [],
        },
    }
    for pid in conv.get("participants") or []:
        await send_to_user(manager, pid, event)


async def _broadcast_call_message_once(manager: Any, db: Any, msg: dict) -> None:
    call_id = (msg or {}).get("call_id")
    if call_id:
        if call_id in _call_message_broadcast:
            return
        _call_message_broadcast.add(call_id)
    await _broadcast_call_message(manager, db, msg)


async def _finalize_call(
    db,
    call_id: str,
    status: str,
    ended_reason: Optional[str] = None,
    manager: Any = None,
) -> None:
    if db is None or not call_id:
        return
    lock = _finalize_locks.setdefault(call_id, asyncio.Lock())
    async with lock:
        await _finalize_call_locked(db, call_id, status, ended_reason, manager)
    if not lock.locked():
        _finalize_locks.pop(call_id, None)


async def _finalize_call_locked(
    db,
    call_id: str,
    status: str,
    ended_reason: Optional[str] = None,
    manager: Any = None,
) -> None:
    existing_log = await db.call_logs.find_one({"call_id": call_id}, {"_id": 0, "status": 1})
    if existing_log and existing_log.get("status") in ("answered", "missed", "declined"):
        existing_msg = await db.messages.find_one(
            {"call_id": call_id, "message_type": "call"},
            {"_id": 0},
        )
        if existing_msg:
            _call_message_inserted.add(call_id)
            return

    entry = _active_calls.pop(call_id, None)
    message_already_inserted = bool(entry and entry.get("message_inserted"))
    if not entry:
        log = await db.call_logs.find_one({"call_id": call_id}, {"_id": 0})
        if not log:
            logger.warning("call finalize: no active entry or log for call_id=%s", call_id)
            return
        entry = {
            "conversation_id": log.get("conversation_id"),
            "caller_id": log.get("caller_id"),
            "callee_id": log.get("callee_id"),
            "started_at": log.get("started_at"),
            "answered_at": log.get("answered_at"),
        }
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
    log_doc = {
        "conversation_id": entry.get("conversation_id"),
        "caller_id": entry.get("caller_id"),
        "callee_id": entry.get("callee_id"),
        "started_at": started,
        "answered_at": answered_at,
        "ended_at": ended_at,
        "duration_seconds": duration,
        "status": status,
        "ended_reason": ended_reason,
        "call_id": call_id,
    }
    await _upsert_call_log(db, call_id, log_doc)

    if status in ("answered", "missed", "declined"):
        conversation_id = entry.get("conversation_id")
        caller_id = entry.get("caller_id")
        if not conversation_id:
            logger.warning(
                "call message skipped: missing conversation_id call_id=%s status=%s",
                call_id,
                status,
            )
        elif message_already_inserted or call_id in _call_message_inserted:
            logger.debug("call message already inserted call_id=%s", call_id)
        else:
            existing_msg = await db.messages.find_one(
                {"call_id": call_id, "message_type": "call"},
                {"_id": 0},
            )
            if existing_msg:
                _call_message_inserted.add(call_id)
            else:
                active_record = _active_calls.get(call_id)
                if active_record is not None:
                    active_record["message_inserted"] = True
                msg, inserted = await _insert_call_message(db, conversation_id, caller_id, log_doc)
                if msg:
                    _call_message_inserted.add(call_id)
                    if inserted:
                        await _broadcast_call_message_once(manager, db, msg)
                else:
                    logger.warning(
                        "call message insert failed call_id=%s conv=%s status=%s",
                        call_id,
                        conversation_id,
                        status,
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
        logger.info(
            "call_signal call-offer: callee has no WebSocket user_id=%s — ringing caller anyway",
            target_user_id,
        )

    started_at = _now_iso()
    stale_ids = [
        cid
        for cid, entry in list(_active_calls.items())
        if entry.get("caller_id") == user_id
        and entry.get("callee_id") == target_user_id
        and entry.get("state") == "ringing"
    ]
    for stale_id in stale_ids:
        _active_calls.pop(stale_id, None)

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
    if not entry and db is not None:
        entry = await db.call_logs.find_one({"call_id": call_id}, {"_id": 0})
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
    await _finalize_call(db, call_id, "declined" if user_id == callee_id else "missed", reason, manager)


async def _handle_call_end(user_id: str, payload: dict, manager: Any, db: Any) -> None:
    call_id = (payload.get("call_id") or "").strip()
    if not call_id:
        return
    entry = _active_calls.get(call_id)
    if not entry and db is not None:
        entry = await db.call_logs.find_one({"call_id": call_id}, {"_id": 0})
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
    await _finalize_call(db, call_id, status, reason, manager)


async def ensure_call_thread_message(
    db,
    call_id: str,
    user_id: str,
    manager: Any = None,
) -> Optional[dict]:
    """Idempotent: finalize call log if needed and ensure a thread message exists."""
    if db is None or not call_id:
        return None
    log = await db.call_logs.find_one({"call_id": call_id}, {"_id": 0})
    if not log:
        return None
    caller_id = log.get("caller_id")
    callee_id = log.get("callee_id")
    if user_id not in {caller_id, callee_id}:
        return None

    existing_msg = await db.messages.find_one(
        {"call_id": call_id, "message_type": "call"},
        {"_id": 0},
    )
    if existing_msg:
        return existing_msg

    status = log.get("status") or "ringing"
    if status not in ("answered", "missed", "declined"):
        if log.get("answered_at"):
            status = "answered"
        elif user_id == caller_id:
            status = "missed"
        else:
            status = "declined"
        await _finalize_call(db, call_id, status, "client_sync", manager)

    return await db.messages.find_one(
        {"call_id": call_id, "message_type": "call"},
        {"_id": 0},
    )


def register_call_routes(
    router,
    *,
    db,
    manager: Any = None,
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

    @router.post("/call-history/rate")
    async def rate_call(payload: dict, user: dict = Depends(get_current_user)):
        call_id = payload.get("call_id")
        rating = payload.get("rating")
        reason = payload.get("reason")
        if not call_id or rating is None:
            raise HTTPException(status_code=400, detail="call_id and rating required")
        try:
            rating_val = int(rating)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="invalid rating")
        if rating_val < 1 or rating_val > 5:
            raise HTTPException(status_code=400, detail="rating must be 1–5")
        log = await db.call_logs.find_one({"call_id": call_id}, {"_id": 0})
        if not log:
            raise HTTPException(status_code=404, detail="call not found")
        uid = user["id"]
        if uid not in (log.get("caller_id"), log.get("callee_id")):
            raise HTTPException(status_code=403, detail="forbidden")
        update = {"rating": rating_val}
        if reason:
            update["reason"] = str(reason)[:120]
        await db.call_logs.update_one({"call_id": call_id}, {"$set": update})
        return {"ok": True}

    @router.post("/call-history/sync-thread-message")
    async def sync_call_thread_message(payload: dict, user: dict = Depends(get_current_user)):
        call_id = (payload.get("call_id") or "").strip()
        if not call_id:
            raise HTTPException(status_code=400, detail="call_id required")
        msg = await ensure_call_thread_message(db, call_id, user["id"], manager)
        if not msg:
            raise HTTPException(status_code=404, detail="call not found or not eligible")
        return {"message": msg}

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
