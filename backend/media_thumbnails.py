"""Video thumbnail generation and serving for /api/media/thumbnail/{file_id}."""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable, Optional, Tuple

from fastapi import HTTPException
from fastapi.responses import FileResponse, Response
from PIL import Image, ImageDraw

logger = logging.getLogger(__name__)

THUMB_DIR_NAME = "thumbs"
VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v", ".3gp", ".mkv", ".avi"}


def normalize_file_id(file_id: str) -> str:
    raw = (file_id or "").strip().lstrip("/")
    if not raw or ".." in raw or "\\" in raw:
        raise HTTPException(status_code=400, detail="Invalid file id")
    if raw.startswith("uploads/"):
        raw = raw[len("uploads/") :]
    return raw


def media_key_for_file_id(file_id: str) -> str:
    fid = normalize_file_id(file_id)
    return f"uploads/{fid}"


def thumb_rel_path(file_id: str) -> str:
    fid = normalize_file_id(file_id)
    base = fid.rsplit(".", 1)[0] if "." in fid else fid
    return f"{THUMB_DIR_NAME}/{base}.jpg"


def thumb_key_for_file_id(file_id: str) -> str:
    return f"uploads/{thumb_rel_path(file_id)}"


def is_video_file_id(file_id: str) -> bool:
    ext = Path(normalize_file_id(file_id)).suffix.lower()
    return ext in VIDEO_EXT


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _write_placeholder_thumbnail(dest: Path, width: int = 640, height: int = 360) -> bool:
    """Fallback JPEG when ffmpeg is unavailable."""
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        img = Image.new("RGB", (width, height), color=(32, 32, 36))
        draw = ImageDraw.Draw(img)
        cx, cy = width // 2, height // 2
        r = min(width, height) // 8
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(80, 80, 88))
        draw.polygon(
            [(cx - r // 2, cy - r), (cx - r // 2, cy + r), (cx + r, cy)],
            fill=(220, 220, 225),
        )
        img.save(dest, format="JPEG", quality=82)
        return dest.is_file()
    except Exception as e:
        logger.warning("Placeholder thumbnail failed: %s", e)
        return False


def _extract_frame_ffmpeg(source: Path, dest: Path) -> bool:
    if not _ffmpeg_available():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "0.5",
        "-i",
        str(source),
        "-frames:v",
        "1",
        "-q:v",
        "3",
        str(dest),
    ]
    try:
        subprocess.run(cmd, check=True, timeout=120)
        return dest.is_file() and dest.stat().st_size > 0
    except (subprocess.SubprocessError, OSError) as e:
        logger.warning("ffmpeg thumbnail failed for %s: %s", source, e)
        return False


def generate_thumbnail_from_local_video(source: Path, thumb_dest: Path) -> bool:
    if not source.is_file():
        return False
    return _extract_frame_ffmpeg(source, thumb_dest)


async def ensure_video_thumbnail(
    *,
    file_id: str,
    upload_dir: Path,
    s3_bucket: str,
    stream_s3_object: Callable[[str], Tuple],
    upload_to_s3: Callable,
) -> Optional[Path]:
    """
    Ensure a JPEG thumbnail exists; returns local path when using disk storage.
    For S3-only deployments, uploads thumb to S3 and returns None.
    """
    if not is_video_file_id(file_id):
        return None

    fid = normalize_file_id(file_id)
    media_key = f"uploads/{fid}"
    thumb_key = thumb_key_for_file_id(file_id)
    local_thumb = upload_dir / thumb_rel_path(file_id)
    local_source = upload_dir / fid

    if local_thumb.is_file():
        return local_thumb

    if s3_bucket:
        try:
            body, _, _ = stream_s3_object(thumb_key)
            body.close()
            return None
        except HTTPException:
            pass
        except Exception:
            pass

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        tmp_source = tmp_dir / Path(fid).name
        tmp_thumb = tmp_dir / "thumb.jpg"

        if local_source.is_file():
            shutil.copy2(local_source, tmp_source)
        elif s3_bucket:
            try:
                body, _, _ = stream_s3_object(media_key)
                with tmp_source.open("wb") as out:
                    while True:
                        chunk = body.read(1024 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)
                body.close()
            except Exception as e:
                logger.warning("Could not read video for thumbnail %s: %s", media_key, e)
                return None
        else:
            return None

        if not _extract_frame_ffmpeg(tmp_source, tmp_thumb):
            if not _write_placeholder_thumbnail(tmp_thumb):
                return None

        if s3_bucket:
            try:
                with tmp_thumb.open("rb") as f:
                    upload_to_s3(f, thumb_key, "image/jpeg")
            except Exception as e:
                logger.warning("S3 thumb upload failed %s: %s", thumb_key, e)
                return None
            return None

        local_thumb.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tmp_thumb, local_thumb)
        return local_thumb


async def serve_thumbnail(
    file_id: str,
    *,
    upload_dir: Path,
    s3_bucket: str,
    assert_access: Callable,
    stream_s3_object: Callable[[str], Tuple],
    upload_to_s3: Callable,
    ensure_thumb: Callable,
) -> FileResponse:
    fid = normalize_file_id(file_id)
    media_key = f"uploads/{fid}"
    await assert_access(media_key)

    if not is_video_file_id(file_id):
        raise HTTPException(status_code=404, detail="Thumbnail not available")

    local_thumb = upload_dir / thumb_rel_path(file_id)
    if not local_thumb.is_file():
        await ensure_thumb(
            file_id=file_id,
            upload_dir=upload_dir,
            s3_bucket=s3_bucket,
            stream_s3_object=stream_s3_object,
            upload_to_s3=upload_to_s3,
        )

    if local_thumb.is_file():
        return FileResponse(str(local_thumb), media_type="image/jpeg")

    if s3_bucket:
        thumb_key = thumb_key_for_file_id(file_id)
        try:
            body, content_type, _ = stream_s3_object(thumb_key)
            data = body.read()
            body.close()
            return Response(content=data, media_type=content_type or "image/jpeg")
        except HTTPException:
            await ensure_thumb(
                file_id=file_id,
                upload_dir=upload_dir,
                s3_bucket=s3_bucket,
                stream_s3_object=stream_s3_object,
                upload_to_s3=upload_to_s3,
            )
            try:
                body, content_type, _ = stream_s3_object(thumb_key)
                data = body.read()
                body.close()
                return Response(content=data, media_type=content_type or "image/jpeg")
            except HTTPException as err:
                raise HTTPException(
                    status_code=404,
                    detail="Thumbnail not found. Install ffmpeg on the server for video posters.",
                ) from err

    raise HTTPException(status_code=404, detail="Thumbnail not found")
