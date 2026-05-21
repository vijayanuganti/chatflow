"""
Client self-upload diet log (photo per day). Legacy `diet_plans` collection is untouched.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

DIET_ENTRIES_COLLECTION = "diet_entries"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_date_str() -> str:
    return datetime.now(timezone.utc).date().isoformat()


async def _diet_acl(db, viewer: dict, client_id: str) -> dict:
    client = await db.users.find_one({"id": client_id, "role": "client"})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    role = viewer.get("role")
    if role == "admin":
        return client
    if role == "client":
        if viewer["id"] != client_id:
            raise HTTPException(status_code=403, detail="Not allowed")
        return client
    if role == "employee":
        if client.get("employee_id") == viewer["id"]:
            return client
        bid = client.get("batch_id")
        batch = await db.batches.find_one({"id": bid}) if bid else None
        if batch and batch.get("employee_id") == viewer["id"]:
            return client
    raise HTTPException(status_code=403, detail="Not allowed")


async def _resolve_day_number(db, client_id: str, entry_date: str) -> int:
    """Reuse day_number for same calendar date; otherwise allocate next day."""
    existing = await db[DIET_ENTRIES_COLLECTION].find_one(
        {"client_id": client_id, "entry_date": entry_date},
        {"day_number": 1},
    )
    if existing:
        return int(existing["day_number"])
    latest = await db[DIET_ENTRIES_COLLECTION].find({"client_id": client_id}).sort(
        "day_number", -1
    ).limit(1).to_list(1)
    return int(latest[0]["day_number"]) + 1 if latest else 1


def _group_entries(entries: List[dict]) -> List[dict]:
    by_day: Dict[int, dict] = {}
    for e in entries:
        dn = int(e.get("day_number") or 1)
        if dn not in by_day:
            by_day[dn] = {
                "day_number": dn,
                "entry_date": e.get("entry_date"),
                "photos": [],
            }
        by_day[dn]["photos"].append(
            {
                "id": e["id"],
                "photo_path": e.get("photo_path"),
                "captured_at": e.get("captured_at"),
                "uploaded_at": e.get("uploaded_at"),
            }
        )
    days = sorted(by_day.values(), key=lambda d: d["day_number"])
    for d in days:
        d["photos"].sort(key=lambda p: p.get("captured_at") or p.get("uploaded_at") or "")
    return days


def register_diet_routes(
    router: Any,
    db: Any,
    *,
    get_current_user: Callable,
    upload_fileobj: Callable,
    delete_storage_urls: Callable,
    log_audit: Callable,
) -> None:
    @router.get("/clients/{client_id}/diet-entries")
    async def list_diet_entries(client_id: str, viewer: dict = Depends(get_current_user)):
        await _diet_acl(db, viewer, client_id)
        cursor = db[DIET_ENTRIES_COLLECTION].find({"client_id": client_id}, {"_id": 0}).sort(
            [("day_number", 1), ("captured_at", 1), ("uploaded_at", 1)]
        )
        entries = [e async for e in cursor]
        return {"client_id": client_id, "days": _group_entries(entries)}

    @router.post("/clients/{client_id}/diet-entries/upload")
    async def upload_diet_entry(
        client_id: str,
        file: UploadFile = File(...),
        viewer: dict = Depends(get_current_user),
    ):
        if viewer.get("role") != "client" or viewer["id"] != client_id:
            raise HTTPException(status_code=403, detail="Only the client may upload diet photos")
        await _diet_acl(db, viewer, client_id)

        mime = (file.content_type or "").lower()
        ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
        if not mime.startswith("image/") and ext not in (
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp",
        ):
            raise HTTPException(status_code=400, detail="Diet upload requires an image file")

        entry_date = _today_date_str()
        day_number = await _resolve_day_number(db, client_id, entry_date)
        now = _now_iso()
        file_id = f"{uuid.uuid4().hex}{ext}"
        key = f"uploads/diet/{client_id}/{file_id}"
        try:
            photo_path, _size = await upload_fileobj(file.file, key, mime, file.filename)
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e) or "Upload failed")

        doc = {
            "id": f"dietent_{uuid.uuid4().hex}",
            "client_id": client_id,
            "day_number": day_number,
            "entry_date": entry_date,
            "photo_path": photo_path,
            "captured_at": now,
            "uploaded_at": now,
            "created_by": viewer["id"],
        }
        await db[DIET_ENTRIES_COLLECTION].insert_one(doc)
        await log_audit(
            actor_user_id=viewer["id"],
            action="diet_entry.upload",
            target_user_id=client_id,
            metadata={"day_number": day_number, "entry_id": doc["id"]},
        )
        doc.pop("_id", None)
        return doc

    @router.delete("/diet-entries/{entry_id}")
    async def delete_diet_entry(entry_id: str, viewer: dict = Depends(get_current_user)):
        doc = await db[DIET_ENTRIES_COLLECTION].find_one({"id": entry_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Entry not found")
        if viewer.get("role") != "client" or viewer["id"] != doc.get("client_id"):
            raise HTTPException(status_code=403, detail="Only the client may delete their photos")
        url = doc.get("photo_path")
        if url:
            await delete_storage_urls([url])
        await db[DIET_ENTRIES_COLLECTION].delete_one({"id": entry_id})
        await log_audit(
            actor_user_id=viewer["id"],
            action="diet_entry.delete",
            target_user_id=doc.get("client_id"),
            metadata={"entry_id": entry_id},
        )
        return {"ok": True}
