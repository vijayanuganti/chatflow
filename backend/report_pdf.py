"""
Corporate PDF layouts for Admin Employee / Client reports (ReportLab).
"""
from __future__ import annotations

import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch, mm
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

# ChatFlow UI brand (emerald) + spec accent for highlights
PRIMARY = colors.HexColor("#064e3b")
PRIMARY_DARK = colors.HexColor("#022c22")
ACCENT = colors.HexColor("#E94560")
BG_LIGHT = colors.HexColor("#F5F7FA")
WHITE = colors.white
MUTED = colors.HexColor("#6B7280")
BORDER = colors.HexColor("#E5E7EB")
TEXT_DARK = colors.HexColor("#111827")

STATUS_COLORS = {
    "active": (colors.HexColor("#DCFCE7"), colors.HexColor("#166534")),
    "inactive": (colors.HexColor("#F3F4F6"), colors.HexColor("#4B5563")),
    "dropped": (colors.HexColor("#FEE2E2"), colors.HexColor("#991B1B")),
}

PAGE_W, PAGE_H = A4
MARGIN_L = 45 * 0.75  # ~34pt
MARGIN_R = 45 * 0.75
MARGIN_T = 40 * 0.75
MARGIN_B = 50 * 0.75  # room for footer
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R
FOOTER_H = 28
BANNER_H = 82


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


def _register_fonts() -> Tuple[str, str, str, str]:
    """Prefer DejaVu (bundled with many Linux distros) else Helvetica."""
    regular, bold, semi, light = "Helvetica", "Helvetica-Bold", "Helvetica-Bold", "Helvetica"
    for path, name in [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVu-Bold"),
    ]:
        try:
            import os
            if os.path.isfile(path):
                pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
                pdfmetrics.registerFont(
                    TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
                )
                return "DejaVu", "DejaVu-Bold", "DejaVu-Bold", "DejaVu"
        except Exception:
            pass
    return regular, bold, semi, light


FONT, FONT_BOLD, FONT_SEMI, FONT_LIGHT = _register_fonts()


def _styles() -> Dict[str, ParagraphStyle]:
    return {
        "banner_meta": ParagraphStyle(
            "banner_meta",
            fontName=FONT_LIGHT,
            fontSize=8,
            textColor=WHITE,
            alignment=TA_RIGHT,
            leading=10,
        ),
        "name": ParagraphStyle(
            "name",
            fontName=FONT_BOLD,
            fontSize=20,
            textColor=TEXT_DARK,
            leading=24,
        ),
        "stat_num": ParagraphStyle(
            "stat_num",
            fontName=FONT_BOLD,
            fontSize=18,
            textColor=TEXT_DARK,
            alignment=TA_CENTER,
            leading=20,
        ),
        "stat_lbl": ParagraphStyle(
            "stat_lbl",
            fontName=FONT_LIGHT,
            fontSize=8,
            textColor=MUTED,
            alignment=TA_CENTER,
            leading=10,
        ),
        "body": ParagraphStyle(
            "body",
            fontName=FONT,
            fontSize=10,
            textColor=TEXT_DARK,
            leading=13,
        ),
        "muted": ParagraphStyle(
            "muted",
            fontName=FONT_LIGHT,
            fontSize=9,
            textColor=MUTED,
            leading=11,
        ),
        "italic_muted": ParagraphStyle(
            "italic_muted",
            fontName=FONT_LIGHT,
            fontSize=9,
            textColor=MUTED,
            fontStyle="italic",
            leading=11,
        ),
    }


class AccentLine(Flowable):
    def __init__(self, width: float, thickness: float = 3):
        self.width = width
        self.thickness = thickness
        self.height = thickness + 4

    def wrap(self, aW, aH):
        return (aW, self.height)

    def draw(self):
        self.canv.setFillColor(ACCENT)
        self.canv.rect(0, 2, self.width, self.thickness, fill=1, stroke=0)


class SectionBar(Flowable):
    def __init__(self, title: str, icon: str = "", width: float = CONTENT_W):
        self.title = title
        self.icon = icon
        self.width = width
        self.height = 26

    def wrap(self, aW, aH):
        return (aW, self.height)

    def draw(self):
        c = self.canv
        c.setFillColor(PRIMARY)
        c.roundRect(0, 0, self.width, self.height, 4, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        c.rect(0, 0, 5, self.height, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD, 11)
        label = f"  {self.title.upper()}"
        c.drawString(12, 8, label)
        if self.icon:
            c.setFont(FONT, 10)
            c.drawRightString(self.width - 10, 8, self.icon)


def _initials_avatar(name: str, size: float = 60) -> Table:
    initials = "".join(p[0].upper() for p in (name or "U").split()[:2])[:2] or "U"
    t = Table([[Paragraph(
        f'<para align="center"><font size="18" color="#E94560"><b>{_escape_xml(initials)}</b></font></para>',
        ParagraphStyle("av", fontName=FONT_BOLD, fontSize=16, alignment=TA_CENTER, textColor=ACCENT),
    )]], colWidths=[size], rowHeights=[size])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 2, ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
    ]))
    return t


def _profile_photo_flowable(avatar_url: Optional[str], load_image: Callable, name: str, size: float = 60) -> Any:
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


def _role_badge(role: str) -> Paragraph:
    label = "Employee" if role == "employee" else "Client"
    return Paragraph(
        f'<font color="white" size="9"><b>{label}</b></font>',
        ParagraphStyle(
            "badge",
            fontName=FONT_BOLD,
            fontSize=9,
            textColor=WHITE,
            backColor=ACCENT,
            borderPadding=4,
            leading=11,
        ),
    )


def _stat_box(label: str, value: str, styles: dict) -> Table:
    t = Table([
        [Paragraph(_escape_xml(str(value)), styles["stat_num"])],
        [Paragraph(_escape_xml(label), styles["stat_lbl"])],
    ], colWidths=[1.55 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _banner_table(meta: dict, styles: dict) -> Table:
    report_id = meta.get("report_id") or str(uuid.uuid4())[:8].upper()
    gen = _fmt_datetime(meta.get("generated_at"))
    right = Paragraph(
        f"Generated on:<br/>{_escape_xml(gen)}<br/>Report ID: #{_escape_xml(report_id)}",
        styles["banner_meta"],
    )
    left = Paragraph('<font color="white" size="22"><b>ChatFlow</b></font>', styles["banner_meta"])
    t = Table([[left, right]], colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 18),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 18),
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
    id_para = Paragraph(f'<font color="#6B7280" size="9">ID: {_escape_xml(user_id)}</font>', styles["muted"])
    info = Table([
        [Paragraph(_escape_xml(name), styles["name"])],
        [_role_badge(role)],
        [id_para],
    ])
    info.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 4),
    ]))
    stat_cells = [[_stat_box(lbl, val, styles)] for lbl, val in stats]
    while len(stat_cells) < 3:
        stat_cells.append([Spacer(1, 1)])
    stats_row = Table([stat_cells[:3]], colWidths=[1.7 * inch] * 3)
    stats_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    row = Table([[avatar_flowable, info, stats_row]], colWidths=[0.85 * inch, 2.4 * inch, 3.6 * inch])
    row.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG_LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
    ]))
    return row


def _kv_grid(rows: List[Tuple[str, str]], styles: dict) -> Table:
    data = []
    for i, (label, value) in enumerate(rows):
        data.append([
            Paragraph(f'<font color="#6B7280" size="9">{_escape_xml(label.upper())}</font>', styles["muted"]),
            Paragraph(f'<b>{_escape_xml(value)}</b>', styles["body"]),
        ])
    if not data:
        data = [[Paragraph("—", styles["muted"]), Paragraph("—", styles["body"])]]
    t = Table(data, colWidths=[2.2 * inch, CONTENT_W - 2.2 * inch])
    style_cmds = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
    ]
    for i in range(len(data)):
        bg = WHITE if i % 2 == 0 else BG_LIGHT
        style_cmds.append(("BACKGROUND", (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t


def _clients_table(clients: List[dict], styles: dict) -> Table:
    header = ["NAME", "ID", "PHONE", "STATUS", "BATCH", "JOINED"]
    data = [[Paragraph(f"<b>{h}</b>", ParagraphStyle("th", fontName=FONT_BOLD, fontSize=9, textColor=WHITE)) for h in header]]
    for c in clients:
        st = (c.get("client_status") or "active").lower()
        bg, fg = STATUS_COLORS.get(st, STATUS_COLORS["active"])
        status_cell = Paragraph(
            f'<para align="center" backColor="{bg.hexval()}" borderPadding="3">'
            f'<font color="{fg.hexval()}" size="8"><b>{st.title()}</b></font></para>',
            styles["body"],
        )
        data.append([
            Paragraph(_escape_xml(c.get("full_name") or ""), styles["body"]),
            Paragraph(_escape_xml(c.get("id") or ""), styles["muted"]),
            Paragraph(_escape_xml(c.get("phone_number") or "—"), styles["body"]),
            status_cell,
            Paragraph(_escape_xml(c.get("batch_name") or "—"), styles["body"]),
            Paragraph(_escape_xml(c.get("join_date") or "—"), styles["muted"]),
        ])
    if len(data) == 1:
        data.append([
            Paragraph("No clients assigned.", styles["italic_muted"]),
            "", "", "", "", "",
        ])
    cw = [1.35 * inch, 1.1 * inch, 1.0 * inch, 0.75 * inch, 1.0 * inch, 0.85 * inch]
    t = Table(data, colWidths=cw, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]
    for i in range(1, len(data)):
        bg = WHITE if i % 2 == 1 else BG_LIGHT
        cmds.append(("BACKGROUND", (0, i), (-1, i), bg))
    t.setStyle(TableStyle(cmds))
    return t


def _batch_cards(batch: Optional[dict], styles: dict) -> Any:
    if not batch:
        return Paragraph("No batch assigned.", styles["italic_muted"])
    status = (batch.get("status") or "active").lower()
    bg, _ = STATUS_COLORS.get(status, STATUS_COLORS["active"])
    boxes = [
        ("Start Date", _fmt_date(batch.get("start_date"))),
        ("End Date", _fmt_date(batch.get("end_date"))),
        ("Status", status.upper()),
        ("Days Left", f"{batch.get('days_remaining') if batch.get('days_remaining') is not None else '—'} Days"),
    ]
    cells = []
    for title, val in boxes:
        cell_bg = bg if title == "Status" else WHITE
        cells.append(Table([
            [Paragraph(f'<font size="8" color="#6B7280">{title}</font>', styles["stat_lbl"])],
            [Paragraph(f"<b>{_escape_xml(val)}</b>", styles["stat_num"])],
        ], colWidths=[1.55 * inch]))
        cells[-1].setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), cell_bg),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
            ("ROUNDEDCORNERS", [6, 6, 6, 6]),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
    row = Table([cells], colWidths=[1.65 * inch] * 4)
    return row


def _diet_day_block(day: dict, load_image: Callable, styles: dict) -> List[Any]:
    flow: List[Any] = []
    title = f"DAY {day.get('day_number')}"
    date_s = _fmt_date(day.get("entry_date"))
    bar = Table([
        [
            Paragraph(f'<font color="white" size="11"><b>{_escape_xml(title)}</b></font>', styles["body"]),
            Paragraph(
                f'<para align="right"><font color="white" size="10">{_escape_xml(date_s)}</font></para>',
                styles["body"],
            ),
        ]
    ], colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
    bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    flow.append(bar)
    photos = day.get("photos") or []
    if not photos:
        inner = Table([[Paragraph("No entries for this day.", styles["italic_muted"])]], colWidths=[CONTENT_W - 24])
        inner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), WHITE),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ]))
        flow.append(inner)
    else:
        for ph in photos:
            thumb = Spacer(80, 80)
            path = ph.get("photo_path") or ""
            try:
                data = load_image(path) if callable(load_image) else None
            except Exception:
                data = None
            if data:
                try:
                    thumb = RLImage(io.BytesIO(data), width=80, height=80)
                except Exception:
                    thumb = Paragraph("[img]", styles["muted"])
            ts = _fmt_time(ph.get("captured_at") or ph.get("uploaded_at"))
            row = Table(
                [[thumb, Paragraph(f"Uploaded at {_escape_xml(ts)}", styles["muted"])]],
                colWidths=[90, CONTENT_W - 114],
            )
            row.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            flow.append(row)
    flow.append(Spacer(1, 6))
    flow.append(AccentLine(CONTENT_W, 2))
    return flow


def _folder_rows(folders: List[dict], styles: dict) -> Table:
    rows = []
    for f in folders or []:
        counts = f.get("item_counts") or {}
        pills = []
        for key, label in [("links", "Links"), ("videos", "Videos"), ("photos", "Photos"), ("documents", "Docs")]:
            n = counts.get(key, 0)
            if n:
                pills.append(f"[{label} {n}]")
        pill_text = " ".join(pills) if pills else "Empty"
        rows.append([
            Paragraph(f"<b>📁 {_escape_xml(f.get('name') or 'Folder')}</b>", styles["body"]),
            Paragraph(f'<font size="8" color="#6B7280">{_escape_xml(pill_text)}</font>', styles["muted"]),
        ])
    if not rows:
        rows = [[Paragraph("None", styles["italic_muted"]), Paragraph("", styles["body"])]]
    t = Table(rows, colWidths=[2.5 * inch, CONTENT_W - 2.5 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
    ]))
    return t


class _NumberedCanvas(pdfcanvas.Canvas):
    """Two-pass canvas so footers can show Page X of Y."""

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
            _draw_page_chrome(self, total)
            pdfcanvas.Canvas.showPage(self)
        pdfcanvas.Canvas.save(self)


def _draw_page_chrome(c: pdfcanvas.Canvas, page_count: int) -> None:
    page_num = c.getPageNumber()
    if page_num > 1:
        c.saveState()
        c.setFillColor(PRIMARY)
        c.rect(0, PAGE_H - 32, PAGE_W, 32, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD, 10)
        c.drawString(MARGIN_L, PAGE_H - 22, "ChatFlow")
        c.setStrokeColor(ACCENT)
        c.setLineWidth(3)
        c.line(0, PAGE_H - 35, PAGE_W, PAGE_H - 35)
        c.restoreState()

    c.saveState()
    c.setStrokeColor(ACCENT)
    c.setLineWidth(3)
    c.line(MARGIN_L, FOOTER_H + 6, PAGE_W - MARGIN_R, FOOTER_H + 6)
    c.setFillColor(PRIMARY)
    c.rect(0, 0, PAGE_W, FOOTER_H, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(FONT_LIGHT, 8)
    c.drawString(MARGIN_L, 10, "ChatFlow — Internal Reports")
    c.drawCentredString(PAGE_W / 2, 10, "CONFIDENTIAL — FOR INTERNAL USE ONLY")
    c.drawRightString(PAGE_W - MARGIN_R, 10, f"Page {page_num} of {page_count}")
    c.restoreState()


class ReportDocTemplate(SimpleDocTemplate):
    def __init__(self, filename, report_title: str = "ChatFlow", **kwargs):
        self.report_title = report_title
        super().__init__(filename, **kwargs)


def _build_doc(buffer: io.BytesIO, story: List[Any], title: str = "ChatFlow") -> bytes:
    doc = ReportDocTemplate(
        buffer,
        report_title=title,
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
    dropped = sum(1 for c in clients if (c.get("client_status") or "").lower() == "dropped")

    def sync_load(url):
        if not url:
            return None
        try:
            return load_image(url)
        except TypeError:
            import asyncio
            return None

    avatar = _profile_photo_flowable(p.get("avatar_url"), sync_load, p.get("full_name") or "Employee", 60)

    story: List[Any] = [
        _banner_table({"generated_at": report.get("generated_at"), "report_id": p.get("id", "")[:8]}, styles),
        AccentLine(CONTENT_W),
        Spacer(1, 10),
        _profile_block(
            p.get("full_name") or "Employee",
            p.get("id") or "",
            "employee",
            [
                ("Total Clients", str(len(clients))),
                ("Active Clients", str(active)),
                ("Inactive Clients", str(inactive + dropped)),
            ],
            avatar,
            styles,
        ),
        Spacer(1, 16),
        SectionBar("Personal Information", "👤", CONTENT_W),
        Spacer(1, 8),
        _kv_grid([
            ("Full Name", p.get("full_name") or "—"),
            ("Phone Number", p.get("phone_number") or "—"),
            ("Email", p.get("email") or "—"),
            ("Status", f"● {p.get('status') or '—'}"),
            ("Join Date", p.get("join_date") or "—"),
        ], styles),
        Spacer(1, 14),
        PageBreak(),
        SectionBar("Clients Under This Employee", "📋", CONTENT_W),
        Spacer(1, 8),
        _clients_table(clients, styles),
    ]
    buf = io.BytesIO()
    return _build_doc(buf, story)


def build_client_pdf(report: dict, load_image: Callable[[str], Optional[bytes]]) -> bytes:
    styles = _styles()
    personal = report.get("personal") or {}
    mp = report.get("medical", {}).get("profile") or {}
    emp = report.get("assigned_employee")
    batch = report.get("batch")
    folders = report.get("folders") or {}

    def sync_load(path):
        if not path:
            return None
        try:
            return load_image(path)
        except TypeError:
            return None

    batch_status = (batch.get("status") or "—").upper() if batch else "—"
    days_prog = str(batch.get("days_completed") if batch and batch.get("days_completed") is not None else "—")
    days_left = str(batch.get("days_remaining") if batch and batch.get("days_remaining") is not None else "—")

    story: List[Any] = [
        _banner_table({"generated_at": report.get("generated_at"), "report_id": personal.get("id", "")[:8]}, styles),
        AccentLine(CONTENT_W),
        Spacer(1, 10),
        _profile_block(
            personal.get("full_name") or "Client",
            personal.get("id") or "",
            "client",
            [
                ("Days in Program", days_prog),
                ("Days Remaining", days_left),
                ("Batch Status", batch_status),
            ],
            _profile_photo_flowable(
                personal.get("avatar_url"),
                sync_load,
                personal.get("full_name") or "Client",
                60,
            ),
            styles,
        ),
        Spacer(1, 14),
        SectionBar("Personal Information", "👤", CONTENT_W),
        Spacer(1, 8),
        _kv_grid([
            ("Full Name", personal.get("full_name") or "—"),
            ("Phone Number", personal.get("phone_number") or "—"),
            ("Client ID", personal.get("id") or "—"),
        ], styles),
        Spacer(1, 12),
        SectionBar("Medical Information", "🩺", CONTENT_W),
        Spacer(1, 8),
        _kv_grid([
            ("Age", str(mp.get("age") or report.get("medical", {}).get("age") or "—")),
            ("Weight", f"{mp.get('weight_kg') or report.get('medical', {}).get('weight_kg') or '—'} kg"),
            ("Height", f"{mp.get('height_cm') or report.get('medical', {}).get('height_cm') or '—'} cm"),
            ("Conditions", mp.get("medical_conditions") or "—"),
            ("Allergies", mp.get("allergies") or "—"),
            ("Medications", mp.get("current_medications") or "—"),
            ("Notes", mp.get("remarks") or "—"),
        ], styles),
        Spacer(1, 12),
        SectionBar("Assigned Employee", "👤", CONTENT_W),
        Spacer(1, 8),
        _kv_grid([
            ("Name", emp.get("full_name") if emp else "Not assigned"),
            ("ID", emp.get("id") if emp else "—"),
            ("Phone", emp.get("phone_number") if emp else "—"),
        ], styles),
        Spacer(1, 12),
        SectionBar("Batch Information", "📅", CONTENT_W),
        Spacer(1, 8),
        _batch_cards(batch, styles),
        Spacer(1, 14),
        PageBreak(),
        SectionBar("Diet Log", "🍽️", CONTENT_W),
        Spacer(1, 8),
    ]
    for day in report.get("diet_days") or []:
        story.extend(_diet_day_block(day, sync_load, styles))
    story.append(Spacer(1, 10))
    story.append(SectionBar("Folder Access", "📁", CONTENT_W))
    story.append(Spacer(1, 8))
    half = CONTENT_W / 2 - 6
    folder_split = Table([
        [
            Table([
                [Paragraph("<b>Admin Folders</b>", styles["body"])],
                [_folder_rows(folders.get("admin_folders"), styles)],
            ], colWidths=[half]),
            Table([
                [Paragraph("<b>Employee Folders</b>", styles["body"])],
                [_folder_rows(folders.get("employee_folders"), styles)],
            ], colWidths=[half]),
        ]
    ], colWidths=[half, half])
    folder_split.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(folder_split)

    buf = io.BytesIO()
    return _build_doc(buf, story)


def pdf_filename(report_type: str, full_name: str, generated_at: Optional[str] = None) -> str:
    safe = re.sub(r"[^\w\-]+", "_", (full_name or "User").strip())[:40]
    try:
        d = datetime.fromisoformat((generated_at or "").replace("Z", "+00:00"))
        ds = d.strftime("%Y%m%d")
    except Exception:
        ds = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = "EmployeeReport" if report_type == "employee" else "ClientReport"
    return f"{prefix}_{safe}_{ds}.pdf"
