"""
Media library / folder management API (admin create, employee/client view).
"""
from __future__ import annotations

import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

FOLDER_ACCESS_TYPES = frozenset({
    "all",
    "active_employees",
    "inactive_employees",
    "active_clients",
    "inactive_clients",
    "dropped_clients",
    "specific_user",
})

FOLDER_CATEGORIES = frozenset({"links", "videos", "photos", "documents"})

ACCESS_LABELS = {
    "all": "All",
    "active_employees": "Active Employees",
    "inactive_employees": "Inactive Employees",
    "active_clients": "Active Clients",
    "inactive_clients": "Inactive Clients",
    "dropped_clients": "Dropped Clients",
    "specific_user": "Specific user",
}


class FolderAccessRule(BaseModel):
    access_type: str
    user_id: Optional[str] = None
    user_type: Optional[str] = None  # employee | client


class FolderCreateBody(BaseModel):
    name: str = "New Folder"
    access: List[FolderAccessRule] = Field(default_factory=list)


class FolderUpdateBody(BaseModel):
    name: Optional[str] = None
    access: Optional[List[FolderAccessRule]] = None


class FolderLinkItemBody(BaseModel):
    title: str = ""
    url: str


class FolderItemUpdateBody(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client_status(user: dict) -> str:
    if user.get("role") != "client":
        return "active"
    cs = (user.get("client_status") or "").strip().lower()
    if cs in ("active", "inactive", "dropped"):
        return cs
    if user.get("is_active") is False:
        return "inactive"
    return "active"


def _validate_access_rules(rules: List[dict]) -> List[dict]:
    if not rules:
        raise HTTPException(status_code=400, detail="At least one access rule is required")
    out = []
    for r in rules:
        t = (r.get("access_type") or "").strip().lower()
        if t not in FOLDER_ACCESS_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid access_type: {t}")
        if t == "specific_user":
            uid = (r.get("user_id") or "").strip()
            ut = (r.get("user_type") or "").strip().lower()
            if not uid or ut not in ("employee", "client"):
                raise HTTPException(
                    status_code=400,
                    detail="specific_user requires user_id and user_type (employee|client)",
                )
            out.append({"access_type": t, "user_id": uid, "user_type": ut})
        else:
            out.append({"access_type": t, "user_id": None, "user_type": None})
    return out


def user_matches_access_rule(user: dict, rule: dict) -> bool:
    role = user.get("role")
    t = rule.get("access_type")
    if t == "all":
        return role in ("employee", "client")
    if t == "active_employees":
        return role == "employee" and user.get("is_active") is not False
    if t == "inactive_employees":
        return role == "employee" and user.get("is_active") is False
    if t == "active_clients":
        return role == "client" and _client_status(user) == "active"
    if t == "inactive_clients":
        return role == "client" and _client_status(user) == "inactive"
    if t == "dropped_clients":
        return role == "client" and _client_status(user) == "dropped"
    if t == "specific_user":
        return user.get("id") == rule.get("user_id") and role == rule.get("user_type")
    return False


def user_can_access_folder(folder: dict, user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    if user.get("role") not in ("employee", "client"):
        return False
    rules = folder.get("access") or []
    return any(user_matches_access_rule(user, r) for r in rules)


def _mime_for_category(category: str, mime: str) -> None:
    m = (mime or "").lower()
    if category == "photos" and not m.startswith("image/"):
        raise HTTPException(status_code=400, detail="Photos category requires an image file")
    if category == "videos" and not m.startswith("video/"):
        raise HTTPException(status_code=400, detail="Videos category requires a video file")
    if category == "documents" and (m.startswith("image/") or m.startswith("video/") or m.startswith("audio/")):
        raise HTTPException(status_code=400, detail="Documents category does not accept image/video/audio")


def _access_summary(rules: List[dict], users_by_id: Dict[str, dict]) -> str:
    parts = []
    specific = 0
    for r in rules or []:
        t = r.get("access_type")
        if t == "specific_user":
            specific += 1
        elif t in ACCESS_LABELS:
            parts.append(ACCESS_LABELS[t])
    if specific:
        parts.append(f"{specific} specific")
    return ", ".join(parts) if parts else "No access"


async def _folder_item_counts(db, folder_id: str) -> Dict[str, int]:
    counts = {c: 0 for c in FOLDER_CATEGORIES}
    pipeline = [
        {"$match": {"folder_id": folder_id}},
        {"$group": {"_id": "$category", "n": {"$sum": 1}}},
    ]
    async for row in db.folder_items.aggregate(pipeline):
        cat = row.get("_id")
        if cat in counts:
            counts[cat] = int(row.get("n") or 0)
    return counts


def _serialize_item(doc: dict) -> dict:
    d = dict(doc)
    d.pop("_id", None)
    return d


async def _serialize_folder(db, folder: dict, *, include_counts: bool = True) -> dict:
    f = dict(folder)
    f.pop("_id", None)
    if include_counts:
        f["item_counts"] = await _folder_item_counts(db, f["id"])
    return f


def register_folder_routes(
    router: Any,
    db: Any,
    *,
    get_current_user: Callable,
    require_admin: Callable,
    upload_fileobj: Callable,
    delete_storage_urls: Callable,
    log_audit: Callable,
) -> None:
    """Attach folder routes to the main API router."""

    @router.get("/folders")
    async def list_accessible_folders(user: dict = Depends(get_current_user)):
        """Employees and clients: folders they can access."""
        if user.get("role") == "admin":
            raise HTTPException(status_code=403, detail="Use /admin/folders")
        cursor = db.folders.find({}).sort("created_at", -1)
        out = []
        async for doc in cursor:
            if user_can_access_folder(doc, user):
                out.append(await _serialize_folder(db, doc))
        return out

    @router.get("/folders/{folder_id}")
    async def get_accessible_folder(folder_id: str, user: dict = Depends(get_current_user)):
        doc = await db.folders.find_one({"id": folder_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Folder not found")
        if not user_can_access_folder(doc, user):
            raise HTTPException(status_code=403, detail="Access denied")
        items = []
        async for it in db.folder_items.find({"folder_id": folder_id}).sort("created_at", -1):
            items.append(_serialize_item(it))
        folder = await _serialize_folder(db, doc)
        by_cat: Dict[str, List[dict]] = {c: [] for c in FOLDER_CATEGORIES}
        for it in items:
            cat = it.get("category")
            if cat in by_cat:
                by_cat[cat].append(it)
        folder["items_by_category"] = by_cat
        return folder

    @router.get("/admin/folders")
    async def admin_list_folders(_: dict = Depends(require_admin)):
        users = {}
        async for u in db.users.find({}, {"_id": 0, "id": 1, "full_name": 1, "role": 1}):
            users[u["id"]] = u
        out = []
        async for doc in db.folders.find({}).sort("created_at", -1):
            f = await _serialize_folder(db, doc)
            f["access_summary"] = _access_summary(doc.get("access") or [], users)
            out.append(f)
        return out

    @router.post("/admin/folders")
    async def admin_create_folder(body: FolderCreateBody, admin: dict = Depends(require_admin)):
        name = (body.name or "").strip() or "New Folder"
        access = _validate_access_rules([r.model_dump() for r in body.access])
        folder_id = str(uuid.uuid4())
        now = _now_iso()
        doc = {
            "id": folder_id,
            "name": name,
            "access": access,
            "created_by": admin["id"],
            "created_at": now,
            "updated_at": now,
        }
        await db.folders.insert_one(doc)
        await log_audit(admin["id"], "folder.create", metadata={"folder_id": folder_id, "name": name})
        return await _serialize_folder(db, doc)

    @router.get("/admin/folders/{folder_id}")
    async def admin_get_folder(folder_id: str, _: dict = Depends(require_admin)):
        doc = await db.folders.find_one({"id": folder_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Folder not found")
        items = []
        async for it in db.folder_items.find({"folder_id": folder_id}).sort("created_at", -1):
            items.append(_serialize_item(it))
        folder = await _serialize_folder(db, doc)
        by_cat: Dict[str, List[dict]] = {c: [] for c in FOLDER_CATEGORIES}
        for it in items:
            cat = it.get("category")
            if cat in by_cat:
                by_cat[cat].append(it)
        folder["items_by_category"] = by_cat
        users = {}
        async for u in db.users.find(
            {"role": {"$in": ["employee", "client"]}},
            {"_id": 0, "id": 1, "full_name": 1, "username": 1, "role": 1},
        ):
            users[u["id"]] = u
        folder["access_summary"] = _access_summary(doc.get("access") or [], users)
        return folder

    @router.patch("/admin/folders/{folder_id}")
    async def admin_update_folder(
        folder_id: str,
        body: FolderUpdateBody,
        admin: dict = Depends(require_admin),
    ):
        doc = await db.folders.find_one({"id": folder_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Folder not found")
        updates: Dict[str, Any] = {"updated_at": _now_iso()}
        if body.name is not None:
            updates["name"] = (body.name or "").strip() or "New Folder"
        if body.access is not None:
            updates["access"] = _validate_access_rules([r.model_dump() for r in body.access])
        await db.folders.update_one({"id": folder_id}, {"$set": updates})
        updated = await db.folders.find_one({"id": folder_id})
        await log_audit(admin["id"], "folder.update", metadata={"folder_id": folder_id})
        return await _serialize_folder(db, updated)

    @router.delete("/admin/folders/{folder_id}")
    async def admin_delete_folder(folder_id: str, admin: dict = Depends(require_admin)):
        doc = await db.folders.find_one({"id": folder_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Folder not found")
        urls = []
        async for it in db.folder_items.find({"folder_id": folder_id}):
            u = it.get("url_or_path")
            if u and it.get("category") != "links":
                urls.append(u)
        await db.folder_items.delete_many({"folder_id": folder_id})
        await db.folders.delete_one({"id": folder_id})
        await delete_storage_urls(urls)
        await log_audit(admin["id"], "folder.delete", metadata={"folder_id": folder_id})
        return {"ok": True}

    @router.post("/admin/folders/{folder_id}/links")
    async def admin_add_link(
        folder_id: str,
        body: FolderLinkItemBody,
        admin: dict = Depends(require_admin),
    ):
        doc = await db.folders.find_one({"id": folder_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Folder not found")
        url = (body.url or "").strip()
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        title = (body.title or "").strip() or url
        item = {
            "id": str(uuid.uuid4()),
            "folder_id": folder_id,
            "category": "links",
            "title": title,
            "url_or_path": url,
            "file_size": None,
            "mime_type": None,
            "thumbnail_path": None,
            "created_at": _now_iso(),
            "uploaded_by": admin["id"],
        }
        await db.folder_items.insert_one(item)
        await db.folders.update_one({"id": folder_id}, {"$set": {"updated_at": _now_iso()}})
        return _serialize_item(item)

    @router.post("/admin/folders/{folder_id}/upload")
    async def admin_upload_folder_file(
        folder_id: str,
        category: str = Query(...),
        file: UploadFile = File(...),
        admin: dict = Depends(require_admin),
    ):
        cat = (category or "").strip().lower()
        if cat not in ("videos", "photos", "documents"):
            raise HTTPException(status_code=400, detail="category must be videos, photos, or documents")
        doc = await db.folders.find_one({"id": folder_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Folder not found")
        ext = os.path.splitext(file.filename or "")[1].lower()
        mime = (file.content_type or "").lower()
        _mime_for_category(cat, mime)
        file_id = f"{uuid.uuid4().hex}{ext}"
        key = f"uploads/folders/{folder_id}/{file_id}"
        try:
            file_url, size = await upload_fileobj(file.file, key, mime, file.filename)
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e) or "Upload failed")
        thumb = file_url if cat == "photos" else None
        title = (file.filename or "Untitled").strip()
        item = {
            "id": str(uuid.uuid4()),
            "folder_id": folder_id,
            "category": cat,
            "title": title,
            "url_or_path": file_url,
            "file_size": size,
            "mime_type": mime or None,
            "thumbnail_path": thumb,
            "created_at": _now_iso(),
            "uploaded_by": admin["id"],
        }
        await db.folder_items.insert_one(item)
        await db.folders.update_one({"id": folder_id}, {"$set": {"updated_at": _now_iso()}})
        return _serialize_item(item)

    @router.patch("/admin/folders/{folder_id}/items/{item_id}")
    async def admin_update_item(
        folder_id: str,
        item_id: str,
        body: FolderItemUpdateBody,
        admin: dict = Depends(require_admin),
    ):
        it = await db.folder_items.find_one({"id": item_id, "folder_id": folder_id})
        if not it:
            raise HTTPException(status_code=404, detail="Item not found")
        updates: Dict[str, Any] = {}
        if body.title is not None:
            updates["title"] = (body.title or "").strip() or "Untitled"
        if body.url is not None and it.get("category") == "links":
            url = (body.url or "").strip()
            if not url:
                raise HTTPException(status_code=400, detail="URL is required")
            if not url.startswith(("http://", "https://")):
                url = f"https://{url}"
            updates["url_or_path"] = url
        if updates:
            await db.folder_items.update_one({"id": item_id}, {"$set": updates})
            await db.folders.update_one({"id": folder_id}, {"$set": {"updated_at": _now_iso()}})
        updated = await db.folder_items.find_one({"id": item_id})
        return _serialize_item(updated)

    @router.delete("/admin/folders/{folder_id}/items/{item_id}")
    async def admin_delete_item(
        folder_id: str,
        item_id: str,
        admin: dict = Depends(require_admin),
    ):
        it = await db.folder_items.find_one({"id": item_id, "folder_id": folder_id})
        if not it:
            raise HTTPException(status_code=404, detail="Item not found")
        if it.get("category") != "links":
            u = it.get("url_or_path")
            if u:
                await delete_storage_urls([u])
        await db.folder_items.delete_one({"id": item_id})
        await db.folders.update_one({"id": folder_id}, {"$set": {"updated_at": _now_iso()}})
        await log_audit(admin["id"], "folder.item.delete", metadata={"folder_id": folder_id, "item_id": item_id})
        return {"ok": True}

    @router.get("/admin/folders-picker/users")
    async def admin_folder_picker_users(_: dict = Depends(require_admin)):
        """Searchable list for specific-user access picker."""
        out = []
        async for u in db.users.find(
            {"role": {"$in": ["employee", "client"]}},
            {"_id": 0, "password_hash": 0},
        ).sort("full_name", 1):
            u.pop("password_hash", None)
            if u.get("role") == "client":
                u["client_status"] = _client_status(u)
            out.append(u)
        return out
