"""
Admin reports: search users, view JSON, download PDF.
"""
from __future__ import annotations

import io
import os
import re
from datetime import date, datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx
from fastapi import Depends, HTTPException, Query
from fastapi.responses import Response

from diet_api import DIET_ENTRIES_COLLECTION, _group_entries
from folders_api import (
    _folder_created_by_id,
    _folder_created_by_type,
    _folder_item_counts,
    user_can_access_folder,
)

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        Image as RLImage,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fmt_date(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return d.strftime("%d %b %Y")
    except Exception:
        return (iso or "")[:10]


def _fmt_datetime(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return d.strftime("%d %b %Y, %H:%M")
    except Exception:
        return iso or "—"


def normalize_client_status(user: dict) -> str:
    if user.get("role") != "client":
        return "active"
    cs = (user.get("client_status") or "").strip().lower()
    if cs in ("active", "inactive", "dropped"):
        return cs
    if user.get("is_active") is False:
        return "inactive"
    return "active"


def batch_end_date_from_start(start: str) -> str:
    try:
        d = date.fromisoformat(start[:10])
        from datetime import timedelta
        return (d + timedelta(days=90)).isoformat()
    except Exception:
        return start[:10]


def enrich_batch_doc(batch: dict) -> dict:
    b = dict(batch)
    status = (b.get("status") or "active").strip().lower()
    b["status"] = status
    start = (b.get("start_date") or (b.get("created_at") or "")[:10] or date.today().isoformat())[:10]
    b["start_date"] = start
    end = (b.get("end_date") or batch_end_date_from_start(start))[:10]
    b["end_date"] = end
    days_remaining = None
    days_completed = None
    if status == "active":
        try:
            start_d = date.fromisoformat(start)
            end_d = date.fromisoformat(end)
            today = datetime.now(timezone.utc).date()
            days_completed = max(0, (today - start_d).days)
            days_remaining = max(0, (end_d - today).days)
        except ValueError:
            pass
    b["days_remaining"] = days_remaining
    b["days_completed"] = days_completed
    return b


async def _folder_counts(db, folder_id: str) -> Dict[str, int]:
    return await _folder_item_counts(db, folder_id)


def register_reports_routes(
    router: Any,
    db: Any,
    *,
    require_admin: Callable,
    upload_dir: str,
) -> None:
    upload_path = upload_dir

    async def _load_image_bytes(photo_path: str) -> Optional[bytes]:
        if not photo_path:
            return None
        if photo_path.startswith("/api/files/"):
            fid = photo_path.rsplit("/", 1)[-1]
            path = os.path.join(upload_path, fid)
            if os.path.isfile(path):
                with open(path, "rb") as f:
                    return f.read()
        if photo_path.startswith("http://") or photo_path.startswith("https://"):
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    r = await client.get(photo_path)
                    if r.status_code == 200:
                        return r.content
            except Exception:
                return None
        return None

    @router.get("/admin/reports/search")
    async def reports_search(
        q: str = Query("", min_length=0),
        _: dict = Depends(require_admin),
    ):
        term = (q or "").strip()
        if len(term) < 1:
            return []
        pattern = re.escape(term)
        rx = {"$regex": pattern, "$options": "i"}
        query = {
            "role": {"$in": ["employee", "client"]},
            "$or": [
                {"id": rx},
                {"full_name": rx},
                {"phone_number": rx},
                {"username": rx},
            ],
        }
        out = []
        async for u in db.users.find(query, {"_id": 0, "password_hash": 0}).sort("full_name", 1).limit(50):
            u.pop("password_hash", None)
            if u.get("role") == "client":
                u["client_status"] = normalize_client_status(u)
            out.append(
                {
                    "id": u["id"],
                    "full_name": u.get("full_name"),
                    "phone_number": u.get("phone_number"),
                    "email": u.get("email"),
                    "role": u.get("role"),
                    "username": u.get("username"),
                    "client_status": u.get("client_status"),
                    "is_active": u.get("is_active"),
                }
            )
        return out

    async def _employee_clients(employee_id: str) -> List[dict]:
        seen = set()
        out = []
        async for c in db.users.find({"role": "client", "employee_id": employee_id}, {"_id": 0, "password_hash": 0}):
            if c["id"] in seen:
                continue
            seen.add(c["id"])
            c["client_status"] = normalize_client_status(c)
            batch = None
            if c.get("batch_id"):
                batch = await db.batches.find_one({"id": c["batch_id"]}, {"_id": 0})
            c["batch_name"] = batch.get("name") if batch else None
            out.append(c)
        batch_ids = [
            b["id"]
            async for b in db.batches.find({"employee_id": employee_id}, {"id": 1, "_id": 0})
        ]
        if batch_ids:
            async for c in db.users.find(
                {"role": "client", "batch_id": {"$in": batch_ids}},
                {"_id": 0, "password_hash": 0},
            ):
                if c["id"] in seen:
                    continue
                seen.add(c["id"])
                c["client_status"] = normalize_client_status(c)
                batch = await db.batches.find_one({"id": c.get("batch_id")}, {"_id": 0})
                c["batch_name"] = batch.get("name") if batch else None
                out.append(c)
        out.sort(key=lambda x: (x.get("full_name") or "").lower())
        return out

    async def _build_employee_report(employee_id: str) -> dict:
        emp = await db.users.find_one({"id": employee_id, "role": "employee"}, {"_id": 0, "password_hash": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
        clients = await _employee_clients(employee_id)
        client_rows = [
            {
                "id": c["id"],
                "full_name": c.get("full_name"),
                "phone_number": c.get("phone_number"),
                "client_status": c.get("client_status"),
                "batch_name": c.get("batch_name"),
                "join_date": _fmt_date(c.get("created_at")),
            }
            for c in clients
        ]
        return {
            "type": "employee",
            "generated_at": _now_iso(),
            "personal": {
                "id": emp["id"],
                "full_name": emp.get("full_name"),
                "phone_number": emp.get("phone_number"),
                "email": emp.get("email"),
                "status": "Active" if emp.get("is_active") is not False else "Inactive",
                "join_date": _fmt_date(emp.get("created_at")),
                "avatar_url": emp.get("avatar_url"),
            },
            "clients": client_rows,
        }

    async def _client_folders_for_report(client: dict) -> dict:
        admin_folders = []
        employee_folders = []
        async for doc in db.folders.find({}).sort("name", 1):
            if not await user_can_access_folder(db, doc, client):
                continue
            counts = await _folder_counts(db, doc["id"])
            entry = {
                "id": doc["id"],
                "name": doc.get("name"),
                "item_counts": counts,
                "categories_summary": ", ".join(
                    f"{counts.get(k, 0)} {k}" for k in ("links", "videos", "photos", "documents") if counts.get(k)
                )
                or "Empty",
            }
            if _folder_created_by_type(doc) == "admin":
                admin_folders.append(entry)
            else:
                emp_id = _folder_created_by_id(doc)
                creator = await db.users.find_one({"id": emp_id}, {"full_name": 1, "_id": 0}) if emp_id else None
                entry["creator_name"] = creator.get("full_name") if creator else "Employee"
                employee_folders.append(entry)
        return {"admin_folders": admin_folders, "employee_folders": employee_folders}

    async def _build_client_report(client_id: str) -> dict:
        client = await db.users.find_one({"id": client_id, "role": "client"}, {"_id": 0, "password_hash": 0})
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        client["client_status"] = normalize_client_status(client)
        mp = client.get("medical_profile") or {}
        employee = None
        if client.get("employee_id"):
            employee = await db.users.find_one(
                {"id": client["employee_id"]},
                {"_id": 0, "id": 1, "full_name": 1, "phone_number": 1},
            )
        batch_info = None
        if client.get("batch_id"):
            batch = await db.batches.find_one({"id": client["batch_id"]}, {"_id": 0})
            if batch:
                batch_info = enrich_batch_doc(batch)
        cursor = db[DIET_ENTRIES_COLLECTION].find({"client_id": client_id}, {"_id": 0}).sort(
            [("day_number", 1), ("captured_at", 1)]
        )
        entries = [e async for e in cursor]
        diet_days = _group_entries(entries)
        folders = await _client_folders_for_report(client)
        return {
            "type": "client",
            "generated_at": _now_iso(),
            "medical": {
                "profile": mp,
                "age": mp.get("age"),
                "weight_kg": mp.get("weight_kg"),
                "height_cm": mp.get("height_cm"),
            },
            "personal": {
                "id": client["id"],
                "full_name": client.get("full_name"),
                "phone_number": client.get("phone_number"),
            },
            "assigned_employee": employee,
            "batch": batch_info,
            "diet_days": diet_days,
            "folders": folders,
        }

    @router.get("/admin/reports/employee/{user_id}")
    async def view_employee_report(user_id: str, _: dict = Depends(require_admin)):
        return await _build_employee_report(user_id)

    @router.get("/admin/reports/client/{user_id}")
    async def view_client_report(user_id: str, _: dict = Depends(require_admin)):
        return await _build_client_report(user_id)

    def _pdf_employee(report: dict) -> bytes:
        if not HAS_REPORTLAB:
            raise HTTPException(status_code=503, detail="PDF library not installed on server")
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=0.6 * inch, bottomMargin=0.6 * inch)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=16, spaceAfter=12)
        h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=6)
        body = styles["Normal"]
        story = []
        p = report["personal"]
        story.append(Paragraph("ChatFlow", title_style))
        story.append(Paragraph(f"Employee Report — {p.get('full_name') or ''} ({p.get('id')})", h2))
        story.append(Paragraph(f"Generated: {_fmt_datetime(report.get('generated_at'))}", body))
        story.append(Spacer(1, 12))
        story.append(Paragraph("Personal Info", h2))
        for line in [
            f"Name: {p.get('full_name')}",
            f"ID: {p.get('id')}",
            f"Phone: {p.get('phone_number') or '—'}",
            f"Email: {p.get('email') or '—'}",
            f"Status: {p.get('status')}",
            f"Join date: {p.get('join_date')}",
        ]:
            story.append(Paragraph(line, body))
        story.append(Spacer(1, 12))
        story.append(Paragraph("Clients Under This Employee", h2))
        rows = [["Name", "ID", "Phone", "Status", "Batch", "Joined"]]
        for c in report.get("clients") or []:
            rows.append([
                c.get("full_name") or "",
                c.get("id") or "",
                c.get("phone_number") or "",
                c.get("client_status") or "",
                c.get("batch_name") or "—",
                c.get("join_date") or "",
            ])
        tbl = Table(rows, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#064e3b")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ]))
        story.append(tbl)
        doc.build(story)
        return buf.getvalue()

    async def _pdf_client(report: dict) -> bytes:
        if not HAS_REPORTLAB:
            raise HTTPException(status_code=503, detail="PDF library not installed on server")
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=0.5 * inch, bottomMargin=0.5 * inch)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=16, spaceAfter=10)
        h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=6)
        body = styles["Normal"]
        story = []
        story.append(Paragraph("ChatFlow", title_style))
        story.append(Paragraph(
            f"Client Report — {report.get('personal', {}).get('full_name', '')} "
            f"({report.get('personal', {}).get('id', '')})",
            h2,
        ))
        story.append(Paragraph(f"Generated: {_fmt_datetime(report.get('generated_at'))}", body))
        story.append(Spacer(1, 10))
        story.append(Paragraph("Medical Info", h2))
        mp = report.get("medical", {}).get("profile") or {}
        for k, label in [
            ("medical_conditions", "Conditions"),
            ("allergies", "Allergies"),
            ("current_medications", "Medications"),
            ("remarks", "Notes"),
        ]:
            if mp.get(k):
                story.append(Paragraph(f"{label}: {mp[k]}", body))
        story.append(Paragraph(
            f"Age: {mp.get('age') or '—'} | Weight: {mp.get('weight_kg') or '—'} kg | Height: {mp.get('height_cm') or '—'} cm",
            body,
        ))
        emp = report.get("assigned_employee")
        story.append(Paragraph("Assigned Employee", h2))
        if emp:
            story.append(Paragraph(
                f"{emp.get('full_name')} | {emp.get('id')} | {emp.get('phone_number') or '—'}",
                body,
            ))
        else:
            story.append(Paragraph("Not assigned", body))
        batch = report.get("batch")
        story.append(Paragraph("Batch Info", h2))
        if batch:
            story.append(Paragraph(
                f"{batch.get('name')} | {batch.get('status')} | Start: {batch.get('start_date')} | "
                f"End: {batch.get('end_date')} | Completed: {batch.get('days_completed')} days | "
                f"Remaining: {batch.get('days_remaining')} days",
                body,
            ))
        else:
            story.append(Paragraph("No batch", body))
        story.append(Paragraph("Diet Log", h2))
        for day in report.get("diet_days") or []:
            story.append(Paragraph(
                f"Day {day.get('day_number')} — {_fmt_date(day.get('entry_date'))}",
                h2,
            ))
            for photo in day.get("photos") or []:
                story.append(Paragraph(
                    f"  {_fmt_datetime(photo.get('captured_at') or photo.get('uploaded_at'))}",
                    body,
                ))
                data = await _load_image_bytes(photo.get("photo_path") or "")
                if data:
                    try:
                        img = RLImage(io.BytesIO(data), width=2.8 * inch, height=2.1 * inch)
                        story.append(img)
                    except Exception:
                        story.append(Paragraph("  [image unavailable]", body))
                story.append(Spacer(1, 6))
        story.append(Paragraph("Folder Access — Admin", h2))
        for f in (report.get("folders") or {}).get("admin_folders") or []:
            story.append(Paragraph(f"{f.get('name')} — {f.get('categories_summary')}", body))
        story.append(Paragraph("Folder Access — Employee", h2))
        for f in (report.get("folders") or {}).get("employee_folders") or []:
            story.append(Paragraph(
                f"{f.get('name')} ({f.get('creator_name', '')}) — {f.get('categories_summary')}",
                body,
            ))
        doc.build(story)
        return buf.getvalue()

    @router.get("/admin/reports/employee/{user_id}/pdf")
    async def download_employee_pdf(user_id: str, _: dict = Depends(require_admin)):
        report = await _build_employee_report(user_id)
        pdf = _pdf_employee(report)
        name = (report["personal"].get("full_name") or "employee").replace(" ", "_")
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="report_{name}_{user_id}.pdf"'},
        )

    @router.get("/admin/reports/client/{user_id}/pdf")
    async def download_client_pdf(user_id: str, _: dict = Depends(require_admin)):
        report = await _build_client_report(user_id)
        pdf = await _pdf_client(report)
        name = (report["personal"].get("full_name") or "client").replace(" ", "_")
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="report_{name}_{user_id}.pdf"'},
        )
