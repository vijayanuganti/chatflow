"""
Minimal professional PDF layouts for Admin Employee / Client reports (ReportLab).
"""
from __future__ import annotations

import io
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    Flowable,
    Image as RLImage,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ChatFlow brand primary (HSL 162 87% 17% → #064e3b)
COMPANY = colors.HexColor("#064e3b")
TEXT_PRIMARY = colors.HexColor("#1A1A2E")
TEXT_MUTED = colors.HexColor("#6B7280")
BORDER = colors.HexColor("#E5E7EB")
ROW_ALT = colors.HexColor("#F9FAFB")
TABLE_HEADER_BG = colors.HexColor("#F3F4F6")
WHITE = colors.white

DOT_ACTIVE = "#16A34A"
DOT_INACTIVE = "#9CA3AF"
DOT_DROPPED = "#4B5563"

STATUS_VALUE_COLORS = {
    "active": colors.HexColor(DOT_ACTIVE),
    "inactive": TEXT_MUTED,
    "dropped": colors.HexColor(DOT_DROPPED),
}

PAGE_W, PAGE_H = A4
MARGIN_L = 45 * 0.75
MARGIN_R = 45 * 0.75
MARGIN_T = 40 * 0.75
MARGIN_B = 50 * 0.75
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R
FOOTER_H = 30
SECTION_GAP = 22
BANNER_H = 68


def _escape_xml(text: Any) -> str:
    if text is None:
        return ""
    s = str(text)
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _fmt_date(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return d.strftime("%d %b %Y")
    except Exception:
        return str(iso)[:10]


def _fmt_datetime(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return d.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return str(iso)


def _fmt_time(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return d.strftime("%I:%M %p")
    except Exception:
        return str(iso)


def _register_fonts() -> Tuple[str, str, str]:
    """Prefer Inter/Poppins if bundled, else DejaVu, else Helvetica."""
    base = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        (os.path.join(base, "fonts", "Inter-Regular.ttf"), "Inter", False),
        (os.path.join(base, "fonts", "Inter-Bold.ttf"), "Inter-Bold", True),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu", False),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVu-Bold", True),
    ]
    registered: Dict[str, str] = {}
    for path, name, _ in candidates:
        if os.path.isfile(path) and name not in registered:
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                registered[name] = path
            except Exception:
                pass
    if "Inter" in registered:
        bold = "Inter-Bold" if "Inter-Bold" in registered else "Inter"
        return "Inter", bold, "Inter"
    if "DejaVu" in registered:
        bold = "DejaVu-Bold" if "DejaVu-Bold" in registered else "DejaVu"
        return "DejaVu", bold, "DejaVu"
    return "Helvetica", "Helvetica-Bold", "Helvetica"


FONT, FONT_BOLD, FONT_REG = _register_fonts()


def _status_dot_html(status: str) -> str:
    st = (status or "active").lower()
    dot = {"active": DOT_ACTIVE, "inactive": DOT_INACTIVE, "dropped": DOT_DROPPED}.get(st, DOT_ACTIVE)
    label = status.title() if status else "—"
    return f'<font color="{dot}">●</font> <font color="#1A1A2E">{_escape_xml(label)}</font>'


def _styles() -> Dict[str, ParagraphStyle]:
    return {
        "banner_title": ParagraphStyle(
            "banner_title",
            fontName=FONT_BOLD,
            fontSize=22,
            textColor=WHITE,
            leading=26,
        ),
        "banner_meta": ParagraphStyle(
            "banner_meta",
            fontName=FONT_REG,
            fontSize=9,
            textColor=WHITE,
            alignment=TA_RIGHT,
            leading=12,
        ),
        "banner_meta_fade": ParagraphStyle(
            "banner_meta_fade",
            fontName=FONT_REG,
            fontSize=8,
            textColor=colors.Color(1, 1, 1, alpha=0.7),
            alignment=TA_RIGHT,
            leading=11,
        ),
        "name": ParagraphStyle(
            "name",
            fontName=FONT_BOLD,
            fontSize=18,
            textColor=TEXT_PRIMARY,
            leading=22,
        ),
        "stat_num": ParagraphStyle(
            "stat_num",
            fontName=FONT_BOLD,
            fontSize=16,
            textColor=COMPANY,
            alignment=TA_CENTER,
            leading=18,
        ),
        "stat_lbl": ParagraphStyle(
            "stat_lbl",
            fontName=FONT_REG,
            fontSize=8,
            textColor=TEXT_MUTED,
            alignment=TA_CENTER,
            leading=10,
        ),
        "section": ParagraphStyle(
            "section",
            fontName=FONT_BOLD,
            fontSize=11,
            textColor=COMPANY,
            leading=14,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            fontName=FONT_REG,
            fontSize=10,
            textColor=TEXT_PRIMARY,
            leading=13,
        ),
        "body_semibold": ParagraphStyle(
            "body_semibold",
            fontName=FONT_BOLD,
            fontSize=10,
            textColor=TEXT_PRIMARY,
            leading=13,
        ),
        "muted": ParagraphStyle(
            "muted",
            fontName=FONT_REG,
            fontSize=9,
            textColor=TEXT_MUTED,
            leading=11,
        ),
        "italic_muted": ParagraphStyle(
            "italic_muted",
            fontName=FONT_REG,
            fontSize=9,
            textColor=TEXT_MUTED,
            fontStyle="italic",
            leading=11,
        ),
        "day_title": ParagraphStyle(
            "day_title",
            fontName=FONT_BOLD,
            fontSize=11,
            textColor=COMPANY,
            leading=14,
        ),
    }


class Page1Banner(Flowable):
    """Full-width header banner (page 1 content only)."""

    def __init__(self, meta: dict, styles: dict, width: float = CONTENT_W):
        self.meta = meta
        self.styles = styles
        self.width = width
        self.height = BANNER_H

    def wrap(self, aW, aH):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        c.setFillColor(COMPANY)
        c.rect(0, 0, self.width, self.height, fill=1, stroke=0)

        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD, 22)
        c.drawString(0, self.height - 36, "ChatFlow")

        gen = _fmt_datetime(self.meta.get("generated_at"))
        rid = self.meta.get("report_id") or str(uuid.uuid4())[:8].upper()
        c.setFont(FONT_REG, 9)
        c.drawRightString(self.width, self.height - 28, f"Generated: {gen}")
        c.setFillColor(colors.Color(1, 1, 1, alpha=0.7))
        c.setFont(FONT_REG, 8)
        c.drawRightString(self.width, self.height - 42, f"Report ID: #{rid}")

        c.setStrokeColor(colors.Color(1, 1, 1, alpha=0.2))
        c.setLineWidth(1)
        c.line(0, 0, self.width, 0)


class HRule(Flowable):
    def __init__(self, width: float, color=BORDER, thickness: float = 1):
        self.width = width
        self.color = color
        self.thickness = thickness
        self.height = thickness + 2

    def wrap(self, aW, aH):
        return (aW, self.height)

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 1, self.width, 1)


def _section(title: str, styles: dict) -> List[Any]:
    return [
        Paragraph(_escape_xml(title.upper()), styles["section"]),
        HRule(CONTENT_W),
        Spacer(1, 10),
    ]


def _initials_avatar(name: str, size: float = 55) -> Table:
    initials = "".join(p[0].upper() for p in (name or "U").split()[:2])[:2] or "U"
    t = Table(
        [[Paragraph(
            f'<para align="center"><font color="white" size="14"><b>{_escape_xml(initials)}</b></font></para>',
            ParagraphStyle("av", fontName=FONT_BOLD, fontSize=14, alignment=TA_CENTER, textColor=WHITE),
        )]],
        colWidths=[size],
        rowHeights=[size],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COMPANY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROUNDEDCORNERS", [28, 28, 28, 28]),
    ]))
    return t


def _profile_photo_flowable(
    avatar_url: Optional[str], load_image: Callable, name: str, size: float = 55
) -> Any:
    data = None
    if avatar_url and callable(load_image):
        try:
            data = load_image(avatar_url)
        except Exception:
            data = None
    if not data:
        return _initials_avatar(name, size)
    try:
        img = RLImage(io.BytesIO(data), width=size, height=size)
        img.hAlign = "CENTER"
        return img
    except Exception:
        return _initials_avatar(name, size)


def _role_badge(role: str) -> Table:
    label = "Employee" if role == "employee" else "Client"
    t = Table([[Paragraph(
        f'<font color="white" size="8"><b>{label}</b></font>',
        ParagraphStyle("badge", fontName=FONT_BOLD, fontSize=8, textColor=WHITE, alignment=TA_CENTER),
    )]])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COMPANY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [10, 10, 10, 10]),
    ]))
    return t


def _stat_box(label: str, value: str, styles: dict) -> Table:
    t = Table([
        [Paragraph(_escape_xml(str(value)), styles["stat_num"])],
        [Paragraph(_escape_xml(label), styles["stat_lbl"])],
    ], colWidths=[1.5 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 1, BORDER),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _profile_block(
    name: str,
    user_id: str,
    role: str,
    stats: List[Tuple[str, str]],
    avatar_flowable: Any,
    styles: dict,
) -> Table:
    id_para = Paragraph(f"ID: {_escape_xml(user_id)}", styles["muted"])
    info = Table([
        [Paragraph(_escape_xml(name), styles["name"])],
        [_role_badge(role)],
        [id_para],
    ])
    info.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))
    stat_cells = [[_stat_box(lbl, val, styles)] for lbl, val in stats[:3]]
    while len(stat_cells) < 3:
        stat_cells.append([Spacer(1, 1)])
    stats_row = Table([stat_cells], colWidths=[1.65 * inch] * 3)
    stats_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    row = Table([[avatar_flowable, info, stats_row]], colWidths=[0.8 * inch, 2.35 * inch, 3.55 * inch])
    row.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 20),
        ("RIGHTPADDING", (0, 0), (-1, -1), 20),
        ("TOPPADDING", (0, 0), (-1, -1), 20),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 20),
        ("LINEBELOW", (0, 0), (-1, -1), 1, BORDER),
    ]))
    return row


def _kv_grid(rows: List[Tuple[str, str]], styles: dict, status_keys: Optional[set] = None) -> Table:
    status_keys = status_keys or set()
    data = []
    for label, value in rows:
        if label.lower() == "status" or label in status_keys:
            val_para = Paragraph(_status_dot_html(str(value).replace("● ", "")), styles["body"])
        else:
            val_para = Paragraph(f"<b>{_escape_xml(value)}</b>", styles["body"])
        data.append([
            Paragraph(_escape_xml(label.upper()), styles["muted"]),
            val_para,
        ])
    if not data:
        data = [[Paragraph("—", styles["muted"]), Paragraph("—", styles["body"])]]
    t = Table(data, colWidths=[2.1 * inch, CONTENT_W - 2.1 * inch], rowHeights=[28] * len(data))
    style_cmds = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("LINEBELOW", (0, 0), (-1, -1), 1, BORDER),
    ]
    for i in range(len(data)):
        bg = WHITE if i % 2 == 0 else ROW_ALT
        style_cmds.append(("BACKGROUND", (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t


def _clients_table(clients: List[dict], styles: dict) -> Table:
    header = ["NAME", "ID", "PHONE", "STATUS", "BATCH", "DATE JOINED"]
    th_style = ParagraphStyle("th", fontName=FONT_BOLD, fontSize=9, textColor=TEXT_MUTED)
    data = [[Paragraph(h, th_style) for h in header]]
    for c in clients:
        st = (c.get("client_status") or "active").lower()
        data.append([
            Paragraph(_escape_xml(c.get("full_name") or ""), styles["body"]),
            Paragraph(_escape_xml(c.get("id") or ""), styles["muted"]),
            Paragraph(_escape_xml(c.get("phone_number") or "—"), styles["body"]),
            Paragraph(_status_dot_html(st), styles["body"]),
            Paragraph(_escape_xml(c.get("batch_name") or "—"), styles["body"]),
            Paragraph(_escape_xml(c.get("join_date") or "—"), styles["muted"]),
        ])
    if len(data) == 1:
        data.append([
            Paragraph("No clients assigned.", styles["italic_muted"]),
            "", "", "", "", "",
        ])
    cw = [1.35 * inch, 1.05 * inch, 1.0 * inch, 0.9 * inch, 1.0 * inch, 0.9 * inch]
    t = Table(data, colWidths=cw, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), TEXT_MUTED),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 1, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]
    for i in range(1, len(data)):
        bg = WHITE if i % 2 == 1 else ROW_ALT
        cmds.append(("BACKGROUND", (0, i), (-1, i), bg))
    t.setStyle(TableStyle(cmds))
    return t


def _batch_cards(batch: Optional[dict], styles: dict) -> Any:
    if not batch:
        return Paragraph("No batch assigned.", styles["italic_muted"])
    status = (batch.get("status") or "active").lower()
    status_color = STATUS_VALUE_COLORS.get(status, TEXT_PRIMARY)
    boxes = [
        ("Start Date", _fmt_date(batch.get("start_date")), TEXT_PRIMARY),
        ("End Date", _fmt_date(batch.get("end_date")), TEXT_PRIMARY),
        ("Status", status.upper(), status_color),
        (
            "Days Left",
            f"{batch.get('days_remaining') if batch.get('days_remaining') is not None else '—'}",
            TEXT_PRIMARY,
        ),
    ]
    cells = []
    for title, val, val_color in boxes:
        val_style = ParagraphStyle(
            "bv",
            parent=styles["body"],
            fontName=FONT_BOLD,
            fontSize=14,
            textColor=val_color,
            alignment=TA_CENTER,
        )
        lbl = Paragraph(f'<font color="#6B7280" size="8">{_escape_xml(title.upper())}</font>', styles["stat_lbl"])
        cells.append(Table([[lbl], [Paragraph(f"<b>{_escape_xml(val)}</b>", val_style)]], colWidths=[1.55 * inch]))
        cells[-1].setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), WHITE),
            ("BOX", (0, 0), (-1, -1), 1, BORDER),
            ("ROUNDEDCORNERS", [8, 8, 8, 8]),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ("LEFTPADDING", (0, 0), (-1, -1), 16),
            ("RIGHTPADDING", (0, 0), (-1, -1), 16),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
    return Table([cells], colWidths=[1.65 * inch] * 4)


def _diet_day_block(day: dict, load_image: Callable, styles: dict) -> List[Any]:
    flow: List[Any] = []
    day_num = day.get("day_number") or ""
    date_s = _fmt_date(day.get("entry_date"))
    header = Table([
        [
            Paragraph(f"<b>Day {day_num}</b>", styles["day_title"]),
            Paragraph(
                f'<para align="right">{_escape_xml(date_s)}</para>',
                styles["muted"],
            ),
        ]
    ], colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    flow.append(header)
    flow.append(HRule(CONTENT_W))
    flow.append(Spacer(1, 8))

    photos = day.get("photos") or []
    if not photos:
        flow.append(Paragraph("No entries for this day.", styles["italic_muted"]))
    else:
        for ph in photos:
            thumb: Any = Spacer(80, 80)
            path = ph.get("photo_path") or ""
            try:
                data = load_image(path) if callable(load_image) else None
            except Exception:
                data = None
            if data:
                try:
                    thumb = RLImage(io.BytesIO(data), width=80, height=80)
                except Exception:
                    thumb = Paragraph("[image]", styles["muted"])
            ts = _fmt_time(ph.get("captured_at") or ph.get("uploaded_at"))
            row = Table([[thumb, Paragraph(_escape_xml(ts), styles["muted"])]], colWidths=[90, CONTENT_W - 100])
            row.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 8),
            ]))
            flow.append(row)

    flow.append(Spacer(1, 12))
    flow.append(HRule(CONTENT_W))
    return flow


def _folder_list(folders: List[dict], styles: dict) -> List[Any]:
    flow: List[Any] = []
    for i, f in enumerate(folders or []):
        counts = f.get("item_counts") or {}
        parts = []
        for key, label in [("links", "Links"), ("videos", "Videos"), ("photos", "Photos"), ("documents", "Docs")]:
            n = counts.get(key, 0)
            if n:
                parts.append(f"{label}: {n}")
        summary = "  ·  ".join(parts) if parts else "No content"
        flow.append(Paragraph(
            f"📁 <b>{_escape_xml(f.get('name') or 'Folder')}</b>",
            styles["body_semibold"],
        ))
        flow.append(Paragraph(_escape_xml(summary), styles["muted"]))
        if i < len(folders) - 1:
            flow.append(Spacer(1, 6))
            flow.append(HRule(CONTENT_W))
            flow.append(Spacer(1, 6))
    if not folders:
        flow.append(Paragraph("None", styles["italic_muted"]))
    return flow


class _NumberedCanvas(pdfcanvas.Canvas):
    def __init__(self, *args, **kwargs):
        pdfcanvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states: List[dict] = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            _draw_footer(self, total)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)


def _draw_footer(c: pdfcanvas.Canvas, page_count: int) -> None:
    c.saveState()
    c.setFillColor(COMPANY)
    c.rect(0, 0, PAGE_W, FOOTER_H, fill=1, stroke=0)
    c.setFillColor(colors.Color(1, 1, 1, alpha=0.8))
    c.setFont(FONT_REG, 8)
    c.drawString(MARGIN_L, 11, "ChatFlow")
    c.setFillColor(WHITE)
    c.drawCentredString(PAGE_W / 2, 11, "CONFIDENTIAL — FOR INTERNAL USE ONLY")
    c.drawRightString(PAGE_W - MARGIN_R, 11, f"Page {c.getPageNumber()} of {page_count}")
    c.restoreState()


class ReportDocTemplate(SimpleDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)


def _build_doc(buffer: io.BytesIO, story: List[Any]) -> bytes:
    doc = ReportDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B + FOOTER_H,
    )
    doc.build(story, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()


def build_employee_pdf(report: dict, load_image: Callable[[str], Optional[bytes]]) -> bytes:
    styles = _styles()
    p = report.get("personal") or {}
    clients = report.get("clients") or []
    active = sum(1 for c in clients if (c.get("client_status") or "").lower() == "active")
    inactive = sum(1 for c in clients if (c.get("client_status") or "").lower() == "inactive")

    def sync_load(url):
        return load_image(url) if url else None

    avatar = _profile_photo_flowable(
        p.get("avatar_url"), sync_load, p.get("full_name") or "Employee", 55
    )
    emp_status = (p.get("status") or "active").lower()

    story: List[Any] = [
        Page1Banner({"generated_at": report.get("generated_at"), "report_id": p.get("id", "")[:8]}, styles),
        _profile_block(
            p.get("full_name") or "Employee",
            p.get("id") or "",
            "employee",
            [
                ("Total Clients", str(len(clients))),
                ("Active", str(active)),
                ("Inactive", str(inactive)),
            ],
            avatar,
            styles,
        ),
        Spacer(1, SECTION_GAP),
    ]
    story.extend(_section("Personal Information", styles))
    story.append(_kv_grid([
        ("Full Name", p.get("full_name") or "—"),
        ("Phone Number", p.get("phone_number") or "—"),
        ("Email", p.get("email") or "—"),
        ("Status", emp_status),
        ("Join Date", p.get("join_date") or "—"),
    ], styles, status_keys={"Status"}))
    story.append(Spacer(1, SECTION_GAP))
    story.append(PageBreak())
    story.extend(_section("Clients Under This Employee", styles))
    story.append(_clients_table(clients, styles))

    return _build_doc(io.BytesIO(), story)


def build_client_pdf(report: dict, load_image: Callable[[str], Optional[bytes]]) -> bytes:
    styles = _styles()
    personal = report.get("personal") or {}
    mp = report.get("medical", {}).get("profile") or {}
    emp = report.get("assigned_employee")
    batch = report.get("batch")
    folders = report.get("folders") or {}

    def sync_load(path):
        return load_image(path) if path else None

    batch_status = (batch.get("status") or "—").upper() if batch else "—"
    days_prog = str(batch.get("days_completed") if batch and batch.get("days_completed") is not None else "—")
    days_left = str(batch.get("days_remaining") if batch and batch.get("days_remaining") is not None else "—")

    story: List[Any] = [
        Page1Banner(
            {"generated_at": report.get("generated_at"), "report_id": personal.get("id", "")[:8]},
            styles,
        ),
        _profile_block(
            personal.get("full_name") or "Client",
            personal.get("id") or "",
            "client",
            [
                ("Day in Program", days_prog),
                ("Days Remaining", days_left),
                ("Batch Status", batch_status),
            ],
            _profile_photo_flowable(
                personal.get("avatar_url"),
                sync_load,
                personal.get("full_name") or "Client",
                55,
            ),
            styles,
        ),
        Spacer(1, SECTION_GAP),
    ]

    story.extend(_section("Personal Information", styles))
    story.append(_kv_grid([
        ("Full Name", personal.get("full_name") or "—"),
        ("Phone Number", personal.get("phone_number") or "—"),
        ("Client ID", personal.get("id") or "—"),
    ], styles))
    story.append(Spacer(1, SECTION_GAP))

    story.extend(_section("Medical Information", styles))
    story.append(_kv_grid([
        ("Age", str(mp.get("age") or report.get("medical", {}).get("age") or "—")),
        ("Weight", f"{mp.get('weight_kg') or report.get('medical', {}).get('weight_kg') or '—'} kg"),
        ("Height", f"{mp.get('height_cm') or report.get('medical', {}).get('height_cm') or '—'} cm"),
        ("Conditions", mp.get("medical_conditions") or "—"),
        ("Allergies", mp.get("allergies") or "—"),
        ("Medications", mp.get("current_medications") or "—"),
        ("Notes", mp.get("remarks") or "—"),
    ], styles))
    story.append(Spacer(1, SECTION_GAP))

    story.extend(_section("Assigned Employee", styles))
    story.append(_kv_grid([
        ("Name", emp.get("full_name") if emp else "Not assigned"),
        ("ID", emp.get("id") if emp else "—"),
        ("Phone", emp.get("phone_number") if emp else "—"),
    ], styles))
    story.append(Spacer(1, SECTION_GAP))

    story.extend(_section("Batch Information", styles))
    story.append(_batch_cards(batch, styles))
    story.append(Spacer(1, SECTION_GAP))

    story.append(PageBreak())
    story.extend(_section("Diet Log", styles))
    for day in report.get("diet_days") or []:
        story.extend(_diet_day_block(day, sync_load, styles))

    story.append(PageBreak())
    story.extend(_section("Admin Folders", styles))
    story.extend(_folder_list(folders.get("admin_folders"), styles))
    story.append(Spacer(1, SECTION_GAP))
    story.extend(_section("Employee Folders", styles))
    story.extend(_folder_list(folders.get("employee_folders"), styles))

    return _build_doc(io.BytesIO(), story)


def pdf_filename(report_type: str, full_name: str, generated_at: Optional[str] = None) -> str:
    safe = re.sub(r"[^\w\-]+", "_", (full_name or "User").strip())[:40]
    try:
        d = datetime.fromisoformat((generated_at or "").replace("Z", "+00:00"))
        ds = d.strftime("%Y%m%d")
    except Exception:
        ds = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = "EmployeeReport" if report_type == "employee" else "ClientReport"
    return f"{prefix}_{safe}_{ds}.pdf"
