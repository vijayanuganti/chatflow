"""
Media library / folder management API (admin + employee create, employee/client view).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

ADMIN_FOLDER_ACCESS_TYPES = frozenset({
    "all",
    "active_employees",
    "inactive_employees",
    "active_clients",
    "inactive_clients",
    "dropped_clients",
    "specific_user",
})

EMPLOYEE_FOLDER_ACCESS_TYPES = frozenset({
    "all_clients",
    "active_clients",
    "inactive_clients",
    "dropped_clients",
    "specific_client",
})

FOLDER_ACCESS_TYPES = ADMIN_FOLDER_ACCESS_TYPES | EMPLOYEE_FOLDER_ACCESS_TYPES

FOLDER_CATEGORIES = frozenset({"links", "videos", "photos", "documents"})

ADMIN_ACCESS_LABELS = {
    "all": "All",
    "active_employees": "Active Employees",
    "inactive_employees": "Inactive Employees",
    "active_clients": "Active Clients",
    "inactive_clients": "Inactive Clients",
    "dropped_clients": "Dropped Clients",
    "specific_user": "Specific user",
}

EMPLOYEE_ACCESS_LABELS = {
    "all_clients": "All Clients",
    "active_clients": "Active Clients",
    "inactive_clients": "Inactive Clients",
    "dropped_clients": "Dropped Clients",
    "specific_client": "Specific client",
}

ACCESS_LABELS = {**ADMIN_ACCESS_LABELS, **EMPLOYEE_ACCESS_LABELS}


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


def _folder_created_by_type(folder: dict) -> str:
    t = (folder.get("created_by_type") or "").strip().lower()
    if t in ("admin", "employee"):
        return t
    return "admin"


def _folder_created_by_id(folder: dict) -> Optional[str]:
    return folder.get("created_by_id") or folder.get("created_by")


def _validate_admin_access_rules(rules: List[dict]) -> List[dict]:
    if not rules:
        raise HTTPException(status_code=400, detail="At least one access rule is required")
    out = []
    for r in rules:
        t = (r.get("access_type") or "").strip().lower()
        if t not in ADMIN_FOLDER_ACCESS_TYPES:
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


async def _validate_employee_access_rules(db, employee_id: str, rules: List[dict]) -> List[dict]:
    if not rules:
        raise HTTPException(status_code=400, detail="At least one access rule is required")
    out = []
    for r in rules:
        t = (r.get("access_type") or "").strip().lower()
        if t not in EMPLOYEE_FOLDER_ACCESS_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid access_type: {t}")
        if t == "specific_client":
            uid = (r.get("user_id") or "").strip()
            if not uid:
                raise HTTPException(status_code=400, detail="specific_client requires user_id")
            if not await _client_belongs_to_employee(db, uid, employee_id):
                raise HTTPException(status_code=400, detail="Client is not assigned to you")
            out.append({"access_type": t, "user_id": uid, "user_type": "client"})
        else:
            out.append({"access_type": t, "user_id": None, "user_type": None})
    return out


async def _client_belongs_to_employee(db, client_id: str, employee_id: str) -> bool:
    client = await db.users.find_one({"id": client_id, "role": "client"}, {"_id": 0, "employee_id": 1, "batch_id": 1})
    if not client:
        return False
    if client.get("employee_id") == employee_id:
        return True
    bid = client.get("batch_id")
    if not bid:
        return False
    batch = await db.batches.find_one({"id": bid}, {"_id": 0, "employee_id": 1})
    return bool(batch and batch.get("employee_id") == employee_id)


def user_matches_admin_access_rule(user: dict, rule: dict) -> bool:
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


async def user_matches_employee_access_rule(db, user: dict, rule: dict, folder: dict) -> bool:
    if user.get("role") != "client":
        return False
    emp_id = _folder_created_by_id(folder)
    if not emp_id or not await _client_belongs_to_employee(db, user["id"], emp_id):
        return False
    t = rule.get("access_type")
    if t == "all_clients":
        return True
    if t == "active_clients":
        return _client_status(user) == "active"
    if t == "inactive_clients":
        return _client_status(user) == "inactive"
    if t == "dropped_clients":
        return _client_status(user) == "dropped"
    if t == "specific_client":
        return user.get("id") == rule.get("user_id")
    return False


async def user_can_access_folder(db, folder: dict, user: dict) -> bool:
    if user.get("role") == "admin":
        return True
    if user.get("role") not in ("employee", "client"):
        return False
    ctype = _folder_created_by_type(folder)
    rules = folder.get("access") or []
    if ctype == "admin":
        return any(user_matches_admin_access_rule(user, r) for r in rules)
    if ctype == "employee":
        if user.get("role") == "employee":
            return _folder_created_by_id(folder) == user.get("id")
        for r in rules:
            if await user_matches_employee_access_rule(db, user, r, folder):
                return True
        return False
    return False


def folder_can_edit(folder: dict, user: dict) -> bool:
    if user.get("role") == "admin":
        return _folder_created_by_type(folder) == "admin"
    if user.get("role") == "employee":
        return (
            _folder_created_by_type(folder) == "employee"
            and _folder_created_by_id(folder) == user.get("id")
        )
    return False


def folder_view_only(folder: dict, user: dict) -> bool:
    if user.get("role") == "client":
        return True
    if user.get("role") == "employee":
        return _folder_created_by_type(folder) == "admin"
    return False


def _access_summary(rules: List[dict], users_by_id: Dict[str, dict], *, employee_folder: bool = False) -> str:
    parts = []
    specific = 0
    labels = EMPLOYEE_ACCESS_LABELS if employee_folder else ADMIN_ACCESS_LABELS
    for r in rules or []:
        t = r.get("access_type")
        if t in ("specific_user", "specific_client"):
            specific += 1
        elif t in labels:
            parts.append(labels[t])
    if specific:
        parts.append(f"{specific} specific")
    return ", ".join(parts) if parts else "No access"


_VIDEO_EXTS = frozenset({".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".mpeg", ".mpg"})
_IMAGE_EXTS = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif"})


def _mime_for_category(category: str, mime: str, filename: str = "") -> None:
    m = (mime or "").lower()
    ext = os.path.splitext(filename or "")[1].lower()
    if category == "photos":
        if m.startswith("image/") or ext in _IMAGE_EXTS:
            return
        raise HTTPException(status_code=400, detail="Photos category requires an image file")
    if category == "videos":
        if m.startswith("video/") or ext in _VIDEO_EXTS:
            return
        raise HTTPException(status_code=400, detail="Videos category requires a video file")
    if category == "documents":
        if m.startswith("image/") or m.startswith("video/") or m.startswith("audio/"):
            if ext not in (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"):
                raise HTTPException(
                    status_code=400,
                    detail="Documents category does not accept image/video/audio",
                )
        return


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


async def _creator_display_name(db, folder: dict, users_by_id: Dict[str, dict]) -> str:
    ctype = _folder_created_by_type(folder)
    cid = _folder_created_by_id(folder)
    if ctype == "admin":
        return "Shared by Admin"
    u = users_by_id.get(cid or "")
    if u:
        return f"Shared by {u.get('full_name') or 'Employee'}"
    if cid:
        doc = await db.users.find_one({"id": cid}, {"_id": 0, "full_name": 1})
        if doc:
            return f"Shared by {doc.get('full_name') or 'Employee'}"
    return "Shared by Employee"


async def _enrich_folder_for_user(
    db,
    folder: dict,
    user: dict,
    users_by_id: Optional[Dict[str, dict]] = None,
) -> dict:
    users_by_id = users_by_id or {}
    f = await _serialize_folder(db, folder)
    ctype = _folder_created_by_type(folder)
    f["created_by_type"] = ctype
    f["created_by_id"] = _folder_created_by_id(folder)
    f["creator_label"] = await _creator_display_name(db, folder, users_by_id)
    f["can_edit"] = folder_can_edit(folder, user)
    f["view_only"] = folder_view_only(folder, user)
    is_emp = ctype == "employee"
    f["access_summary"] = _access_summary(folder.get("access") or [], users_by_id, employee_folder=is_emp)
    return f


async def _folder_detail_payload(db, folder: dict, user: dict) -> dict:
    folder_id = folder["id"]
    items = []
    async for it in db.folder_items.find({"folder_id": folder_id}).sort("created_at", -1):
        items.append(_serialize_item(it))
    users = {}
    async for u in db.users.find(
        {"role": {"$in": ["employee", "client"]}},
        {"_id": 0, "id": 1, "full_name": 1, "username": 1, "role": 1},
    ):
        users[u["id"]] = u
    out = await _enrich_folder_for_user(db, folder, user, users)
    by_cat: Dict[str, List[dict]] = {c: [] for c in FOLDER_CATEGORIES}
    for it in items:
        cat = it.get("category")
        if cat in by_cat:
            by_cat[cat].append(it)
    out["items_by_category"] = by_cat
    return out


async def migrate_folders_schema(db) -> None:
    """Backfill created_by_type / created_by_id on legacy folder documents."""
    async for doc in db.folders.find({"created_by_type": {"$exists": False}}):
        updates = {
            "created_by_type": "admin",
            "created_by_id": doc.get("created_by") or doc.get("created_by_id"),
        }
        await db.folders.update_one({"id": doc["id"]}, {"$set": updates})


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

    async def _require_employee(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") != "employee":
            raise HTTPException(status_code=403, detail="Employees only")
        return user

    async def _get_folder_or_404(folder_id: str) -> dict:
        doc = await db.folders.find_one({"id": folder_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Folder not found")
        return doc

    async def _require_folder_access(folder_id: str, user: dict) -> dict:
        doc = await _get_folder_or_404(folder_id)
        if not await user_can_access_folder(db, doc, user):
            raise HTTPException(status_code=403, detail="Access denied")
        return doc

    async def _require_employee_own_folder(folder_id: str, user: dict) -> dict:
        doc = await _require_folder_access(folder_id, user)
        if _folder_created_by_type(doc) != "employee" or _folder_created_by_id(doc) != user["id"]:
            raise HTTPException(status_code=403, detail="You can only modify your own folders")
        return doc

    @router.get("/folders")
    async def list_accessible_folders(user: dict = Depends(get_current_user)):
        """Employees and clients: folders split by source (admin vs employee)."""
        if user.get("role") == "admin":
            raise HTTPException(status_code=403, detail="Use /admin/folders")
        role = user.get("role")
        if role not in ("employee", "client"):
            raise HTTPException(status_code=403, detail="Not allowed")

        users = {}
        async for u in db.users.find(
            {"role": {"$in": ["employee", "client"]}},
            {"_id": 0, "id": 1, "full_name": 1},
        ):
            users[u["id"]] = u

        admin_media: List[dict] = []
        employee_media: List[dict] = []
        my_folders: List[dict] = []

        async for doc in db.folders.find({}).sort("created_at", -1):
            if not await user_can_access_folder(db, doc, user):
                continue
            ctype = _folder_created_by_type(doc)
            enriched = await _enrich_folder_for_user(db, doc, user, users)
            if role == "client":
                if ctype == "admin":
                    admin_media.append(enriched)
                else:
                    employee_media.append(enriched)
            elif role == "employee":
                if ctype == "admin":
                    admin_media.append(enriched)
                elif _folder_created_by_id(doc) == user["id"]:
                    my_folders.append(enriched)

        if role == "client":
            return {"admin_media": admin_media, "employee_media": employee_media}
        return {"admin_media": admin_media, "my_folders": my_folders}

    @router.get("/folders/{folder_id}")
    async def get_accessible_folder(folder_id: str, user: dict = Depends(get_current_user)):
        doc = await _require_folder_access(folder_id, user)
        return await _folder_detail_payload(db, doc, user)

    @router.get("/employee/folders-picker/clients")
    async def employee_folder_picker_clients(user: dict = Depends(_require_employee)):
        """Clients assigned to this employee (direct or via batch)."""
        emp_id = user["id"]
        seen = set()
        out = []
        async for u in db.users.find({"role": "client"}, {"_id": 0, "password_hash": 0}).sort("full_name", 1):
            cid = u["id"]
            if cid in seen:
                continue
            if await _client_belongs_to_employee(db, cid, emp_id):
                seen.add(cid)
                u["client_status"] = _client_status(u)
                out.append(u)
        return out

    @router.post("/employee/folders")
    async def employee_create_folder(body: FolderCreateBody, user: dict = Depends(_require_employee)):
        name = (body.name or "").strip() or "New Folder"
        access = await _validate_employee_access_rules(
            db, user["id"], [r.model_dump() for r in body.access]
        )
        folder_id = str(uuid.uuid4())
        now = _now_iso()
        doc = {
            "id": folder_id,
            "name": name,
            "access": access,
            "created_by": user["id"],
            "created_by_type": "employee",
            "created_by_id": user["id"],
            "created_at": now,
            "updated_at": now,
        }
        await db.folders.insert_one(doc)
        await log_audit(user["id"], "folder.create", metadata={"folder_id": folder_id, "name": name})
        return await _enrich_folder_for_user(db, doc, user)

    @router.patch("/employee/folders/{folder_id}")
    async def employee_update_folder(
        folder_id: str,
        body: FolderUpdateBody,
        user: dict = Depends(_require_employee),
    ):
        doc = await _require_employee_own_folder(folder_id, user)
        updates: Dict[str, Any] = {"updated_at": _now_iso()}
        if body.name is not None:
            updates["name"] = (body.name or "").strip() or "New Folder"
        if body.access is not None:
            updates["access"] = await _validate_employee_access_rules(
                db, user["id"], [r.model_dump() for r in body.access]
            )
        await db.folders.update_one({"id": folder_id}, {"$set": updates})
        updated = await db.folders.find_one({"id": folder_id})
        await log_audit(user["id"], "folder.update", metadata={"folder_id": folder_id})
        return await _enrich_folder_for_user(db, updated, user)

    @router.delete("/employee/folders/{folder_id}")
    async def employee_delete_folder(folder_id: str, user: dict = Depends(_require_employee)):
        doc = await _require_employee_own_folder(folder_id, user)
        urls = []
        async for it in db.folder_items.find({"folder_id": folder_id}):
            u = it.get("url_or_path")
            if u and it.get("category") != "links":
                urls.append(u)
        await db.folder_items.delete_many({"folder_id": folder_id})
        await db.folders.delete_one({"id": folder_id})
        await delete_storage_urls(urls)
        await log_audit(user["id"], "folder.delete", metadata={"folder_id": folder_id})
        return {"ok": True}

    @router.post("/employee/folders/{folder_id}/links")
    async def employee_add_link(
        folder_id: str,
        body: FolderLinkItemBody,
        user: dict = Depends(_require_employee),
    ):
        await _require_employee_own_folder(folder_id, user)
        return await _add_folder_link(db, folder_id, body, user["id"])

    @router.post("/employee/folders/{folder_id}/upload")
    async def employee_upload_folder_file(
        folder_id: str,
        category: str = Query(...),
        file: UploadFile = File(...),
        user: dict = Depends(_require_employee),
    ):
        await _require_employee_own_folder(folder_id, user)
        return await _upload_folder_file(db, folder_id, category, file, user["id"], upload_fileobj)

    @router.patch("/employee/folders/{folder_id}/items/{item_id}")
    async def employee_update_item(
        folder_id: str,
        item_id: str,
        body: FolderItemUpdateBody,
        user: dict = Depends(_require_employee),
    ):
        await _require_employee_own_folder(folder_id, user)
        return await _update_folder_item(db, folder_id, item_id, body)

    @router.delete("/employee/folders/{folder_id}/items/{item_id}")
    async def employee_delete_item(
        folder_id: str,
        item_id: str,
        user: dict = Depends(_require_employee),
    ):
        await _require_employee_own_folder(folder_id, user)
        return await _delete_folder_item(db, folder_id, item_id, delete_storage_urls, log_audit, user["id"])

    @router.get("/admin/folders")
    async def admin_list_folders(_: dict = Depends(require_admin)):
        users = {}
        async for u in db.users.find({}, {"_id": 0, "id": 1, "full_name": 1, "role": 1}):
            users[u["id"]] = u
        out = []
        async for doc in db.folders.find({}).sort("created_at", -1):
            f = await _serialize_folder(db, doc)
            is_emp = _folder_created_by_type(doc) == "employee"
            f["created_by_type"] = _folder_created_by_type(doc)
            f["created_by_id"] = _folder_created_by_id(doc)
            f["creator_label"] = await _creator_display_name(db, doc, users)
            f["access_summary"] = _access_summary(doc.get("access") or [], users, employee_folder=is_emp)
            out.append(f)
        return out

    @router.post("/admin/folders")
    async def admin_create_folder(body: FolderCreateBody, admin: dict = Depends(require_admin)):
        name = (body.name or "").strip() or "New Folder"
        access = _validate_admin_access_rules([r.model_dump() for r in body.access])
        folder_id = str(uuid.uuid4())
        now = _now_iso()
        doc = {
            "id": folder_id,
            "name": name,
            "access": access,
            "created_by": admin["id"],
            "created_by_type": "admin",
            "created_by_id": admin["id"],
            "created_at": now,
            "updated_at": now,
        }
        await db.folders.insert_one(doc)
        await log_audit(admin["id"], "folder.create", metadata={"folder_id": folder_id, "name": name})
        return await _serialize_folder(db, doc)

    @router.get("/admin/folders/{folder_id}")
    async def admin_get_folder(folder_id: str, admin: dict = Depends(require_admin)):
        doc = await _get_folder_or_404(folder_id)
        return await _folder_detail_payload(db, doc, admin)

    @router.patch("/admin/folders/{folder_id}")
    async def admin_update_folder(
        folder_id: str,
        body: FolderUpdateBody,
        admin: dict = Depends(require_admin),
    ):
        doc = await _get_folder_or_404(folder_id)
        if _folder_created_by_type(doc) == "employee":
            raise HTTPException(status_code=403, detail="Cannot edit employee-owned folders here")
        updates: Dict[str, Any] = {"updated_at": _now_iso()}
        if body.name is not None:
            updates["name"] = (body.name or "").strip() or "New Folder"
        if body.access is not None:
            updates["access"] = _validate_admin_access_rules([r.model_dump() for r in body.access])
        await db.folders.update_one({"id": folder_id}, {"$set": updates})
        updated = await db.folders.find_one({"id": folder_id})
        await log_audit(admin["id"], "folder.update", metadata={"folder_id": folder_id})
        return await _folder_detail_payload(db, updated, admin)

    @router.delete("/admin/folders/{folder_id}")
    async def admin_delete_folder(folder_id: str, admin: dict = Depends(require_admin)):
        doc = await _get_folder_or_404(folder_id)
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
        doc = await _get_folder_or_404(folder_id)
        if _folder_created_by_type(doc) == "employee":
            raise HTTPException(status_code=403, detail="Use employee folder management for this folder")
        return await _add_folder_link(db, folder_id, body, admin["id"])

    @router.post("/admin/folders/{folder_id}/upload")
    async def admin_upload_folder_file(
        folder_id: str,
        category: str = Query(...),
        file: UploadFile = File(...),
        admin: dict = Depends(require_admin),
    ):
        doc = await _get_folder_or_404(folder_id)
        if _folder_created_by_type(doc) == "employee":
            raise HTTPException(status_code=403, detail="Use employee folder management for this folder")
        return await _upload_folder_file(db, folder_id, category, file, admin["id"], upload_fileobj)

    @router.patch("/admin/folders/{folder_id}/items/{item_id}")
    async def admin_update_item(
        folder_id: str,
        item_id: str,
        body: FolderItemUpdateBody,
        admin: dict = Depends(require_admin),
    ):
        await _get_folder_or_404(folder_id)
        return await _update_folder_item(db, folder_id, item_id, body)

    @router.delete("/admin/folders/{folder_id}/items/{item_id}")
    async def admin_delete_item(
        folder_id: str,
        item_id: str,
        admin: dict = Depends(require_admin),
    ):
        await _get_folder_or_404(folder_id)
        return await _delete_folder_item(db, folder_id, item_id, delete_storage_urls, log_audit, admin["id"])

    @router.get("/admin/folders-picker/users")
    async def admin_folder_picker_users(_: dict = Depends(require_admin)):
        out = []
        async for u in db.users.find(
            {"role": {"$in": ["employee", "client"]}},
            {"_id": 0, "password_hash": 0},
        ).sort("full_name", 1):
            if u.get("role") == "client":
                u["client_status"] = _client_status(u)
            out.append(u)
        return out


async def _add_folder_link(db, folder_id: str, body: FolderLinkItemBody, uploaded_by: str) -> dict:
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
        "uploaded_by": uploaded_by,
    }
    await db.folder_items.insert_one(item)
    await db.folders.update_one({"id": folder_id}, {"$set": {"updated_at": _now_iso()}})
    return _serialize_item(item)


async def _upload_folder_file(
    db,
    folder_id: str,
    category: str,
    file: UploadFile,
    uploaded_by: str,
    upload_fileobj: Callable,
) -> dict:
    cat = (category or "").strip().lower()
    if cat not in ("videos", "photos", "documents"):
        raise HTTPException(status_code=400, detail="category must be videos, photos, or documents")
    ext = os.path.splitext(file.filename or "")[1].lower()
    mime = (file.content_type or "").lower()
    _mime_for_category(cat, mime, file.filename or "")
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
        "uploaded_by": uploaded_by,
    }
    await db.folder_items.insert_one(item)
    await db.folders.update_one({"id": folder_id}, {"$set": {"updated_at": _now_iso()}})
    return _serialize_item(item)


async def _update_folder_item(db, folder_id: str, item_id: str, body: FolderItemUpdateBody) -> dict:
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


async def _delete_folder_item(
    db,
    folder_id: str,
    item_id: str,
    delete_storage_urls: Callable,
    log_audit: Callable,
    actor_id: str,
) -> dict:
    it = await db.folder_items.find_one({"id": item_id, "folder_id": folder_id})
    if not it:
        raise HTTPException(status_code=404, detail="Item not found")
    if it.get("category") != "links":
        u = it.get("url_or_path")
        if u:
            await delete_storage_urls([u])
    await db.folder_items.delete_one({"id": item_id})
    await db.folders.update_one({"id": folder_id}, {"$set": {"updated_at": _now_iso()}})
    await log_audit(actor_id, "folder.item.delete", metadata={"folder_id": folder_id, "item_id": item_id})
    return {"ok": True}
