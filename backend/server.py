from dotenv import load_dotenv
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


import os
import re
import uuid
import json
import logging
import shutil
import asyncio
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Dict, Set, Tuple, Any

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError


from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Depends,
    UploadFile,
    File,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
    Query,
)
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, validator


# ---------- Config ----------
def _get_env(name: str, default: Optional[str] = None, required: bool = True) -> str:
    value = os.environ.get(name, default)
    if required and (value is None or str(value).strip() == ""):
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


MONGO_URL = _get_env("MONGO_URL")
DB_NAME = _get_env("DB_NAME")
JWT_SECRET = _get_env("JWT_SECRET")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7
MIN_PASSWORD_LENGTH = int(os.environ.get("MIN_PASSWORD_LENGTH", "6"))
CLIENT_STATUSES = ("active", "inactive", "dropped")
BATCH_STATUSES = ("active", "inactive", "dropped")
BATCH_PERIOD_DAYS = 90


# ---------- Browser binding (SPA sends per-profile id; JWT may include `bid`) ----------
BROWSER_ID_HEADER = "x-chatflow-browser-id"

# ---------- Auth cookies ----------
AUTH_COOKIE_NAME = "chatflow_token"
COOKIE_SECURE = (os.environ.get("COOKIE_SECURE") or "").strip().lower() in ("1", "true", "yes", "on")
COOKIE_SAMESITE = (os.environ.get("COOKIE_SAMESITE") or "strict").strip().lower()  # strict | lax | none


def _set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=int(ACCESS_TOKEN_EXPIRE_HOURS * 3600),
        path="/",
    )


def _clear_auth_cookie(response: Response):
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
    )


UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

S3_BUCKET = (os.environ.get("S3_BUCKET") or "").strip()
S3_REGION = (os.environ.get("S3_REGION") or os.environ.get("AWS_REGION") or "").strip()
S3_PUBLIC_BASE_URL = (os.environ.get("S3_PUBLIC_BASE_URL") or "").rstrip("/")


def _parse_optional_bytes_env(name: str) -> Optional[int]:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return None
    try:
        return max(0, int(float(raw)))
    except ValueError:
        return None


# Atlas M0 / free tier and planned S3 Standard caps (override via env).
_DEFAULT_MONGO_QUOTA_BYTES = 512 * 1024 * 1024  # 512 MB
_DEFAULT_S3_QUOTA_BYTES = 5 * 1024 * 1024 * 1024  # 5 GB

MONGO_STORAGE_QUOTA_BYTES = (
    _parse_optional_bytes_env("MONGO_STORAGE_QUOTA_BYTES") or _DEFAULT_MONGO_QUOTA_BYTES
)
S3_STORAGE_QUOTA_BYTES = (
    _parse_optional_bytes_env("S3_STORAGE_QUOTA_BYTES") or _DEFAULT_S3_QUOTA_BYTES
)


def _public_url_to_s3_key(url: Optional[str]) -> Optional[str]:
    if not url or not isinstance(url, str):
        return None
    u = url.strip()
    if not u or u.startswith("/api/files/") or u.startswith("/"):
        return None
    base = (S3_PUBLIC_BASE_URL or "").rstrip("/")
    if base and u.startswith(base + "/"):
        return u[len(base) + 1 :].split("?", 1)[0]
    if S3_BUCKET and S3_REGION:
        needle = f"{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/"
        idx = u.find(needle)
        if idx != -1:
            return u[idx + len(needle) :].split("?", 1)[0]
        needle2 = f"{S3_BUCKET}.s3.dualstack.{S3_REGION}.amazonaws.com/"
        idx = u.find(needle2)
        if idx != -1:
            return u[idx + len(needle2) :].split("?", 1)[0]
    if S3_BUCKET:
        needle = f"{S3_BUCKET}.s3.amazonaws.com/"
        idx = u.find(needle)
        if idx != -1:
            return u[idx + len(needle) :].split("?", 1)[0]
    return None


def _urls_to_s3_keys(urls: List[Optional[str]]) -> Set[str]:
    keys: Set[str] = set()
    for url in urls:
        k = _public_url_to_s3_key(url)
        if k and ".." not in k:
            keys.add(k)
    return keys


def _delete_s3_keys_blocking(keys: Set[str]) -> int:
    if not keys or not S3_BUCKET:
        return 0
    session = boto3.session.Session(region_name=S3_REGION or None)
    s3 = session.client("s3")
    deleted = 0
    batch: List[dict] = []
    for key in sorted(keys):
        batch.append({"Key": key})
        if len(batch) >= 1000:
            s3.delete_objects(Bucket=S3_BUCKET, Delete={"Objects": batch, "Quiet": True})
            deleted += len(batch)
            batch = []
    if batch:
        s3.delete_objects(Bucket=S3_BUCKET, Delete={"Objects": batch, "Quiet": True})
        deleted += len(batch)
    return deleted


async def _delete_s3_keys(keys: Set[str]) -> int:
    if not keys:
        return 0
    try:
        return int(await asyncio.to_thread(_delete_s3_keys_blocking, keys))
    except Exception as e:
        logger.warning("S3 bulk delete failed: %s", e)
        return 0


def _list_s3_uploads_prefix_blocking(prefix: str = "uploads/") -> Tuple[int, int]:
    """Return (total_bytes, object_count) for objects under prefix."""
    if not S3_BUCKET:
        return 0, 0
    session = boto3.session.Session(region_name=S3_REGION or None)
    s3 = session.client("s3")
    total = 0
    count = 0
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
        for obj in page.get("Contents") or []:
            total += int(obj.get("Size") or 0)
            count += 1
    return total, count


async def _collect_message_file_keys(conversation_id: str) -> Set[str]:
    keys: Set[str] = set()
    async for m in db.messages.find({"conversation_id": conversation_id}, {"file_url": 1, "_id": 0}):
        if m.get("file_url"):
            keys |= _urls_to_s3_keys([m["file_url"]])
    return keys


async def _diet_photo_urls_for_client(client_id: str) -> Set[str]:
    urls: Set[str] = set()
    slots = ("morning", "afternoon", "night")
    async for doc in db.diet_plans.find({"client_id": client_id}, {"meals": 1, "_id": 0}):
        meals = doc.get("meals") or {}
        for slot in slots:
            slot_doc = meals.get(slot) or {}
            u = slot_doc.get("photo_url")
            if u:
                urls.add(str(u))
    return urls


async def _emit_conversation_removed(conv_id: str, participant_ids: List[str]) -> None:
    event = {"type": "conversation_removed", "conversation_id": conv_id}
    seen: Set[str] = set(participant_ids)
    for uid in participant_ids:
        await manager.send_event(uid, event)
    async for a in db.users.find({"role": "admin"}, {"id": 1, "_id": 0}):
        aid = a["id"]
        if aid not in seen:
            await manager.send_event(aid, event)


client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000)
db = client[DB_NAME]


app = FastAPI(title="ChatFlow API", redirect_slashes=False)
api_router = APIRouter()


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ---------- Firebase Cloud Messaging ----------
_firebase_app = None


def _firebase_credential_path() -> Optional[Path]:
    """Resolve service-account JSON: env absolute path, then files under backend/."""
    file_env = (os.environ.get("FIREBASE_SERVICE_ACCOUNT_FILE") or "").strip()
    if file_env:
        candidate = Path(file_env).expanduser()
        if not candidate.is_absolute():
            candidate = (ROOT_DIR / candidate).resolve()
        else:
            candidate = candidate.resolve()
        if candidate.is_file():
            return candidate
        logger.warning("FIREBASE_SERVICE_ACCOUNT_FILE not found: %s", candidate)

    for name in ("firebase-adminsdk.json", "firebase-adminsdk.json.json"):
        path = (ROOT_DIR / name).resolve()
        if path.is_file():
            return path
    return None


def _load_firebase_credentials():
    """FIREBASE_SERVICE_ACCOUNT_JSON (inline) → FIREBASE_SERVICE_ACCOUNT_FILE → backend/*.json."""
    import firebase_admin
    from firebase_admin import credentials

    raw = (os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if raw:
        try:
            service_account_info = json.loads(raw)
            if not isinstance(service_account_info, dict):
                raise ValueError("FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object")
            logger.info("Firebase credentials loaded from FIREBASE_SERVICE_ACCOUNT_JSON")
            return credentials.Certificate(service_account_info)
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.warning("FIREBASE_SERVICE_ACCOUNT_JSON invalid: %s", e)

    cred_path = _firebase_credential_path()
    if cred_path:
        logger.info("Firebase credentials loaded from file: %s", cred_path)
        return credentials.Certificate(str(cred_path))

    return None


def _init_firebase() -> bool:
    global _firebase_app
    if _firebase_app is False:
        return False
    if _firebase_app is not None:
        return True
    try:
        import firebase_admin

        cred = _load_firebase_credentials()
        if cred is None:
            logger.warning(
                "Firebase credentials not found (set FIREBASE_SERVICE_ACCOUNT_JSON or add "
                "firebase-adminsdk.json in backend/); FCM disabled"
            )
            _firebase_app = False
            return False
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin initialized for FCM")
        return True
    except Exception as e:
        logger.warning("Firebase init failed: %s", e)
        _firebase_app = False
        return False


def _fcm_data_payload(data: Optional[Dict]) -> Dict[str, str]:
    payload: Dict[str, str] = {}
    for key, value in (data or {}).items():
        if value is None:
            continue
        payload[str(key)] = str(value)
    return payload


# Must match frontend/src/lib/push.js and ChatFlowNotificationHelper.CHANNEL_ID on Android.
FCM_ANDROID_CHANNEL_ID = "chatflow_messages_actions"


def _fcm_group_key(data: Optional[Dict[str, str]]) -> str:
    """One tray slot per sender — used as collapse_key, Android tag, Web tag, iOS thread-id."""
    payload = data or {}
    sender_id = str(payload.get("sender_id") or "").strip()
    if sender_id:
        return f"sender_{sender_id}"
    conversation_id = str(payload.get("conversation_id") or "").strip()
    if conversation_id:
        return f"conv_{conversation_id}"
    message_id = str(payload.get("message_id") or "").strip() or uuid.uuid4().hex
    return f"msg_{message_id}"


def _send_fcm_multicast_blocking(
    user_id: str,
    tokens: List[str],
    title: str,
    body: str,
    data: Dict[str, str],
):
    from firebase_admin import messaging

    payload_data = dict(data or {})
    message_id = (payload_data.get("message_id") or "").strip() or uuid.uuid4().hex
    payload_data["message_id"] = message_id

    sender_id = str(payload_data.get("sender_id") or "").strip()
    conversation_id = str(payload_data.get("conversation_id") or "").strip()
    if not sender_id or not conversation_id:
        logger.warning(
            "FCM routing fields missing for user_id=%s message_id=%s sender_id=%s conversation_id=%s keys=%s",
            user_id,
            message_id,
            sender_id or "(empty)",
            conversation_id or "(empty)",
            sorted(payload_data.keys()),
        )

    group_key = _fcm_group_key(payload_data)
    payload_data["android_priority"] = "2"  # PRIORITY_MAX on Android
    payload_data["android_channel_id"] = FCM_ANDROID_CHANNEL_ID
    payload_data["group_key"] = group_key
    payload_data["notification_tag"] = group_key

    # Data-only — ChatFlowMessagingService posts the tray UI (Reply / Mark read).
    # collapse_key collapses in-flight FCM; group_key in data is the on-device tag/slot id.
    payload_data["title"] = title
    payload_data["body"] = body

    apns_headers = {"apns-collapse-id": group_key[:64]}
    message = messaging.MulticastMessage(
        data=payload_data,
        tokens=tokens,
        android=messaging.AndroidConfig(
            priority="high",
            collapse_key=group_key,
            ttl=timedelta(hours=24),
            direct_boot_ok=True,
        ),
        apns=messaging.APNSConfig(
            headers=apns_headers,
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    thread_id=group_key,
                    alert=messaging.ApsAlert(title=title, body=body),
                    sound="default",
                )
            ),
        ),
    )
    logger.info(
        "Attempting to send FCM to user_id=%s tokens=%s message_id=%s group_key=%s sender_id=%s conversation_id=%s keys=%s",
        user_id,
        len(tokens),
        message_id,
        group_key,
        sender_id or "(empty)",
        conversation_id or "(empty)",
        sorted(payload_data.keys()),
    )
    return messaging.send_each_for_multicast(message)


async def _conversation_muted_for_user(user_id: str, conversation_id: str) -> bool:
    pref = await db.conversation_preferences.find_one(
        {"user_id": user_id, "conversation_id": conversation_id},
        {"is_muted": 1, "_id": 0},
    )
    return bool(pref and pref.get("is_muted"))


async def send_fcm_notification(
    user_id: str,
    title: str,
    body: str,
    data: Optional[Dict] = None,
    *,
    conversation_id: Optional[str] = None,
    sender_id: Optional[str] = None,
) -> None:
    """Send an FCM v1 notification+data payload to all tokens for a user."""
    if not _init_firebase():
        logger.warning(
            "FCM skipped for user %s — Firebase not configured "
            "(set FIREBASE_SERVICE_ACCOUNT_JSON on the server or add firebase-adminsdk.json)",
            user_id,
        )
        return
    if conversation_id and await _conversation_muted_for_user(user_id, conversation_id):
        logger.info("FCM skipped for user %s — conversation %s muted", user_id, conversation_id)
        return

    doc = await db.users.find_one({"id": user_id}, {"fcm_tokens": 1, "_id": 0})
    tokens = [t for t in (doc or {}).get("fcm_tokens") or [] if isinstance(t, str) and t.strip()]
    if not tokens:
        logger.info(
            "FCM skipped for user %s — no device tokens (open the Android app, allow notifications, log in)",
            user_id,
        )
        return

    str_data = _fcm_data_payload(data)
    if conversation_id:
        str_data["conversation_id"] = str(conversation_id).strip()
    if sender_id:
        str_data["sender_id"] = str(sender_id).strip()
    try:
        response = await asyncio.to_thread(
            _send_fcm_multicast_blocking, user_id, tokens, title, body, str_data
        )
    except Exception as e:
        logger.warning("FCM send failed for user %s: %s", user_id, e)
        return

    invalid: List[str] = []
    success_count = 0
    try:
        from firebase_admin import messaging

        for idx, resp in enumerate(response.responses):
            if resp.success:
                success_count += 1
                continue
            exc = resp.exception
            logger.warning(
                "FCM delivery failed user=%s token[%s] err=%s",
                user_id,
                idx,
                exc,
            )
            if isinstance(
                exc,
                (
                    messaging.UnregisteredError,
                    messaging.SenderIdMismatchError,
                ),
            ):
                invalid.append(tokens[idx])
    except Exception:
        pass

    logger.info(
        "FCM sent user=%s tokens=%s success=%s invalid=%s conv=%s",
        user_id,
        len(tokens),
        success_count,
        len(invalid),
        conversation_id or "",
    )

    if invalid:
        await db.users.update_one(
            {"id": user_id},
            {"$pull": {"fcm_tokens": {"$in": invalid}}},
        )


# ---------- Phone helpers ----------
# Default country for parsing local numbers without country code (configurable).
DEFAULT_PHONE_COUNTRY = (os.environ.get("DEFAULT_PHONE_COUNTRY") or "IN").upper()

try:
    import phonenumbers  # type: ignore

    HAS_PHONENUMBERS = True
except Exception:  # pragma: no cover - fallback if lib missing
    phonenumbers = None  # type: ignore
    HAS_PHONENUMBERS = False
    logger.warning("phonenumbers library not installed; falling back to basic regex validation")


_FALLBACK_PHONE_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


def normalize_phone(raw: Optional[str]) -> str:
    """Validate and return phone in canonical E.164 form (e.g. '+919876543210').

    Uses Google's libphonenumber when available, falling back to a strict
    E.164 regex check.
    """
    if not raw:
        raise HTTPException(status_code=400, detail="Phone number is required")

    cleaned = re.sub(r"[\s\-()]", "", str(raw).strip())
    if not cleaned:
        raise HTTPException(status_code=400, detail="Phone number is required")

    if HAS_PHONENUMBERS:
        try:
            parsed = phonenumbers.parse(cleaned, None if cleaned.startswith("+") else DEFAULT_PHONE_COUNTRY)
        except phonenumbers.NumberParseException:
            raise HTTPException(status_code=400, detail="Invalid phone number format")

        if not phonenumbers.is_possible_number(parsed) or not phonenumbers.is_valid_number(parsed):
            raise HTTPException(status_code=400, detail="Invalid phone number")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)

    if not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    if not _FALLBACK_PHONE_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="Invalid phone number")
    return cleaned


# ---------- Auth helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    user_id: str,
    username: str,
    role: str,
    browser_id: str,
    jti: Optional[str] = None,
) -> str:
    bid = (browser_id or "").strip()[:128] or str(uuid.uuid4())
    token_jti = (jti or "").strip() or str(uuid.uuid4())
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
        "bid": bid,
        "jti": token_jti,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def parse_device_name(user_agent: str) -> str:
    ua = (user_agent or "").lower()
    if "capacitor" in ua or "chatflow" in ua:
        return "Android App" if "android" in ua else "Mobile App"
    browser = "Browser"
    if "edg/" in ua or "edge/" in ua:
        browser = "Edge"
    elif "chrome/" in ua or "crios/" in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua and "chrome" not in ua:
        browser = "Safari"
    os_name = "Unknown"
    if "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "windows" in ua:
        os_name = "Windows"
    elif "mac os" in ua or "macintosh" in ua:
        os_name = "macOS"
    elif "linux" in ua:
        os_name = "Linux"
    return f"{browser} on {os_name}"


async def get_location_from_ip(ip: Optional[str]) -> str:
    if not ip or ip in ("127.0.0.1", "::1", "localhost"):
        return "Local"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(f"http://ip-api.com/json/{ip}?fields=status,city,country")
            data = res.json()
            if data.get("status") == "success":
                city = (data.get("city") or "").strip()
                country = (data.get("country") or "").strip()
                if city and country:
                    return f"{city}, {country}"
                return country or city or "Unknown"
    except Exception:
        logger.debug("IP geolocation lookup failed for %s", ip, exc_info=True)
    return "Unknown"


SESSION_INVALID_REASON = "logged_in_on_another_device"


async def assert_active_session(jti: Optional[str]) -> None:
    """Require an active server session when JWT includes `jti` (legacy tokens without jti still work until expiry)."""
    if not jti or not str(jti).strip():
        return
    session = await db.sessions.find_one({"token_jti": jti, "is_active": True}, {"_id": 1})
    if not session:
        raise HTTPException(status_code=401, detail=SESSION_INVALID_REASON)
    await db.sessions.update_one(
        {"token_jti": jti},
        {"$set": {"last_active": now_iso()}},
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token_expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token")


def _browser_id_from_request(request: Request) -> str:
    return (request.headers.get(BROWSER_ID_HEADER) or "").strip()[:128]


def _assert_jwt_browser_binding(request: Request, payload: dict) -> None:
    """Every session JWT carries `bid`; the same id must be sent on every request."""
    hdr = _browser_id_from_request(request)
    bid_claim = payload.get("bid")
    if bid_claim is None or str(bid_claim).strip() == "":
        raise HTTPException(
            status_code=401,
            detail="Please sign in again (session update required).",
        )
    if not hdr:
        raise HTTPException(
            status_code=401,
            detail="Please sign in again (missing browser session).",
        )
    if hdr != str(bid_claim).strip():
        raise HTTPException(
            status_code=401,
            detail="Session is not valid on this browser. Please sign in again.",
        )


def _assert_jwt_browser_binding_ws(payload: dict, browser_id_query: Optional[str]) -> None:
    bid_claim = payload.get("bid")
    if bid_claim is None or str(bid_claim).strip() == "":
        raise HTTPException(status_code=401, detail="WebSocket session update required.")
    q = (browser_id_query or "").strip()[:128]
    if not q or q != str(bid_claim).strip():
        raise HTTPException(status_code=401, detail="WebSocket browser binding mismatch.")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_date_str() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def batch_end_date_from_start(start_date: str) -> str:
    try:
        start = date.fromisoformat(str(start_date)[:10])
    except ValueError:
        start = datetime.now(timezone.utc).date()
    return (start + timedelta(days=BATCH_PERIOD_DAYS)).isoformat()


def normalize_client_status(user: dict) -> str:
    if user.get("role") != "client":
        return "active"
    cs = (user.get("client_status") or "").strip().lower()
    if cs in CLIENT_STATUSES:
        return cs
    if user.get("is_active") is False:
        return "inactive"
    return "active"


def account_can_sign_in(user: dict) -> bool:
    if user.get("role") == "client":
        return normalize_client_status(user) == "active" and user.get("is_active") is not False
    if user.get("is_active") is False:
        return False
    return True


def enrich_batch_doc(batch: dict) -> dict:
    b = dict(batch)
    status = (b.get("status") or "active").strip().lower()
    if status not in BATCH_STATUSES:
        status = "active"
    b["status"] = status
    start = (b.get("start_date") or (b.get("created_at") or "")[:10] or today_date_str())[:10]
    b["start_date"] = start
    end = (b.get("end_date") or batch_end_date_from_start(start))[:10]
    b["end_date"] = end
    days_remaining = None
    if status == "active":
        try:
            end_d = date.fromisoformat(end)
            days_remaining = max(0, (end_d - datetime.now(timezone.utc).date()).days)
        except ValueError:
            days_remaining = None
    b["days_remaining"] = days_remaining
    return b


def direct_conv_id(user_a: str, user_b: str) -> str:
    pair = sorted([user_a, user_b])
    return f"direct_{pair[0]}_{pair[1]}"


def clean_user(u: dict) -> dict:
    u = dict(u)
    u.pop("_id", None)
    u.pop("password_hash", None)
    if u.get("role") == "client":
        u["client_status"] = normalize_client_status(u)
    return u


def normalize_username(username: Optional[str]) -> str:
    return (username or "").strip().lower()


def derive_username_from_phone(phone_e164: str) -> str:
    """Fallback username when admin doesn't pick one. Stable + readable."""
    digits = re.sub(r"\D", "", phone_e164)
    suffix = digits[-6:] if len(digits) >= 6 else digits
    return f"user_{suffix}"


def _extract_jwt_from_request(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip() or None
    cookie_token = request.cookies.get(AUTH_COOKIE_NAME)
    return (cookie_token or "").strip() or None


async def get_current_user(request: Request) -> dict:
    token = _extract_jwt_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    _assert_jwt_browser_binding(request, payload)
    await assert_active_session(payload.get("jti"))
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return clean_user(user)


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_account_creator(user: dict = Depends(get_current_user)) -> dict:
    """Admin OR an employee with explicit account_creation_access granted."""
    role = user.get("role")
    if role == "admin":
        return user
    if role == "employee" and bool(user.get("account_creation_access")):
        return user
    raise HTTPException(
        status_code=403,
        detail="You are not allowed to create accounts. Ask an administrator.",
    )


# ---------- Audit ----------
async def log_audit(
    actor_user_id: Optional[str],
    action: str,
    target_user_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Persist a sensitive action to the audit log."""
    doc = {
        "id": str(uuid.uuid4()),
        "actor_user_id": actor_user_id,
        "action": action,
        "target_user_id": target_user_id,
        "metadata": metadata or {},
        "timestamp": now_iso(),
    }
    try:
        await db.audit_logs.insert_one(doc)
    except Exception as e:
        # never fail business logic because of audit log; just warn loudly.
        logger.warning("Audit log write failed (%s): %s", action, e)


def _infer_public_url(bucket: str, region: str, key: str) -> str:
    if S3_PUBLIC_BASE_URL:
        return f"{S3_PUBLIC_BASE_URL}/{key}"
    if region:
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
    return f"https://{bucket}.s3.amazonaws.com/{key}"


def _upload_to_s3(fileobj, key: str, content_type: str) -> str:
    if not S3_BUCKET:
        raise RuntimeError("S3_BUCKET not configured")
    session = boto3.session.Session(region_name=S3_REGION or None)
    s3 = session.client("s3")
    extra = {}
    if content_type:
        extra["ContentType"] = content_type
    try:
        s3.upload_fileobj(fileobj, S3_BUCKET, key, ExtraArgs=extra or None)
    except (BotoCoreError, ClientError) as e:
        raise RuntimeError(f"S3 upload failed: {e}") from e
    return _infer_public_url(S3_BUCKET, S3_REGION, key)


# ---------- Models ----------
class LoginBody(BaseModel):
    # Unified `identifier` (phone or username), or legacy `phone_number` / `username`.
    identifier: Optional[str] = None
    phone_number: Optional[str] = None
    username: Optional[str] = None
    password: str


# --- Medical profile ----------------------------------------------------------
# Every field is optional so an admin can save partial data and refine later.
# Free-text fields are length-capped server-side to keep documents manageable.
ALLOWED_GENDERS = {"male", "female", "other", "prefer_not_to_say"}
ALLOWED_FOOD_PREF = {"veg", "non_veg", "vegan", "eggetarian", "jain"}
ALLOWED_ACTIVITY = {"sedentary", "light", "moderate", "active", "very_active"}
ALLOWED_BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"}


class MedicalProfileBody(BaseModel):
    full_name: Optional[str] = Field(None, max_length=120)
    age: Optional[int] = Field(None, ge=0, le=150)
    date_of_birth: Optional[str] = None  # ISO date string YYYY-MM-DD
    gender: Optional[str] = None
    phone_number: Optional[str] = Field(None, max_length=32)
    address: Optional[str] = Field(None, max_length=500)
    height_cm: Optional[float] = Field(None, ge=0, le=300)
    weight_kg: Optional[float] = Field(None, ge=0, le=600)
    blood_group: Optional[str] = None
    medical_conditions: Optional[str] = Field(None, max_length=2000)
    current_medications: Optional[str] = Field(None, max_length=2000)
    allergies: Optional[str] = Field(None, max_length=2000)
    food_preference: Optional[str] = None
    water_intake_liters: Optional[float] = Field(None, ge=0, le=20)
    physical_activity_level: Optional[str] = None
    health_goal: Optional[str] = Field(None, max_length=400)
    consultation_date: Optional[str] = None  # ISO date string
    remarks: Optional[str] = Field(None, max_length=4000)

    @validator("gender")
    def _v_gender(cls, v):
        if v is None or v == "":
            return None
        if v not in ALLOWED_GENDERS:
            raise ValueError("Invalid gender")
        return v

    @validator("food_preference")
    def _v_food(cls, v):
        if v is None or v == "":
            return None
        if v not in ALLOWED_FOOD_PREF:
            raise ValueError("Invalid food preference")
        return v

    @validator("physical_activity_level")
    def _v_activity(cls, v):
        if v is None or v == "":
            return None
        if v not in ALLOWED_ACTIVITY:
            raise ValueError("Invalid activity level")
        return v

    @validator("blood_group")
    def _v_blood(cls, v):
        if v is None or v == "":
            return None
        if v not in ALLOWED_BLOOD_GROUPS:
            raise ValueError("Invalid blood group")
        return v

    @validator("date_of_birth", "consultation_date")
    def _v_date(cls, v):
        if not v:
            return None
        try:
            datetime.fromisoformat(v)
        except Exception:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


def _serialize_medical_profile(mp: "MedicalProfileBody") -> Dict[str, object]:
    """Pydantic v1 / v2 compatible dump for storage."""
    try:
        return mp.model_dump(exclude_unset=False)  # pydantic v2
    except AttributeError:
        return mp.dict()  # pydantic v1


class CreateAccountBody(BaseModel):
    phone_number: str
    password: str
    full_name: str
    role: str  # "employee" | "client"
    username: Optional[str] = None
    # Client-only allocation
    batch_id: Optional[str] = None
    employee_id: Optional[str] = None
    # Optional medical profile (clients only). Admin can edit later.
    medical_profile: Optional[MedicalProfileBody] = None

    @validator("role")
    def role_must_be_valid(cls, v: str) -> str:
        if v not in ("employee", "client"):
            raise ValueError("Role must be 'employee' or 'client'")
        return v


class AdminResetPasswordBody(BaseModel):
    new_password: str = Field(..., min_length=MIN_PASSWORD_LENGTH)


class PermissionUpdateBody(BaseModel):
    account_creation_access: bool


class ActiveStatusBody(BaseModel):
    is_active: Optional[bool] = None
    client_status: Optional[str] = None

    @validator("client_status")
    def valid_client_status(cls, v):
        if v is None:
            return v
        if v not in CLIENT_STATUSES:
            raise ValueError(f"client_status must be one of {CLIENT_STATUSES}")
        return v


class BatchStatusBody(BaseModel):
    status: str

    @validator("status")
    def valid_batch_status(cls, v):
        if v not in BATCH_STATUSES:
            raise ValueError(f"status must be one of {BATCH_STATUSES}")
        return v


class ProfileBody(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    status: Optional[str] = None
    avatar_url: Optional[str] = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=MIN_PASSWORD_LENGTH)


class MessageBody(BaseModel):
    conversation_id: str
    content: str = ""
    message_type: str = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    client_message_id: Optional[str] = None
    reply_to_id: Optional[str] = None
    reply_to_snippet: Optional[str] = None
    reply_to_sender: Optional[str] = None
    is_forwarded: bool = False
    original_sender_id: Optional[str] = None


class ConversationPreferencesBody(BaseModel):
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    is_muted: Optional[bool] = None


class NotificationSendBody(BaseModel):
    """Payload from Android notification direct reply."""
    message_id: str
    text: str
    conversation_id: Optional[str] = None


class NotificationMarkReadBody(BaseModel):
    """Payload from Android notification mark-as-read action."""
    message_id: str
    conversation_id: Optional[str] = None


class UpdateMessageStatusBody(BaseModel):
    message_id: str
    status: str = Field(..., pattern="^(sent|delivered|seen)$")


class UpdateMessageStatusBatchBody(BaseModel):
    message_ids: List[str]
    status: str = Field(..., pattern="^(sent|delivered|seen)$")


MESSAGE_STATUS_ORDER = {"sent": 0, "delivered": 1, "seen": 2}


class StartDirectBody(BaseModel):
    other_user_id: str


class CreateGroupBody(BaseModel):
    name: str
    member_ids: List[str]


class CreateBatchBody(BaseModel):
    name: str
    employee_id: str
    max_clients: Optional[int] = 20


class AssignClientBody(BaseModel):
    """Admin-only payload to move a client across employees / batches."""
    employee_id: str
    batch_id: str


# --- Complaint box -----------------------------------------------------------
# Clients raise complaints against their assigned employee. Admin reviews them
# from a single inbox and marks them solved or leaves them pending.

COMPLAINT_STATUSES = ("pending", "solved")


class ComplaintAnswer(BaseModel):
    """A single guided-intake Q&A pair captured before the free-text description."""
    question: str = Field(..., min_length=1, max_length=200)
    answer: str = Field(..., min_length=1, max_length=200)


class CreateComplaintBody(BaseModel):
    description: str = Field(..., min_length=10, max_length=4000)
    answers: List[ComplaintAnswer] = Field(default_factory=list)
    # Optional override — by default we infer the assigned employee from the
    # client's `employee_id`. A client may pick a different employee if they
    # want to complain about someone else (e.g. a covering employee).
    employee_id: Optional[str] = None

    @validator("answers")
    def cap_answers(cls, v):
        if len(v) > 10:
            raise ValueError("Too many intake answers")
        return v


class UpdateComplaintBody(BaseModel):
    """Admin-only: change status + optionally attach a resolution note."""
    status: str
    resolution_notes: Optional[str] = Field(default=None, max_length=2000)

    @validator("status")
    def valid_status(cls, v):
        if v not in COMPLAINT_STATUSES:
            raise ValueError(f"status must be one of {COMPLAINT_STATUSES}")
        return v


# --- Diet plan ---------------------------------------------------------------
MEAL_SLOTS = ("morning", "afternoon", "night")


class DietSuggestionBody(BaseModel):
    """Employee/admin updates the meal suggestions for an existing day."""
    morning: Optional[str] = Field(None, max_length=1500)
    afternoon: Optional[str] = Field(None, max_length=1500)
    night: Optional[str] = Field(None, max_length=1500)


class DietDayCreateBody(BaseModel):
    """Create a new day for a client. Day number auto-increments if not supplied."""
    date: Optional[str] = None  # YYYY-MM-DD; defaults to today
    day_number: Optional[int] = None  # explicit numbering; defaults to next
    morning: Optional[str] = Field(None, max_length=1500)
    afternoon: Optional[str] = Field(None, max_length=1500)
    night: Optional[str] = Field(None, max_length=1500)

    @validator("date")
    def _date_format(cls, v):
        if not v:
            return None
        try:
            datetime.fromisoformat(v)
        except Exception:
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class DietPhotoBody(BaseModel):
    """Client uploads (via /upload) and posts the resulting URL + an optional note."""
    photo_url: str
    note: Optional[str] = Field(None, max_length=800)


# ---------- Account creation (shared) ----------
async def _create_user_internal(
    actor: dict,
    body: CreateAccountBody,
) -> dict:
    """Create an account on behalf of an admin or permitted employee.

    Enforces role-based rules:
    - Admins may create employee or client accounts.
    - Employees with account_creation_access may create clients only.
    """
    actor_role = actor.get("role")
    if actor_role == "employee" and body.role != "client":
        raise HTTPException(
            status_code=403,
            detail="Employees can only create client accounts.",
        )

    phone = normalize_phone(body.phone_number)
    if await db.users.find_one({"phone_number": phone}):
        raise HTTPException(status_code=409, detail="Phone number is already registered")

    if len(body.password or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    full_name = (body.full_name or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Full name is required")

    username = normalize_username(body.username) or derive_username_from_phone(phone)
    if not re.match(r"^[a-z0-9_.-]{2,40}$", username):
        raise HTTPException(
            status_code=400,
            detail="Username may contain letters, digits, '.', '_' or '-' (2-40 chars)",
        )
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=409, detail="Username already taken")

    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "username": username,
        "phone_number": phone,
        "full_name": full_name[:80],
        "password_hash": hash_password(body.password),
        "role": body.role,
        "bio": "",
        "status": "available",
        "avatar_url": None,
        "created_at": now_iso(),
        "online": False,
        "last_seen": now_iso(),
        "created_by": actor.get("id"),
        "account_creation_access": False,  # default; admin can grant later
        "password_reset_by": None,
        "password_reset_at": None,
        "is_active": True,
        "inactive_at": None,
        "inactive_by": None,
    }

    if body.role == "client":
        # employees may only assign clients to themselves
        if actor_role == "employee":
            employee_id = actor["id"]
        else:
            employee_id = (body.employee_id or "").strip()
            if not employee_id:
                raise HTTPException(status_code=400, detail="Client must be assigned to an employee")
        batch_id = (body.batch_id or "").strip()
        if not batch_id:
            raise HTTPException(status_code=400, detail="Client must be assigned to a batch")

        employee = await db.users.find_one({"id": employee_id, "role": "employee"}, {"_id": 0})
        if not employee:
            raise HTTPException(status_code=400, detail="Selected employee not found")

        batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
        if not batch:
            raise HTTPException(status_code=400, detail="Selected batch not found")
        if batch.get("employee_id") != employee_id:
            raise HTTPException(status_code=400, detail="Selected batch does not belong to the chosen employee")

        client_ids = batch.get("client_ids") or []
        max_clients = int(batch.get("max_clients") or 20)
        if len(client_ids) >= max_clients:
            raise HTTPException(status_code=400, detail="Selected batch is full")

        doc["employee_id"] = employee_id
        doc["client_status"] = "active"
        doc["batch_id"] = batch_id

        # Medical profile is captured for clients only. Admins (or permitted
        # employees) may supply it at creation time; otherwise admin fills it
        # in later via the admin dashboard.
        if body.medical_profile is not None:
            doc["medical_profile"] = _serialize_medical_profile(body.medical_profile)
            doc["medical_profile_updated_at"] = now_iso()
            doc["medical_profile_updated_by"] = actor.get("id")
        else:
            doc["medical_profile"] = None
            doc["medical_profile_updated_at"] = None
            doc["medical_profile_updated_by"] = None

    await db.users.insert_one(dict(doc))

    if body.role == "client":
        await db.batches.update_one(
            {"id": doc["batch_id"]},
            {"$addToSet": {"client_ids": user_id}},
        )
        await _ensure_direct(doc["employee_id"], user_id)

    await log_audit(
        actor_user_id=actor.get("id"),
        action="account.create",
        target_user_id=user_id,
        metadata={
            "role": body.role,
            "username": username,
            "phone_masked": _mask_phone(phone),
        },
    )

    return clean_user(doc)


def _mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    if len(phone) <= 4:
        return "*" * len(phone)
    return phone[:3] + "*" * (len(phone) - 6) + phone[-3:]


# ---------- Auth ----------
@api_router.post("/auth/login")
async def login(body: LoginBody, request: Request):
    """
    Sign in by either phone number (E.164, country-code prefix) or username.

    Clients may submit `phone_number` (digits, optionally pre-combined with a
    country code) and/or `username`. The phone path is preferred when both
    are provided. We deliberately don't leak which lookup failed — the user
    always sees the same "invalid phone/username or password" error.
    """
    identifier_raw = (body.identifier or body.phone_number or body.username or "").strip()
    phone_raw = (body.phone_number or "").strip() if not body.identifier else ""
    username_raw = (body.username or "").strip() if not body.identifier else ""

    if not identifier_raw:
        raise HTTPException(status_code=400, detail="Enter your phone number or username")

    user = None
    audit_meta: dict = {"ip": _client_ip(request), "login_identifier": identifier_raw[:64]}

    # Unified identifier: phone if starts with + or is digits-only (7–15).
    if body.identifier:
        ident = identifier_raw
        digits_only = "".join(ch for ch in ident if ch.isdigit())
        looks_like_phone = ident.startswith("+") or (
            digits_only and len(digits_only) >= 7 and len(digits_only) <= 15 and not any(c.isalpha() for c in ident)
        )
        if looks_like_phone:
            try:
                phone = normalize_phone(ident if ident.startswith("+") else f"+{digits_only}")
            except HTTPException:
                await log_audit(
                    actor_user_id=None,
                    action="auth.login_failed",
                    metadata={"reason": "phone_format", **audit_meta},
                )
                raise HTTPException(status_code=401, detail="Invalid phone/username or password")
            audit_meta["phone_masked"] = _mask_phone(phone)
            user = await db.users.find_one({"phone_number": phone})
        else:
            username_norm = ident.lower()
            audit_meta["username"] = username_norm
            user = await db.users.find_one({"username": username_norm})
            if not user:
                user = await db.users.find_one({"username": ident})
    elif phone_raw:
        try:
            phone = normalize_phone(phone_raw)
        except HTTPException:
            await log_audit(
                actor_user_id=None,
                action="auth.login_failed",
                metadata={"reason": "phone_format", **audit_meta},
            )
            raise HTTPException(status_code=401, detail="Invalid phone/username or password")
        audit_meta["phone_masked"] = _mask_phone(phone)
        user = await db.users.find_one({"phone_number": phone})

    if not user and username_raw:
        username_norm = username_raw.lower()
        audit_meta["username"] = username_norm
        user = await db.users.find_one({"username": username_norm})
        if not user:
            user = await db.users.find_one({"username": username_raw})

    if not user or not verify_password(body.password, user.get("password_hash", "")):
        await log_audit(
            actor_user_id=None,
            action="auth.login_failed",
            metadata=audit_meta,
        )
        raise HTTPException(status_code=401, detail="Invalid phone/username or password")

    # Inactive / dropped accounts can't sign in (admin keeps their data but they lose access).
    if not account_can_sign_in(user):
        await log_audit(
            actor_user_id=user["id"],
            action="auth.login_blocked_inactive",
            metadata={"role": user.get("role"), "ip": _client_ip(request)},
        )
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive. Please contact your administrator.",
        )

    browser_id = _browser_id_from_request(request) or str(uuid.uuid4())
    jti = str(uuid.uuid4())
    ua = request.headers.get("user-agent", "")
    client_ip = _client_ip(request)
    device_name = parse_device_name(ua)
    location = await get_location_from_ip(client_ip)
    created_at = now_iso()

    old_sessions = await db.sessions.find(
        {"user_id": user["id"], "is_active": True},
        {"_id": 0},
    ).to_list(20)
    if old_sessions:
        await manager.send_force_logout(user["id"], SESSION_INVALID_REASON)
        await db.sessions.update_many(
            {"user_id": user["id"], "is_active": True},
            {"$set": {"is_active": False, "last_active": created_at}},
        )
        await log_audit(
            actor_user_id=user["id"],
            action="auth.session_replaced",
            metadata={
                "reason": "new_login",
                "old_sessions": [
                    {
                        "id": s.get("id"),
                        "device_name": s.get("device_name"),
                        "ip_address": s.get("ip_address"),
                    }
                    for s in old_sessions
                ],
                "new_device_name": device_name,
                "new_location": location,
                "new_ip": client_ip or "",
            },
        )

    await db.sessions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "token_jti": jti,
            "device_name": device_name,
            "location": location,
            "ip_address": client_ip or "",
            "created_at": created_at,
            "last_active": created_at,
            "is_active": True,
        }
    )

    token = create_access_token(
        user["id"],
        user.get("username") or "",
        user["role"],
        browser_id,
        jti=jti,
    )
    # Web SPA stores the JWT in sessionStorage (per tab). Do not set a shared
    # HttpOnly cookie here — last-writer cookie was overwriting other tabs.

    await log_audit(
        actor_user_id=user["id"],
        action="auth.login",
        metadata={"role": user.get("role"), "ip": _client_ip(request)},
    )

    response = JSONResponse(
        content={
            "user": clean_user(user),
            "access_token": token,
            "browser_install_id": browser_id,
        }
    )
    _clear_auth_cookie(response)
    return response


@api_router.post("/auth/logout")
async def logout(response: Response, request: Request):
    # best-effort audit (no current user required for clearing cookie)
    try:
        token = _extract_jwt_from_request(request)
        if token:
            payload = decode_token(token)
            jti = payload.get("jti")
            if jti:
                await db.sessions.update_one(
                    {"token_jti": jti},
                    {"$set": {"is_active": False, "last_active": now_iso()}},
                )
            await log_audit(actor_user_id=payload.get("sub"), action="auth.logout")
    except Exception:
        pass
    _clear_auth_cookie(response)
    return {"message": "Logged out"}


@api_router.get("/auth/login-history")
@api_router.get("/users/me/sessions")
async def login_history(request: Request, user: dict = Depends(get_current_user)):
    """Recent sign-in sessions for the current account (newest first)."""
    current_jti = None
    token = _extract_jwt_from_request(request)
    if token:
        try:
            current_jti = decode_token(token).get("jti")
        except Exception:
            current_jti = None

    sessions = (
        await db.sessions.find({"user_id": user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    for s in sessions:
        s["is_current"] = bool(
            current_jti and s.get("token_jti") and str(s["token_jti"]) == str(current_jti)
        )
    return {"sessions": sessions}


@api_router.post("/auth/sessions/{session_id}/revoke")
async def revoke_session(
    session_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Deactivate a past session (remote sign-out). Use logout for the current device."""
    session = await db.sessions.find_one({"id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    token = _extract_jwt_from_request(request)
    current_jti = None
    if token:
        try:
            current_jti = decode_token(token).get("jti")
        except Exception:
            current_jti = None
    if current_jti and session.get("token_jti") and str(session["token_jti"]) == str(current_jti):
        raise HTTPException(
            status_code=400,
            detail="Use Sign out to end your current session on this device.",
        )
    await db.sessions.update_one(
        {"id": session_id, "user_id": user["id"]},
        {"$set": {"is_active": False, "last_active": now_iso()}},
    )
    return {"message": "Session revoked"}


@api_router.get("/auth/session/validate")
async def validate_session(request: Request):
    """Lightweight session check for foreground refresh and polling fallback."""
    token = _extract_jwt_from_request(request)
    if not token:
        return {"valid": False, "reason": "no_token"}
    try:
        payload = decode_token(token)
        _assert_jwt_browser_binding(request, payload)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        if detail == SESSION_INVALID_REASON:
            return {"valid": False, "reason": SESSION_INVALID_REASON}
        return {"valid": False, "reason": "invalid"}
    jti = payload.get("jti")
    if not jti:
        return {"valid": True}
    session = await db.sessions.find_one({"token_jti": jti, "is_active": True}, {"_id": 1})
    if not session:
        return {"valid": False, "reason": SESSION_INVALID_REASON}
    return {"valid": True}


@api_router.get("/auth/verify")
async def verify_session(user: dict = Depends(get_current_user)):
    return {"user": user}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean_user(user)


def _client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


# ---------- Users / Profile ----------
@api_router.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({"id": {"$ne": user["id"]}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api_router.get("/users/{user_id}/public")
async def get_user_public_profile(user_id: str, viewer: dict = Depends(get_current_user)):
    if user_id == viewer["id"]:
        return clean_user(viewer)
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "fcm_tokens": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if viewer["role"] != "admin":
        shared = await db.conversations.find_one(
            {"participants": {"$all": [viewer["id"], user_id]}},
            {"_id": 1},
        )
        if not shared:
            raise HTTPException(status_code=403, detail="Access denied")
    return {
        "id": target["id"],
        "full_name": target.get("full_name"),
        "username": target.get("username"),
        "avatar_url": target.get("avatar_url"),
        "bio": target.get("bio"),
        "role": target.get("role"),
        "status": target.get("status"),
        "online": target.get("online"),
        "last_seen": target.get("last_seen"),
    }


@api_router.put("/users/me")
async def update_profile(body: ProfileBody, user: dict = Depends(get_current_user)):
    update: Dict[str, object] = {}

    if body.full_name is not None:
        update["full_name"] = body.full_name.strip()[:80]

    if body.bio is not None:
        update["bio"] = body.bio[:200]

    if body.status is not None:
        if body.status not in ("available", "busy", "away", "dnd"):
            raise HTTPException(status_code=400, detail="Invalid status")
        update["status"] = body.status

    if body.avatar_url is not None:
        update["avatar_url"] = body.avatar_url

    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        await manager.broadcast_profile_update(user["id"])

    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh


class FcmTokenBody(BaseModel):
    token: str = Field(..., min_length=1, max_length=4096)


@app.post("/api/users/me/fcm-token", tags=["users"])
async def register_fcm_token(
    body: FcmTokenBody,
    user: dict = Depends(get_current_user),
):
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token is required")
    result = await db.users.update_one(
        {"id": user["id"]},
        {"$addToSet": {"fcm_tokens": token}},
    )
    doc = await db.users.find_one({"id": user["id"]}, {"fcm_tokens": 1, "_id": 0})
    token_count = len((doc or {}).get("fcm_tokens") or [])
    logger.info(
        "FCM token registered for user %s (matched=%s modified=%s total_tokens=%s)",
        user["id"],
        result.matched_count,
        result.modified_count,
        token_count,
    )
    return {
        "message": "Token registered",
        "stored": result.modified_count > 0 or result.matched_count > 0,
        "token_count": token_count,
    }


@api_router.post("/users/me/password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(body.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    await log_audit(actor_user_id=user["id"], action="password.self_change")
    return {"message": "Password updated"}


# ---------- Account creation (admin & permitted employee) ----------
@api_router.post("/accounts")
async def create_account(body: CreateAccountBody, actor: dict = Depends(require_account_creator)):
    """Create an employee or client account.

    Authorization:
    - Admins: may create employees and clients.
    - Employees with `account_creation_access`: may create clients only.
    """
    new_user = await _create_user_internal(actor, body)
    return {"user": new_user}


@api_router.get("/me/permissions")
async def my_permissions(user: dict = Depends(get_current_user)):
    return {
        "role": user.get("role"),
        "account_creation_access": bool(user.get("account_creation_access")) or user.get("role") == "admin",
    }


# ---------- Admin: account & permission management ----------
@api_router.get("/admin/users")
async def admin_users(user: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(2000)
    return users


@api_router.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, _: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    creator = None
    if target.get("created_by"):
        creator = await db.users.find_one(
            {"id": target["created_by"]},
            {"_id": 0, "password_hash": 0},
        )
    reset_by = None
    if target.get("password_reset_by"):
        reset_by = await db.users.find_one(
            {"id": target["password_reset_by"]},
            {"_id": 0, "password_hash": 0},
        )
    return {
        "user": target,
        "created_by_user": clean_user(creator) if creator else None,
        "password_reset_by_user": clean_user(reset_by) if reset_by else None,
    }


@api_router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: str,
    body: AdminResetPasswordBody,
    actor: dict = Depends(require_admin),
):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("role") == "admin" and target["id"] != actor["id"]:
        # Prevent admins from resetting other admins via this endpoint.
        raise HTTPException(status_code=403, detail="Cannot reset password of another admin")

    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "password_hash": hash_password(body.new_password),
                "password_reset_by": actor["id"],
                "password_reset_at": now_iso(),
            }
        },
    )
    await log_audit(
        actor_user_id=actor["id"],
        action="password.admin_reset",
        target_user_id=user_id,
        metadata={"username": target.get("username")},
    )
    return {"message": "Password reset successfully"}


@api_router.post("/admin/users/{user_id}/permissions")
async def admin_set_permissions(
    user_id: str,
    body: PermissionUpdateBody,
    actor: dict = Depends(require_admin),
):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") != "employee":
        raise HTTPException(
            status_code=400,
            detail="Account creation permission can only be granted to employees",
        )

    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "account_creation_access": bool(body.account_creation_access),
                "permissions_updated_by": actor["id"],
                "permissions_updated_at": now_iso(),
            }
        },
    )
    await log_audit(
        actor_user_id=actor["id"],
        action="permissions.account_creation."
        + ("grant" if body.account_creation_access else "revoke"),
        target_user_id=user_id,
        metadata={"username": target.get("username")},
    )
    return {"message": "Permissions updated"}


@api_router.get("/users/{user_id}/medical-profile")
async def get_medical_profile(user_id: str, viewer: dict = Depends(get_current_user)):
    """Return a client's medical profile.

    Access rules:
      - Admins  → any client
      - Clients → only themselves
      - Employees → only clients in one of their batches
    """
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") != "client":
        raise HTTPException(status_code=400, detail="Medical profile is only available for clients")

    viewer_role = viewer.get("role")
    if viewer_role == "admin":
        pass
    elif viewer_role == "client":
        if viewer["id"] != user_id:
            raise HTTPException(status_code=403, detail="Not allowed")
    elif viewer_role == "employee":
        # Employee can see the medical profile of clients in their batches OR
        # their directly-assigned clients.
        if target.get("employee_id") != viewer["id"]:
            # Fall back to batch ownership check
            batch_id = target.get("batch_id")
            batch = await db.batches.find_one({"id": batch_id}) if batch_id else None
            if not batch or batch.get("employee_id") != viewer["id"]:
                raise HTTPException(status_code=403, detail="Not allowed")
    else:
        raise HTTPException(status_code=403, detail="Not allowed")

    updated_by_user = None
    if target.get("medical_profile_updated_by"):
        u = await db.users.find_one(
            {"id": target["medical_profile_updated_by"]},
            {"_id": 0, "password_hash": 0},
        )
        if u:
            updated_by_user = clean_user(u)

    return {
        "user": {
            "id": target["id"],
            "username": target.get("username"),
            "full_name": target.get("full_name"),
            "phone_number": target.get("phone_number"),
            "avatar_url": target.get("avatar_url"),
        },
        "medical_profile": target.get("medical_profile"),
        "updated_at": target.get("medical_profile_updated_at"),
        "updated_by": updated_by_user,
        "editable": viewer_role == "admin",
    }


@api_router.put("/admin/users/{user_id}/medical-profile")
async def admin_update_medical_profile(
    user_id: str,
    body: MedicalProfileBody,
    actor: dict = Depends(require_admin),
):
    """Admin-only: create or update a client's medical profile."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") != "client":
        raise HTTPException(status_code=400, detail="Medical profile is only available for clients")

    profile = _serialize_medical_profile(body)
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "medical_profile": profile,
                "medical_profile_updated_at": now_iso(),
                "medical_profile_updated_by": actor["id"],
            }
        },
    )

    await log_audit(
        actor_user_id=actor["id"],
        action="medical_profile.update",
        target_user_id=user_id,
        metadata={"username": target.get("username")},
    )
    return {
        "medical_profile": profile,
        "updated_at": now_iso(),
        "updated_by": clean_user(actor),
    }


@api_router.post("/admin/users/{user_id}/active")
async def admin_set_active_status(
    user_id: str,
    body: ActiveStatusBody,
    actor: dict = Depends(require_admin),
):
    """Activate / deactivate employees, or set client lifecycle (active / inactive / dropped)."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin accounts cannot be deactivated this way")

    if body.is_active is None and body.client_status is None:
        raise HTTPException(status_code=400, detail="Provide is_active and/or client_status")

    update_fields: Dict[str, object] = {}
    role = target.get("role")

    if role == "client":
        if body.client_status is not None:
            cs = body.client_status
            update_fields["client_status"] = cs
            is_active = cs == "active"
        elif body.is_active is not None:
            is_active = bool(body.is_active)
            update_fields["client_status"] = "active" if is_active else "inactive"
        else:
            raise HTTPException(status_code=400, detail="Invalid status update")
        update_fields["is_active"] = is_active
    else:
        if body.is_active is None:
            raise HTTPException(status_code=400, detail="is_active is required for employees")
        is_active = bool(body.is_active)
        update_fields["is_active"] = is_active

    if update_fields.get("is_active"):
        update_fields["inactive_at"] = None
        update_fields["inactive_by"] = None
        update_fields["reactivated_at"] = now_iso()
        update_fields["reactivated_by"] = actor["id"]
        if role == "client" and "client_status" not in update_fields:
            update_fields["client_status"] = "active"
    else:
        update_fields["inactive_at"] = now_iso()
        update_fields["inactive_by"] = actor["id"]

    await db.users.update_one({"id": user_id}, {"$set": update_fields})

    action = "account.activate" if update_fields.get("is_active") else "account.deactivate"
    if role == "client" and update_fields.get("client_status") == "dropped":
        action = "account.drop"
    await log_audit(
        actor_user_id=actor["id"],
        action=action,
        target_user_id=user_id,
        metadata={
            "role": role,
            "username": target.get("username"),
            "client_status": update_fields.get("client_status"),
        },
    )
    msg = "Account activated" if update_fields.get("is_active") else "Account updated"
    if role == "client" and update_fields.get("client_status") == "dropped":
        msg = "Client dropped"
    elif role == "client" and update_fields.get("client_status") == "inactive":
        msg = "Client marked inactive"
    elif not update_fields.get("is_active"):
        msg = "Account deactivated"
    return {"message": msg, "client_status": update_fields.get("client_status"), "is_active": update_fields.get("is_active")}


@api_router.get("/admin/clients")
async def admin_clients(
    _: dict = Depends(require_admin),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        pattern="^(active|inactive|dropped)$",
    ),
):
    """List clients, optionally filtered by client_status."""
    query: Dict[str, object] = {"role": "client"}
    if status_filter in CLIENT_STATUSES:
        query["client_status"] = status_filter
    clients = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)
    return [clean_user(c) for c in clients]


@api_router.get("/admin/audit-logs")
async def admin_audit_logs(
    _: dict = Depends(require_admin),
    limit: int = Query(200, ge=1, le=1000),
    action: Optional[str] = None,
):
    query: Dict[str, object] = {}
    if action:
        query["action"] = action
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)

    user_ids = set()
    for log in logs:
        for k in ("actor_user_id", "target_user_id"):
            if log.get(k):
                user_ids.add(log[k])

    users_map: Dict[str, dict] = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "password_hash": 0}):
            users_map[u["id"]] = clean_user(u)

    for log in logs:
        log["actor"] = users_map.get(log.get("actor_user_id"))
        log["target"] = users_map.get(log.get("target_user_id"))
    return logs


# ---------- Admin: existing dashboards ----------
@api_router.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_admin)):
    return {
        "total_users": await db.users.count_documents({}),
        "employees": await db.users.count_documents({"role": "employee"}),
        "clients": await db.users.count_documents({"role": "client"}),
        "active_clients": await db.users.count_documents(
            {"role": "client", "client_status": "active"}
        ),
        "inactive_clients": await db.users.count_documents(
            {"role": "client", "client_status": "inactive"}
        ),
        "dropped_clients": await db.users.count_documents(
            {"role": "client", "client_status": "dropped"}
        ),
        "active_employees": await db.users.count_documents(
            {"role": "employee", "is_active": {"$ne": False}}
        ),
        "inactive_employees": await db.users.count_documents(
            {"role": "employee", "is_active": False}
        ),
        "admins": await db.users.count_documents({"role": "admin"}),
        "conversations": await db.conversations.count_documents({}),
        "groups": await db.conversations.count_documents({"type": "group"}),
        "messages": await db.messages.count_documents({}),
        "employees_with_creation_access": await db.users.count_documents(
            {"role": "employee", "account_creation_access": True}
        ),
        "complaints_pending": await db.complaints.count_documents({"status": "pending"}),
        "complaints_solved": await db.complaints.count_documents({"status": "solved"}),
    }


def _pack_storage_used_free(used: Optional[int], quota: Optional[int]) -> Dict[str, Optional[float]]:
    out: Dict[str, Optional[float]] = {
        "used_bytes": float(used) if used is not None else None,
        "quota_bytes": float(quota) if quota is not None else None,
        "free_bytes": None,
        "percent_used": None,
    }
    if used is None:
        return out
    if quota is not None and quota > 0:
        out["free_bytes"] = float(max(0, quota - int(used)))
        out["percent_used"] = round(100.0 * min(int(used), int(quota)) / int(quota), 2)
    return out


@api_router.get("/admin/storage")
async def admin_storage_overview(_: dict = Depends(require_admin)):
    """Approximate MongoDB footprint + S3 `uploads/` usage. Optional quotas via env."""
    mongo_used: Optional[int] = None
    mongo_detail: Dict[str, object] = {}
    try:
        st = await db.command({"dbStats": 1})
        mongo_detail = {
            "data_size_bytes": int(st.get("dataSize") or 0),
            "storage_size_bytes": int(st.get("storageSize") or 0),
            "index_size_bytes": int(st.get("indexSize") or 0),
            "objects": int(st.get("objects") or 0),
            "collections": int(st.get("collections") or 0),
        }
        mongo_used = int(st.get("storageSize") or 0)
    except Exception as e:
        logger.warning("dbStats failed: %s", e)
        mongo_detail = {"error": str(e)}

    s3_used_int: Optional[int] = None
    s3_objects = 0
    s3_error: Optional[str] = None
    if S3_BUCKET:
        try:
            s3_used_int, s3_objects = await asyncio.to_thread(_list_s3_uploads_prefix_blocking, "uploads/")
        except Exception as e:
            logger.warning("S3 list failed: %s", e)
            s3_error = str(e)

    s3_pack = _pack_storage_used_free(s3_used_int, S3_STORAGE_QUOTA_BYTES)

    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "database": {
            **mongo_detail,
            **_pack_storage_used_free(mongo_used, MONGO_STORAGE_QUOTA_BYTES),
            "provider": "MongoDB Atlas",
            "capacity_label": "512 MB",
        },
        "object_storage": {
            "configured": bool(S3_BUCKET),
            "bucket": S3_BUCKET or None,
            "prefix": "uploads/",
            "object_count": s3_objects,
            "used_bytes": float(s3_used_int) if s3_used_int is not None else None,
            **({"error": s3_error} if s3_error else {}),
            **s3_pack,
            "provider": "Amazon Web Services (AWS) S3",
            "capacity_label": "5 GB",
            "storage_class": "S3 Standard",
        },
    }


@api_router.delete("/admin/conversations/{conv_id}")
async def admin_delete_conversation(
    conv_id: str,
    confirm_conversation_id: str = Query(..., description="Must match conv_id"),
    actor: dict = Depends(require_admin),
):
    if confirm_conversation_id != conv_id:
        raise HTTPException(status_code=400, detail="Confirmation does not match conversation id")
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    participants = list(conv.get("participants") or [])
    keys = await _collect_message_file_keys(conv_id)
    deleted_s3 = await _delete_s3_keys(keys)
    dr = await db.messages.delete_many({"conversation_id": conv_id})
    await db.conversations.delete_one({"id": conv_id})
    await log_audit(
        actor_user_id=actor["id"],
        action="conversation.delete",
        metadata={"conversation_id": conv_id, "messages_deleted": dr.deleted_count, "s3_objects_deleted": deleted_s3},
    )
    await _emit_conversation_removed(conv_id, participants)
    return {
        "ok": True,
        "conversation_id": conv_id,
        "messages_deleted": dr.deleted_count,
        "s3_objects_deleted": deleted_s3,
    }


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    confirm_user_id: str = Query(..., description="Must match user_id"),
    actor: dict = Depends(require_admin),
):
    if confirm_user_id != user_id:
        raise HTTPException(status_code=400, detail="Confirmation does not match user id")
    if user_id == actor["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("role") == "admin":
        admin_n = await db.users.count_documents({"role": "admin"})
        if admin_n <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last administrator account")

    if target.get("role") == "employee":
        linked_clients = await db.users.count_documents({"role": "client", "employee_id": user_id})
        if linked_clients > 0:
            raise HTTPException(
                status_code=409,
                detail="This employee still has clients assigned. Reassign or delete those clients first.",
            )
        batches = await db.batches.find({"employee_id": user_id}).to_list(500)
        for b in batches:
            if len(b.get("client_ids") or []) > 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Employee still has clients in batch “{b.get('name', b.get('id'))}”. Remove clients first.",
                )
        await db.batches.delete_many({"employee_id": user_id})

    all_keys: Set[str] = set()
    all_keys |= _urls_to_s3_keys([target.get("avatar_url")])

    if target.get("role") == "client":
        diet_urls = await _diet_photo_urls_for_client(user_id)
        async for ent in db.diet_entries.find({"client_id": user_id}, {"photo_path": 1, "_id": 0}):
            p = ent.get("photo_path")
            if p:
                diet_urls.add(p)
        all_keys |= _urls_to_s3_keys(list(diet_urls))
        await db.diet_plans.delete_many({"client_id": user_id})
        await db.diet_entries.delete_many({"client_id": user_id})
        await db.batches.update_many({"client_ids": user_id}, {"$pull": {"client_ids": user_id}})

    convs = await db.conversations.find({"participants": user_id}, {"_id": 0}).to_list(5000)
    conv_events: List[Tuple[str, List[str]]] = []

    for conv in convs:
        cid = conv["id"]
        ctype = conv.get("type")
        parts = list(conv.get("participants") or [])

        if ctype == "direct" and user_id in parts:
            all_keys |= await _collect_message_file_keys(cid)
            await db.messages.delete_many({"conversation_id": cid})
            await db.conversations.delete_one({"id": cid})
            conv_events.append((cid, parts))
        elif ctype == "group" and user_id in parts:
            async for m in db.messages.find({"conversation_id": cid, "sender_id": user_id}, {"file_url": 1, "_id": 0}):
                if m.get("file_url"):
                    all_keys |= _urls_to_s3_keys([m["file_url"]])
            await db.messages.delete_many({"conversation_id": cid, "sender_id": user_id})
            new_parts = [p for p in parts if p != user_id]
            if len(new_parts) <= 1:
                all_keys |= await _collect_message_file_keys(cid)
                await db.messages.delete_many({"conversation_id": cid})
                await db.conversations.delete_one({"id": cid})
                conv_events.append((cid, parts))
            else:
                await db.conversations.update_one({"id": cid}, {"$set": {"participants": new_parts}})

    await db.complaints.delete_many(
        {"$or": [{"client_id": user_id}, {"employee_id": user_id}, {"resolved_by": user_id}]}
    )

    await db.users.update_many({"created_by": user_id}, {"$set": {"created_by": None}})
    await db.users.update_many({"password_reset_by": user_id}, {"$set": {"password_reset_by": None}})
    await db.users.update_many({"permissions_updated_by": user_id}, {"$set": {"permissions_updated_by": None}})
    await db.users.update_many({"inactive_by": user_id}, {"$set": {"inactive_by": None}})
    await db.batches.update_many({"created_by": user_id}, {"$set": {"created_by": None}})

    await db.audit_logs.delete_many({"$or": [{"actor_user_id": user_id}, {"target_user_id": user_id}]})

    await manager.force_disconnect_user(user_id)

    await db.users.delete_one({"id": user_id})

    deleted_s3 = await _delete_s3_keys(all_keys)

    for cid, parts in conv_events:
        await _emit_conversation_removed(cid, parts)

    await log_audit(
        actor_user_id=actor["id"],
        action="user.delete",
        target_user_id=user_id,
        metadata={
            "username": target.get("username"),
            "role": target.get("role"),
            "s3_objects_deleted": deleted_s3,
            "conversations_removed": len(conv_events),
        },
    )
    return {
        "ok": True,
        "deleted_user_id": user_id,
        "s3_objects_deleted": deleted_s3,
        "conversations_removed": len(conv_events),
    }


@api_router.get("/admin/conversations")
async def admin_all_conversations(user: dict = Depends(require_admin)):
    convs = await db.conversations.find({}, {"_id": 0}).sort("last_message_at", -1).to_list(1000)
    return await _enrich_conversations(convs, None)


@api_router.get("/admin/users/{user_id}/activity")
async def admin_user_activity(user_id: str, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    convs = await db.conversations.find(
        {"participants": user_id}, {"_id": 0}
    ).sort("last_message_at", -1).to_list(500)
    enriched = await _enrich_conversations(convs, None)
    msg_count = await db.messages.count_documents({"sender_id": user_id})

    return {
        "user": target,
        "conversations": enriched,
        "messages_sent": msg_count,
    }


@api_router.get("/admin/employees")
async def admin_employees(user: dict = Depends(require_admin)):
    employees = await db.users.find({"role": "employee"}, {"_id": 0, "password_hash": 0}).sort("full_name", 1).to_list(2000)
    return employees


@api_router.get("/admin/employees/{employee_id}/batches")
async def admin_employee_batches(employee_id: str, user: dict = Depends(require_admin)):
    employee = await db.users.find_one({"id": employee_id, "role": "employee"}, {"_id": 0, "password_hash": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    batches = await db.batches.find({"employee_id": employee_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    client_ids: Set[str] = set()
    for b in batches:
        for cid in (b.get("client_ids") or []):
            client_ids.add(cid)

    clients_map: Dict[str, dict] = {}
    if client_ids:
        async for c in db.users.find({"id": {"$in": list(client_ids)}}, {"_id": 0, "password_hash": 0}):
            clients_map[c["id"]] = clean_user(c)

    conv_ids = [direct_conv_id(employee_id, cid) for cid in client_ids]
    conv_map: Dict[str, dict] = {}
    if conv_ids:
        async for conv in db.conversations.find({"id": {"$in": conv_ids}}, {"_id": 0}):
            conv_map[conv["id"]] = conv

    out_batches = []
    for b in batches:
        max_clients = int(b.get("max_clients") or 20)
        client_list = []
        for cid in (b.get("client_ids") or []):
            conv_id = direct_conv_id(employee_id, cid)
            conv = conv_map.get(conv_id)
            client_list.append({
                **(clients_map.get(cid) or {"id": cid}),
                "conversation_id": conv_id,
                "conversation_last_message": conv.get("last_message") if conv else None,
                "conversation_last_message_at": conv.get("last_message_at") if conv else None,
            })

        out_batches.append({
            **enrich_batch_doc(b),
            "client_count": len(b.get("client_ids") or []),
            "max_clients": max_clients,
            "clients": client_list,
        })

    return {"employee": clean_user(employee), "batches": out_batches}


@api_router.patch("/admin/batches/{batch_id}/status")
async def admin_update_batch_status(
    batch_id: str,
    body: BatchStatusBody,
    actor: dict = Depends(require_admin),
):
    """Mark a batch active, inactive, or dropped (admin only)."""
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    status = body.status
    await db.batches.update_one(
        {"id": batch_id},
        {"$set": {"status": status, "status_updated_at": now_iso(), "status_updated_by": actor["id"]}},
    )
    await log_audit(
        actor_user_id=actor["id"],
        action="batch.status_update",
        metadata={"batch_id": batch_id, "status": status, "employee_id": batch.get("employee_id")},
    )
    updated = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    return enrich_batch_doc(updated or {})


# ---------- Batches ----------
@api_router.get("/batches/me")
async def my_batches(user: dict = Depends(get_current_user)):
    """Employees see their own batches read-only. They no longer create batches."""
    if user.get("role") != "employee":
        raise HTTPException(status_code=403, detail="Employee access required")
    batches = await db.batches.find({"employee_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for b in batches:
        b["client_count"] = len(b.get("client_ids") or [])
        b["max_clients"] = int(b.get("max_clients") or 20)
    return batches


@api_router.post("/batches")
async def create_batch(body: CreateBatchBody, actor: dict = Depends(require_admin)):
    """Only admins can create batches. They pick which employee owns the batch."""
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Batch name required")

    employee_id = (body.employee_id or "").strip()
    if not employee_id:
        raise HTTPException(status_code=400, detail="Employee is required")
    employee = await db.users.find_one({"id": employee_id, "role": "employee"}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=400, detail="Selected employee not found")

    max_clients = int(body.max_clients or 20)
    if max_clients < 1 or max_clients > 500:
        raise HTTPException(status_code=400, detail="max_clients must be between 1 and 500")

    start_date = today_date_str()
    batch = {
        "id": f"batch_{uuid.uuid4().hex}",
        "name": name[:80],
        "employee_id": employee_id,
        "client_ids": [],
        "max_clients": max_clients,
        "start_date": start_date,
        "end_date": batch_end_date_from_start(start_date),
        "status": "active",
        "created_at": now_iso(),
        "created_by": actor["id"],
    }
    await db.batches.insert_one(dict(batch))

    await log_audit(
        actor_user_id=actor["id"],
        action="batch.create",
        metadata={"batch_id": batch["id"], "name": batch["name"], "employee_id": employee_id},
    )
    return batch


@api_router.post("/admin/clients/{client_id}/assign")
async def admin_assign_client(
    client_id: str,
    body: AssignClientBody,
    actor: dict = Depends(require_admin),
):
    """Move a client to a different employee / batch.

    Steps:
      1. Validate client, target employee, target batch (and that batch belongs to target employee).
      2. Remove client from the old batch's `client_ids`.
      3. Add client to the new batch's `client_ids` (rejecting if full).
      4. Update client document's `employee_id` and `batch_id`.
      5. Make sure a direct conversation exists between the new employee and the client.
    """
    client = await db.users.find_one({"id": client_id, "role": "client"})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    new_employee_id = (body.employee_id or "").strip()
    new_batch_id = (body.batch_id or "").strip()
    if not new_employee_id or not new_batch_id:
        raise HTTPException(status_code=400, detail="employee_id and batch_id are required")

    new_employee = await db.users.find_one({"id": new_employee_id, "role": "employee"})
    if not new_employee:
        raise HTTPException(status_code=400, detail="Target employee not found")

    new_batch = await db.batches.find_one({"id": new_batch_id})
    if not new_batch:
        raise HTTPException(status_code=400, detail="Target batch not found")
    if new_batch.get("employee_id") != new_employee_id:
        raise HTTPException(status_code=400, detail="Target batch does not belong to the chosen employee")

    current_ids = new_batch.get("client_ids") or []
    max_clients = int(new_batch.get("max_clients") or 20)
    if client_id not in current_ids and len(current_ids) >= max_clients:
        raise HTTPException(status_code=400, detail="Target batch is full")

    old_batch_id = client.get("batch_id")
    old_employee_id = client.get("employee_id")

    # 1. Remove from old batch (if any and different).
    if old_batch_id and old_batch_id != new_batch_id:
        await db.batches.update_one(
            {"id": old_batch_id},
            {"$pull": {"client_ids": client_id}},
        )

    # 2. Add to new batch (idempotent).
    await db.batches.update_one(
        {"id": new_batch_id},
        {"$addToSet": {"client_ids": client_id}},
    )

    # 3. Update the client document.
    await db.users.update_one(
        {"id": client_id},
        {"$set": {"employee_id": new_employee_id, "batch_id": new_batch_id}},
    )

    # 4. Ensure a direct conversation exists between the new employee and client.
    await _ensure_direct(new_employee_id, client_id)

    await log_audit(
        actor_user_id=actor["id"],
        action="batch.assign_client",
        target_user_id=client_id,
        metadata={
            "from_employee_id": old_employee_id,
            "to_employee_id": new_employee_id,
            "from_batch_id": old_batch_id,
            "to_batch_id": new_batch_id,
        },
    )

    return {"message": "Client moved", "client_id": client_id, "batch_id": new_batch_id, "employee_id": new_employee_id}


@api_router.get("/admin/batches")
async def admin_all_batches(user: dict = Depends(require_admin)):
    """Batches across all employees, enriched with employee info (used by Create Account)."""
    batches = await db.batches.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    emp_ids = list({b.get("employee_id") for b in batches if b.get("employee_id")})
    emp_map: Dict[str, dict] = {}
    if emp_ids:
        async for e in db.users.find({"id": {"$in": emp_ids}}, {"_id": 0, "password_hash": 0}):
            emp_map[e["id"]] = clean_user(e)

    out = []
    for b in batches:
        client_count = len(b.get("client_ids") or [])
        max_clients = int(b.get("max_clients") or 20)
        out.append({
            **b,
            "client_count": client_count,
            "max_clients": max_clients,
            "employee": emp_map.get(b.get("employee_id")),
            "is_full": client_count >= max_clients,
        })
    return out


# ---------- Diet plan ----------
def _empty_meal_slot() -> Dict[str, object]:
    return {
        "suggestion": None,
        "suggestion_at": None,
        "suggestion_by": None,
        "photo_url": None,
        "photo_uploaded_at": None,
        "client_note": None,
    }


def _new_diet_day(
    *,
    client_id: str,
    employee_id: str,
    day_number: int,
    date_str: str,
    actor_id: str,
) -> Dict[str, object]:
    return {
        "id": f"diet_{uuid.uuid4().hex}",
        "client_id": client_id,
        "employee_id": employee_id,
        "day_number": day_number,
        "date": date_str,
        "created_at": now_iso(),
        "created_by": actor_id,
        "meals": {slot: _empty_meal_slot() for slot in MEAL_SLOTS},
    }


async def _diet_acl(viewer: dict, client_id: str) -> dict:
    """Return the client doc if the viewer is allowed to interact with their diet plan.

    Rules:
      - admin: any client.
      - the client themselves: own plan only.
      - employee: only clients in their assigned batches (or directly assigned).
    """
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


def _clean_diet_day(day: dict) -> dict:
    d = dict(day)
    d.pop("_id", None)
    return d


@api_router.get("/clients/{client_id}/diet-plans")
async def list_diet_plans(client_id: str, viewer: dict = Depends(get_current_user)):
    """Return every recorded day for a client in chronological order."""
    await _diet_acl(viewer, client_id)
    days = await db.diet_plans.find(
        {"client_id": client_id}, {"_id": 0}
    ).sort([("day_number", 1), ("date", 1)]).to_list(1000)
    return {"client_id": client_id, "days": days}


@api_router.post("/clients/{client_id}/diet-plans")
async def create_diet_day(
    client_id: str,
    body: DietDayCreateBody,
    viewer: dict = Depends(get_current_user),
):
    """Create a new day. Only admins and employees may seed days; clients cannot."""
    if viewer.get("role") == "client":
        raise HTTPException(status_code=403, detail="Clients cannot create diet days")
    client = await _diet_acl(viewer, client_id)

    if body.day_number is not None:
        if body.day_number < 1:
            raise HTTPException(status_code=400, detail="day_number must be >= 1")
        if await db.diet_plans.find_one({"client_id": client_id, "day_number": body.day_number}):
            raise HTTPException(status_code=409, detail=f"Day {body.day_number} already exists")
        next_day = int(body.day_number)
    else:
        latest = await db.diet_plans.find({"client_id": client_id}).sort("day_number", -1).limit(1).to_list(1)
        next_day = int(latest[0]["day_number"]) + 1 if latest else 1

    date_str = body.date or now_iso()[:10]

    day = _new_diet_day(
        client_id=client_id,
        employee_id=client.get("employee_id") or "",
        day_number=next_day,
        date_str=date_str,
        actor_id=viewer["id"],
    )

    now = now_iso()
    for slot in MEAL_SLOTS:
        text = getattr(body, slot, None)
        if text and text.strip():
            day["meals"][slot]["suggestion"] = text.strip()
            day["meals"][slot]["suggestion_at"] = now
            day["meals"][slot]["suggestion_by"] = viewer["id"]

    await db.diet_plans.insert_one(dict(day))
    await log_audit(
        actor_user_id=viewer["id"],
        action="diet_plan.day_create",
        target_user_id=client_id,
        metadata={"day_number": next_day, "date": date_str},
    )
    return _clean_diet_day(day)


@api_router.put("/diet-plans/{plan_id}/suggestions")
async def update_diet_suggestions(
    plan_id: str,
    body: DietSuggestionBody,
    viewer: dict = Depends(get_current_user),
):
    """Employee/admin updates the morning/afternoon/night suggestion text for a day.

    Sending `null` for a slot clears that suggestion. Sending an unset value leaves it untouched.
    """
    if viewer.get("role") == "client":
        raise HTTPException(status_code=403, detail="Clients cannot edit suggestions")

    day = await db.diet_plans.find_one({"id": plan_id})
    if not day:
        raise HTTPException(status_code=404, detail="Diet day not found")
    await _diet_acl(viewer, day["client_id"])

    now = now_iso()
    updates: Dict[str, object] = {}
    payload = body.dict(exclude_unset=True)
    for slot in MEAL_SLOTS:
        if slot not in payload:
            continue
        value = payload[slot]
        if value is None:
            updates[f"meals.{slot}.suggestion"] = None
            updates[f"meals.{slot}.suggestion_at"] = None
            updates[f"meals.{slot}.suggestion_by"] = None
        else:
            text = (value or "").strip()
            updates[f"meals.{slot}.suggestion"] = text or None
            updates[f"meals.{slot}.suggestion_at"] = now if text else None
            updates[f"meals.{slot}.suggestion_by"] = viewer["id"] if text else None

    if not updates:
        return _clean_diet_day(day)

    updates["updated_at"] = now
    await db.diet_plans.update_one({"id": plan_id}, {"$set": updates})
    fresh = await db.diet_plans.find_one({"id": plan_id}, {"_id": 0})
    await log_audit(
        actor_user_id=viewer["id"],
        action="diet_plan.suggestion_update",
        target_user_id=day["client_id"],
        metadata={"plan_id": plan_id, "slots": list(payload.keys())},
    )
    return fresh


@api_router.put("/diet-plans/{plan_id}/meal/{slot}/photo")
async def upload_diet_photo(
    plan_id: str,
    slot: str,
    body: DietPhotoBody,
    viewer: dict = Depends(get_current_user),
):
    """Client (or admin on behalf) records the photo they ate for `slot`.

    The upload itself is handled by the existing `/api/upload` endpoint, which
    returns a public URL — that URL is what gets passed here.
    """
    if slot not in MEAL_SLOTS:
        raise HTTPException(status_code=400, detail=f"slot must be one of {MEAL_SLOTS}")

    day = await db.diet_plans.find_one({"id": plan_id})
    if not day:
        raise HTTPException(status_code=404, detail="Diet day not found")
    client_id = day["client_id"]

    # Only the client themselves (or an admin) can mark a meal completed.
    if viewer.get("role") == "client" and viewer["id"] != client_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if viewer.get("role") == "employee":
        raise HTTPException(status_code=403, detail="Only the client (or admin) may upload meal photos")
    await _diet_acl(viewer, client_id)

    if not (body.photo_url or "").strip():
        raise HTTPException(status_code=400, detail="photo_url is required")

    now = now_iso()
    note = (body.note or "").strip() or None
    await db.diet_plans.update_one(
        {"id": plan_id},
        {
            "$set": {
                f"meals.{slot}.photo_url": body.photo_url.strip(),
                f"meals.{slot}.photo_uploaded_at": now,
                f"meals.{slot}.client_note": note,
                "updated_at": now,
            }
        },
    )
    fresh = await db.diet_plans.find_one({"id": plan_id}, {"_id": 0})
    await log_audit(
        actor_user_id=viewer["id"],
        action="diet_plan.photo_upload",
        target_user_id=client_id,
        metadata={"plan_id": plan_id, "slot": slot},
    )
    return fresh


@api_router.delete("/diet-plans/{plan_id}/meal/{slot}/photo")
async def clear_diet_photo(
    plan_id: str,
    slot: str,
    viewer: dict = Depends(get_current_user),
):
    """Client can re-take their photo by clearing the previous one."""
    if slot not in MEAL_SLOTS:
        raise HTTPException(status_code=400, detail=f"slot must be one of {MEAL_SLOTS}")
    day = await db.diet_plans.find_one({"id": plan_id})
    if not day:
        raise HTTPException(status_code=404, detail="Diet day not found")
    client_id = day["client_id"]
    if viewer.get("role") == "client" and viewer["id"] != client_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if viewer.get("role") == "employee":
        raise HTTPException(status_code=403, detail="Only the client (or admin) may clear meal photos")
    await _diet_acl(viewer, client_id)

    await db.diet_plans.update_one(
        {"id": plan_id},
        {
            "$set": {
                f"meals.{slot}.photo_url": None,
                f"meals.{slot}.photo_uploaded_at": None,
                f"meals.{slot}.client_note": None,
                "updated_at": now_iso(),
            }
        },
    )
    return await db.diet_plans.find_one({"id": plan_id}, {"_id": 0})


# ---------- Complaint box ----------
async def _hydrate_complaint(complaint: dict) -> dict:
    """Attach denormalised client / employee / resolver labels for the UI."""
    client = await db.users.find_one(
        {"id": complaint.get("client_id")},
        {"_id": 0, "id": 1, "full_name": 1, "username": 1, "phone_number": 1, "avatar_url": 1},
    )
    employee = None
    if complaint.get("employee_id"):
        employee = await db.users.find_one(
            {"id": complaint["employee_id"]},
            {"_id": 0, "id": 1, "full_name": 1, "username": 1, "phone_number": 1, "avatar_url": 1},
        )
    resolver = None
    if complaint.get("resolved_by"):
        resolver = await db.users.find_one(
            {"id": complaint["resolved_by"]},
            {"_id": 0, "id": 1, "full_name": 1},
        )
    out = {**complaint, "client": client, "employee": employee, "resolver": resolver}
    out.pop("_id", None)
    return out


@api_router.post("/complaints")
async def create_complaint(body: CreateComplaintBody, user: dict = Depends(get_current_user)):
    """A client raises a complaint (typically against their assigned employee)."""
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Only clients can raise complaints")

    # Default: complain about the assigned employee.
    employee_id = body.employee_id or user.get("employee_id")
    if employee_id:
        emp = await db.users.find_one({"id": employee_id, "role": "employee"}, {"_id": 0, "id": 1})
        if not emp:
            raise HTTPException(status_code=400, detail="Employee not found")
    else:
        employee_id = None  # unassigned complaint — admin will still see it

    doc = {
        "id": str(uuid.uuid4()),
        "client_id": user["id"],
        "employee_id": employee_id,
        "answers": [a.dict() for a in body.answers],
        "description": body.description.strip(),
        "status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "resolved_at": None,
        "resolved_by": None,
        "resolution_notes": None,
    }
    await db.complaints.insert_one(doc)
    await log_audit(
        actor_user_id=user["id"],
        action="complaint.create",
        target_user_id=employee_id,
        metadata={"complaint_id": doc["id"]},
    )
    return await _hydrate_complaint(doc)


@api_router.get("/complaints/me")
async def list_my_complaints(user: dict = Depends(get_current_user)):
    """Clients see their own complaint history (open + resolved)."""
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Only clients have a personal complaint feed")
    rows = await db.complaints.find(
        {"client_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return [await _hydrate_complaint(r) for r in rows]


@api_router.get("/admin/complaints")
async def admin_list_complaints(
    status: Optional[str] = None,
    user: dict = Depends(require_admin),
):
    """Admin inbox. `status` may be 'pending' or 'solved' to filter."""
    query: dict = {}
    if status:
        if status not in COMPLAINT_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {COMPLAINT_STATUSES}")
        query["status"] = status
    rows = await db.complaints.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [await _hydrate_complaint(r) for r in rows]


@api_router.patch("/admin/complaints/{complaint_id}")
async def admin_update_complaint(
    complaint_id: str,
    body: UpdateComplaintBody,
    admin: dict = Depends(require_admin),
):
    existing = await db.complaints.find_one({"id": complaint_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Complaint not found")

    updates: dict = {
        "status": body.status,
        "updated_at": now_iso(),
    }
    if body.status == "solved":
        updates["resolved_at"] = now_iso()
        updates["resolved_by"] = admin["id"]
        if body.resolution_notes is not None:
            updates["resolution_notes"] = body.resolution_notes.strip() or None
    else:
        # Reopening a complaint clears the resolution metadata so the audit
        # trail of when the issue was last reopened stays honest.
        updates["resolved_at"] = None
        updates["resolved_by"] = None
        if body.resolution_notes is not None:
            updates["resolution_notes"] = body.resolution_notes.strip() or None

    await db.complaints.update_one({"id": complaint_id}, {"$set": updates})
    await log_audit(
        actor_user_id=admin["id"],
        action=f"complaint.{body.status}",
        target_user_id=existing.get("client_id"),
        metadata={"complaint_id": complaint_id, "employee_id": existing.get("employee_id")},
    )
    fresh = await db.complaints.find_one({"id": complaint_id}, {"_id": 0})
    return await _hydrate_complaint(fresh)


# ---------- Conversations ----------
async def _assert_client_conversation_policy(user: dict, conv: dict, *, write: bool) -> None:
    """Clients may only access a direct thread with their currently assigned employee."""
    if user.get("role") != "client":
        return
    if conv.get("type") != "direct":
        raise HTTPException(
            status_code=403,
            detail="Clients may only chat with their assigned employee",
        )
    assigned = (user.get("employee_id") or "").strip()
    other_id = next((p for p in conv.get("participants", []) if p != user["id"]), None)
    if not other_id:
        raise HTTPException(status_code=403, detail="Access denied")
    other = await db.users.find_one({"id": other_id}, {"_id": 0, "role": 1})
    if not other:
        raise HTTPException(status_code=403, detail="Access denied")
    other_role = (other.get("role") or "").strip().lower()
    if other_role == "admin":
        raise HTTPException(status_code=403, detail="Clients cannot chat with administrators")
    if other_role == "client":
        raise HTTPException(status_code=403, detail="Clients cannot chat with other clients")
    if other_role != "employee":
        raise HTTPException(status_code=403, detail="Access denied")
    if write:
        if not assigned:
            raise HTTPException(status_code=403, detail="No employee assigned")
        if other_id != assigned:
            raise HTTPException(
                status_code=403,
                detail="You can only message your assigned employee",
            )
    elif other_id != assigned:
        raise HTTPException(
            status_code=403,
            detail="This conversation is no longer available",
        )


def _client_allowed_conversation_ids(user: dict) -> Optional[Set[str]]:
    """When role is client, return the sole allowed conv id set, or empty if unassigned."""
    if user.get("role") != "client":
        return None
    assigned = (user.get("employee_id") or "").strip()
    if not assigned:
        return set()
    return {direct_conv_id(user["id"], assigned)}


async def _ensure_direct(user_a: str, user_b: str) -> dict:
    cid = direct_conv_id(user_a, user_b)
    conv = await db.conversations.find_one({"id": cid}, {"_id": 0})
    if not conv:
        conv = {
            "id": cid,
            "type": "direct",
            "name": None,
            "participants": sorted([user_a, user_b]),
            "created_by": user_a,
            "created_at": now_iso(),
            "last_message": None,
            "last_message_at": now_iso(),
        }
        await db.conversations.insert_one(dict(conv))
    return conv


@api_router.post("/conversations/start")
async def start_conversation(body: StartDirectBody, user: dict = Depends(get_current_user)):
    if user.get("role") == "client":
        raise HTTPException(
            status_code=403,
            detail="Clients cannot start new conversations",
        )
    other = await db.users.find_one({"id": body.other_user_id}, {"_id": 0, "password_hash": 0})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    if other["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot chat with yourself")
    if user.get("role") == "employee" and other.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Employees cannot start chats with administrators")
    conv = await _ensure_direct(user["id"], other["id"])
    return {"conversation": conv, "other_user": other}


@api_router.get("/conversations/assigned-employee")
async def client_assigned_employee_chat(user: dict = Depends(get_current_user)):
    """Client portal: assigned employee thread (auto-created when employee is assigned)."""
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Clients only")
    assigned = (user.get("employee_id") or "").strip()
    if not assigned:
        return {"employee": None, "conversation": None}
    employee = await db.users.find_one(
        {"id": assigned, "role": "employee"},
        {"_id": 0, "password_hash": 0},
    )
    if not employee:
        return {"employee": None, "conversation": None}
    conv = await _ensure_direct(assigned, user["id"])
    enriched = await _enrich_conversations([conv], user["id"])
    conversation = enriched[0] if enriched else None
    if conversation is not None:
        conversation["client_can_write"] = True
    return {"employee": clean_user(employee), "conversation": conversation}


@api_router.post("/conversations/group")
async def create_group(body: CreateGroupBody, user: dict = Depends(get_current_user)):
    if user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Clients cannot create group chats")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name required")

    members = list(set(body.member_ids + [user["id"]]))
    if len(members) < 2:
        raise HTTPException(status_code=400, detail="Group needs at least 2 members")

    found = await db.users.find({"id": {"$in": members}}, {"id": 1, "_id": 0}).to_list(len(members))
    if len(found) != len(members):
        raise HTTPException(status_code=400, detail="One or more members not found")

    conv = {
        "id": f"group_{uuid.uuid4().hex}",
        "type": "group",
        "name": name[:80],
        "participants": members,
        "created_by": user["id"],
        "created_at": now_iso(),
        "last_message": None,
        "last_message_at": now_iso(),
    }
    await db.conversations.insert_one(dict(conv))
    return conv


def _sort_conversations_for_viewer(convs: List[dict]) -> List[dict]:
    """Pinned threads first (most recent activity), then the rest."""

    def by_recent(c: dict) -> str:
        return c.get("last_message_at") or c.get("created_at") or ""

    pinned = sorted([c for c in convs if c.get("is_pinned")], key=by_recent, reverse=True)
    rest = sorted([c for c in convs if not c.get("is_pinned")], key=by_recent, reverse=True)
    return pinned + rest


async def _load_conversation_preferences(viewer_id: str, conv_ids: List[str]) -> Dict[str, dict]:
    if not viewer_id or not conv_ids:
        return {}
    prefs_map: Dict[str, dict] = {}
    async for pref in db.conversation_preferences.find(
        {"user_id": viewer_id, "conversation_id": {"$in": conv_ids}},
        {"_id": 0},
    ):
        prefs_map[pref["conversation_id"]] = pref
    return prefs_map


async def _enrich_conversations(convs: List[dict], viewer_id: Optional[str]) -> List[dict]:
    user_ids = set()
    for c in convs:
        for p in c["participants"]:
            user_ids.add(p)

    users_map = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "password_hash": 0}):
            users_map[u["id"]] = u

    unread_map: Dict[str, int] = {}
    prefs_map: Dict[str, dict] = {}
    if viewer_id:
        pipeline = [
            {"$match": {"recipient_ids": viewer_id, "read_by": {"$ne": viewer_id}}},
            {"$group": {"_id": "$conversation_id", "count": {"$sum": 1}}},
        ]
        async for row in db.messages.aggregate(pipeline):
            unread_map[row["_id"]] = int(row["count"])
        prefs_map = await _load_conversation_preferences(viewer_id, [c["id"] for c in convs])

    result = []
    for c in convs:
        parts = [users_map.get(p) for p in c["participants"] if users_map.get(p)]
        other = None
        if c["type"] == "direct" and viewer_id:
            other_id = next((p for p in c["participants"] if p != viewer_id), None)
            other = users_map.get(other_id) if other_id else None
        pref = prefs_map.get(c["id"], {})
        result.append({
            **c,
            "participants_info": parts,
            "other_user": other,
            "unread_count": unread_map.get(c["id"], 0) if viewer_id else 0,
            "is_pinned": bool(pref.get("is_pinned")),
            "is_archived": bool(pref.get("is_archived")),
            "is_muted": bool(pref.get("is_muted")),
        })
    if viewer_id:
        return _sort_conversations_for_viewer(result)
    return result


@api_router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    allowed = _client_allowed_conversation_ids(user)
    if allowed is not None:
        if not allowed:
            return []
        convs = await db.conversations.find(
            {"id": {"$in": list(allowed)}},
            {"_id": 0},
        ).to_list(5)
    else:
        convs = await db.conversations.find(
            {"participants": user["id"]}, {"_id": 0}
        ).sort("last_message_at", -1).to_list(500)
    enriched = await _enrich_conversations(convs, user["id"])
    if allowed is not None:
        for c in enriched:
            c["client_can_write"] = True
    return enriched


@api_router.patch("/conversations/{conv_id}/preferences")
async def update_conversation_preferences(
    conv_id: str,
    body: ConversationPreferencesBody,
    user: dict = Depends(get_current_user),
):
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0, "participants": 1})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user["role"] != "admin" and user["id"] not in conv.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied")
    await _assert_client_conversation_policy(user, conv, write=True)

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No preference fields provided")

    pref_id = f"{user['id']}_{conv_id}"
    existing = await db.conversation_preferences.find_one(
        {"user_id": user["id"], "conversation_id": conv_id},
        {"_id": 0},
    )
    doc = {
        "id": pref_id,
        "user_id": user["id"],
        "conversation_id": conv_id,
        "is_pinned": bool((existing or {}).get("is_pinned")),
        "is_archived": bool((existing or {}).get("is_archived")),
        "is_muted": bool((existing or {}).get("is_muted")),
        **updates,
        "updated_at": now_iso(),
    }
    await db.conversation_preferences.update_one(
        {"user_id": user["id"], "conversation_id": conv_id},
        {"$set": doc},
        upsert=True,
    )
    return {
        "conversation_id": conv_id,
        "is_pinned": doc["is_pinned"],
        "is_archived": doc["is_archived"],
        "is_muted": doc["is_muted"],
    }


@api_router.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user["role"] != "admin" and user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Access denied")
    await _assert_client_conversation_policy(user, conv, write=False)

    messages = await db.messages.find({"conversation_id": conv_id}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return messages


@api_router.post("/messages")
async def send_message(body: MessageBody, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": body.conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")
    await _assert_client_conversation_policy(user, conv, write=True)

    msg = {
        "id": str(uuid.uuid4()),
        "conversation_id": conv["id"],
        "conversation_type": conv["type"],
        "sender_id": user["id"],
        "sender_name": user["full_name"],
        "recipient_ids": [p for p in conv["participants"] if p != user["id"]],
        "content": body.content,
        "message_type": body.message_type,
        "file_url": body.file_url,
        "file_name": body.file_name,
        "created_at": now_iso(),
        "read_by": [user["id"]],
        "status": "sent",
    }
    if body.client_message_id:
        msg["client_message_id"] = body.client_message_id.strip()
        msg["client_temp_id"] = msg["client_message_id"]
    if body.reply_to_id:
        msg["reply_to_id"] = body.reply_to_id.strip()
        msg["reply_to_snippet"] = (body.reply_to_snippet or "")[:500]
        msg["reply_to_sender"] = (body.reply_to_sender or "")[:120]
    if body.is_forwarded:
        msg["is_forwarded"] = True
        if body.original_sender_id:
            msg["original_sender_id"] = body.original_sender_id.strip()

    await db.messages.insert_one(dict(msg))
    preview = body.content if body.message_type == "text" else f"[{body.message_type}]"
    if conv["type"] == "group":
        preview = f"{user['full_name']}: {preview}"

    await db.conversations.update_one(
        {"id": conv["id"]},
        {
            "$set": {
                "last_message": preview,
                "last_message_at": msg["created_at"],
                "last_message_sender_id": user["id"],
                "last_message_type": body.message_type,
                "last_message_read_by": msg.get("read_by", []),
            }
        },
    )

    await manager.broadcast_message(msg, conv)

    if conv["type"] == "group":
        fcm_title = (conv.get("name") or "Group")[:80]
        fcm_body = preview
    else:
        fcm_title = (user.get("full_name") or "New message")[:80]
        fcm_body = preview
    sender_avatar = (user.get("avatar_url") or "").strip()
    fcm_data = {
        "type": "new_message",
        "conversation_id": conv["id"],
        "message_id": msg["id"],
        "sender_id": str(user["id"]),
        "sender_avatar_url": sender_avatar,
    }
    for recipient_id in msg["recipient_ids"]:
        _schedule_fcm_for_recipient(
            recipient_id=recipient_id,
            title=fcm_title,
            body=fcm_body,
            data=fcm_data,
            conversation_id=conv["id"],
            sender_id=str(user["id"]),
        )

    return msg


def _is_high_priority_notification_action(request: Request) -> bool:
    return (request.headers.get("X-Priority") or "").strip().lower() == "high"


async def _notify_sender_message_status(msg: dict, status: str, actor_id: Optional[str] = None) -> None:
    """Push delivery/read ticks to the original sender over WebSocket."""
    message_id = msg.get("id")
    sender_id = (msg.get("sender_id") or "").strip()
    if not sender_id:
        logger.warning("status_update: missing sender_id for message_id=%s", message_id)
        return

    event: Dict[str, Any] = {
        "type": "status_update",
        "message_id": message_id,
        "status": status,
        "conversation_id": msg.get("conversation_id"),
    }
    if actor_id:
        event["updated_by"] = actor_id

    active_ws = len(manager.active.get(sender_id, set()))
    logger.info(
        "status_update ws -> sender_id=%s message_id=%s status=%s active_ws=%s",
        sender_id,
        message_id,
        status,
        active_ws,
    )
    await manager.send_event(sender_id, event)


async def _notify_sender_status_batch(
    sender_id: str,
    message_ids: List[str],
    status: str,
    conversation_id: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> None:
    """Batch status_update for one sender (blue ticks without N WS frames)."""
    if not sender_id or not message_ids:
        return
    event: Dict[str, Any] = {
        "type": "status_update",
        "status": status,
        "message_ids": message_ids,
    }
    if conversation_id:
        event["conversation_id"] = conversation_id
    if actor_id:
        event["updated_by"] = actor_id
    if len(message_ids) == 1:
        event["message_id"] = message_ids[0]
    logger.info(
        "status_update batch ws -> sender_id=%s count=%s status=%s",
        sender_id,
        len(message_ids),
        status,
    )
    await manager.send_event(sender_id, event)


async def _apply_message_status_update(message_id: str, new_status: str, actor_id: str) -> Optional[dict]:
    """Upgrade message status (sent → delivered → seen) and notify the sender."""
    if new_status not in MESSAGE_STATUS_ORDER:
        raise HTTPException(status_code=400, detail="Invalid status")

    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    if actor_id not in (msg.get("recipient_ids") or []):
        raise HTTPException(status_code=403, detail="Only recipients can update delivery status")

    current = (msg.get("status") or "sent").strip().lower()
    if MESSAGE_STATUS_ORDER.get(new_status, -1) <= MESSAGE_STATUS_ORDER.get(current, 0):
        # Idempotent retry — re-push WS so sender ticks update (e.g. duplicate "seen").
        notify_status = (
            new_status
            if MESSAGE_STATUS_ORDER.get(new_status, 0) >= MESSAGE_STATUS_ORDER.get(current, 0)
            else current
        )
        await _notify_sender_message_status(msg, notify_status, actor_id)
        return {"message_id": message_id, "status": current, "conversation_id": msg["conversation_id"]}

    update_fields: Dict[str, Any] = {"status": new_status}
    if new_status == "seen":
        await db.messages.update_one(
            {"id": message_id},
            {"$set": update_fields, "$addToSet": {"read_by": actor_id}},
        )
    else:
        await db.messages.update_one({"id": message_id}, {"$set": update_fields})

    fresh = await db.messages.find_one(
        {"id": message_id},
        {"_id": 0, "id": 1, "sender_id": 1, "conversation_id": 1, "status": 1},
    )
    if not fresh:
        logger.warning("status_update: message vanished after update id=%s", message_id)
        return {"message_id": message_id, "status": new_status, "conversation_id": msg["conversation_id"]}

    await _notify_sender_message_status(fresh, new_status, actor_id)

    return {"message_id": message_id, "status": new_status, "conversation_id": msg["conversation_id"]}


@api_router.post("/notifications/update-status")
async def notification_update_status(
    body: UpdateMessageStatusBody,
    user: dict = Depends(get_current_user),
):
    """Update delivery/read ticks (delivered / seen) from mobile or web clients."""
    return await _apply_message_status_update(body.message_id, body.status.strip().lower(), user["id"])


async def _apply_message_status_batch(
    message_ids: List[str],
    new_status: str,
    actor_id: str,
) -> Dict[str, Any]:
    """Upgrade many messages in one request; notify each sender with batched WS events."""
    if new_status not in MESSAGE_STATUS_ORDER:
        raise HTTPException(status_code=400, detail="Invalid status")

    unique_ids = list(dict.fromkeys(m.strip() for m in message_ids if m and str(m).strip()))
    if not unique_ids:
        return {"status": new_status, "updated_ids": [], "message_ids": []}

    cursor = db.messages.find({"id": {"$in": unique_ids}}, {"_id": 0})
    docs = await cursor.to_list(len(unique_ids))
    by_id = {d["id"]: d for d in docs}

    updated_ids: List[str] = []
    notify_by_sender: Dict[str, List[str]] = {}
    conv_by_sender: Dict[str, str] = {}

    for message_id in unique_ids:
        msg = by_id.get(message_id)
        if not msg:
            continue
        if actor_id not in (msg.get("recipient_ids") or []):
            continue

        sender_id = (msg.get("sender_id") or "").strip()
        if not sender_id:
            continue

        current = (msg.get("status") or "sent").strip().lower()
        notify_status = new_status

        if MESSAGE_STATUS_ORDER.get(new_status, -1) <= MESSAGE_STATUS_ORDER.get(current, 0):
            notify_status = (
                new_status
                if MESSAGE_STATUS_ORDER.get(new_status, 0) >= MESSAGE_STATUS_ORDER.get(current, 0)
                else current
            )
        else:
            update_fields: Dict[str, Any] = {"status": new_status}
            if new_status == "seen":
                await db.messages.update_one(
                    {"id": message_id},
                    {"$set": update_fields, "$addToSet": {"read_by": actor_id}},
                )
            else:
                await db.messages.update_one({"id": message_id}, {"$set": update_fields})
            updated_ids.append(message_id)

        notify_by_sender.setdefault(sender_id, []).append(message_id)
        if msg.get("conversation_id"):
            conv_by_sender.setdefault(sender_id, msg["conversation_id"])

    for sender_id, mids in notify_by_sender.items():
        await _notify_sender_status_batch(
            sender_id,
            mids,
            new_status,
            conv_by_sender.get(sender_id),
            actor_id,
        )

    return {
        "status": new_status,
        "updated_ids": updated_ids,
        "message_ids": unique_ids,
    }


@api_router.post("/notifications/update-status-batch")
async def notification_update_status_batch(
    body: UpdateMessageStatusBatchBody,
    user: dict = Depends(get_current_user),
):
    """Batch delivery/read tick updates (single round-trip from mobile)."""
    return await _apply_message_status_batch(
        body.message_ids,
        body.status.strip().lower(),
        user["id"],
    )


@api_router.post("/notifications/direct-reply")
async def notification_direct_reply(
    request: Request,
    body: NotificationSendBody,
    user: dict = Depends(get_current_user),
):
    """Send a text reply from an Android notification inline reply."""
    if _is_high_priority_notification_action(request):
        logger.debug("notification direct-reply high priority user=%s", user.get("id"))
    conv_id = (body.conversation_id or "").strip()
    if not conv_id:
        msg_doc = await db.messages.find_one({"id": body.message_id}, {"_id": 0, "conversation_id": 1})
        if not msg_doc:
            raise HTTPException(status_code=404, detail="Message not found")
        conv_id = msg_doc["conversation_id"]
    return await send_message(
        MessageBody(conversation_id=conv_id, content=body.text, message_type="text"),
        user,
    )


@api_router.post("/notifications/mark-read")
async def notification_mark_read_route(
    request: Request,
    body: NotificationMarkReadBody,
    user: dict = Depends(get_current_user),
):
    """Mark conversation read from an Android notification action."""
    if _is_high_priority_notification_action(request):
        logger.debug("notification mark-read high priority user=%s", user.get("id"))
    conv_id = (body.conversation_id or "").strip()
    if conv_id:
        return await mark_read(conv_id, user)
    msg_doc = await db.messages.find_one({"id": body.message_id}, {"_id": 0, "conversation_id": 1})
    if not msg_doc:
        raise HTTPException(status_code=404, detail="Message not found")
    return await mark_read(msg_doc["conversation_id"], user)


@api_router.post("/send-message")
async def notification_send_message(
    request: Request,
    body: NotificationSendBody,
    user: dict = Depends(get_current_user),
):
    """Send a text reply triggered from an Android notification action (legacy path)."""
    if _is_high_priority_notification_action(request):
        logger.debug("notification send-message high priority user=%s", user.get("id"))
    conv_id = (body.conversation_id or "").strip()
    if not conv_id:
        msg_doc = await db.messages.find_one({"id": body.message_id}, {"_id": 0, "conversation_id": 1})
        if not msg_doc:
            raise HTTPException(status_code=404, detail="Message not found")
        conv_id = msg_doc["conversation_id"]
    return await send_message(
        MessageBody(conversation_id=conv_id, content=body.text, message_type="text"),
        user,
    )


@api_router.post("/mark-read")
async def notification_mark_read(
    request: Request,
    body: NotificationMarkReadBody,
    user: dict = Depends(get_current_user),
):
    """Mark conversation read from an Android notification action."""
    if _is_high_priority_notification_action(request):
        logger.debug("notification mark-read high priority user=%s", user.get("id"))
    conv_id = (body.conversation_id or "").strip()
    if conv_id:
        return await mark_read(conv_id, user)
    msg_doc = await db.messages.find_one({"id": body.message_id}, {"_id": 0, "conversation_id": 1})
    if not msg_doc:
        raise HTTPException(status_code=404, detail="Message not found")
    return await mark_read(msg_doc["conversation_id"], user)


@api_router.post("/conversations/{conv_id}/read")
async def mark_read(conv_id: str, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")
    await _assert_client_conversation_policy(user, conv, write=False)

    to_mark = await db.messages.find(
        {
            "conversation_id": conv_id,
            "recipient_ids": user["id"],
            "read_by": {"$ne": user["id"]},
        },
        {"_id": 0, "id": 1, "sender_id": 1},
    ).to_list(500)

    result = await db.messages.update_many(
        {
            "conversation_id": conv_id,
            "recipient_ids": user["id"],
            "read_by": {"$ne": user["id"]},
        },
        {"$addToSet": {"read_by": user["id"]}, "$set": {"status": "seen"}},
    )

    for m in to_mark:
        await _notify_sender_message_status(
            {"id": m["id"], "sender_id": m.get("sender_id"), "conversation_id": conv_id},
            "seen",
            user["id"],
        )

    latest = await db.messages.find_one(
        {"conversation_id": conv_id},
        {"_id": 0, "read_by": 1},
        sort=[("created_at", -1)],
    )
    if latest:
        await db.conversations.update_one(
            {"id": conv_id},
            {"$set": {"last_message_read_by": latest.get("read_by", [])}},
        )

    for pid in conv["participants"]:
        if pid != user["id"]:
            await manager.send_event(pid, {
                "type": "read_receipt",
                "conversation_id": conv_id,
                "reader_id": user["id"],
            })

    return {"updated": result.modified_count}


# ---------- File Upload ----------
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    file_id = f"{uuid.uuid4().hex}{ext}"
    mime = (file.content_type or "").lower()

    if S3_BUCKET:
        key = f"uploads/{file_id}"
        try:
            file_url = _upload_to_s3(file.file, key, mime)
        except Exception as e:
            logger.warning(f"S3 upload error: {e}")
            raise HTTPException(status_code=503, detail="Upload failed. Please try again.")
    else:
        dest = UPLOAD_DIR / file_id
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
        file_url = f"/api/files/{file_id}"

    if mime.startswith("image/"):
        ftype = "image"
    elif mime.startswith("video/"):
        ftype = "video"
    elif mime.startswith("audio/"):
        ftype = "audio"
    else:
        ftype = "file"

    return {
        "file_url": file_url,
        "file_name": file.filename,
        "message_type": ftype,
    }


@api_router.get("/files/{file_id}")
async def get_file(file_id: str):
    path = UPLOAD_DIR / file_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path))


# ---------- WebSocket Manager ----------
class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, Set[WebSocket]] = {}

    def has_active_connection(self, user_id: str) -> bool:
        """True when at least one WebSocket is still registered for this user."""
        return bool(self.active.get(user_id))

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(user_id, set()).add(ws)
        ts = now_iso()
        await db.users.update_one({"id": user_id}, {"$set": {"online": True, "last_seen": ts}})
        await self._broadcast_presence(user_id, True, ts)

    async def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self.active:
            self.active[user_id].discard(ws)
            if not self.active[user_id]:
                self.active.pop(user_id, None)
                ts = now_iso()
                await db.users.update_one({"id": user_id}, {"$set": {"online": False, "last_seen": ts}})
                await self._broadcast_presence(user_id, False, ts)

    async def send_event(self, user_id: str, event: dict):
        dead = []
        for ws in list(self.active.get(user_id, set())):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                self.active.get(user_id, set()).discard(ws)
            except Exception:
                pass

    async def send_force_logout(self, user_id: str, reason: str = SESSION_INVALID_REASON) -> None:
        """Notify connected clients then close sockets (single-session takeover)."""
        await self.send_event(user_id, {"type": "force_logout", "reason": reason})
        if self.has_active_connection(user_id):
            await self.force_disconnect_user(user_id)

    async def broadcast_message(self, msg: dict, conv: dict):
        event = {
            "type": "message",
            "message": msg,
            "conversation": {
                "id": conv["id"],
                "type": conv["type"],
                "name": conv.get("name"),
                "participants": conv["participants"],
            },
        }

        for pid in conv["participants"]:
            await self.send_event(pid, event)

        admin_ids = await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(100)
        for a in admin_ids:
            if a["id"] not in conv["participants"]:
                await self.send_event(a["id"], event)

    async def broadcast_typing(self, sender_id: str, sender_name: str, conv_id: str, participants: List[str], is_typing: bool):
        event = {
            "type": "typing",
            "sender_id": sender_id,
            "sender_name": sender_name,
            "conversation_id": conv_id,
            "is_typing": is_typing,
        }

        for pid in participants:
            if pid != sender_id:
                await self.send_event(pid, event)

        admin_ids = await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(100)
        for a in admin_ids:
            if a["id"] not in participants:
                await self.send_event(a["id"], event)

    async def broadcast_profile_update(self, user_id: str):
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if not user:
            return
        event = {"type": "profile", "user": user}
        for uid in list(self.active.keys()):
            await self.send_event(uid, event)

    async def _broadcast_presence(self, user_id: str, online: bool, last_seen: str):
        event = {"type": "presence", "user_id": user_id, "online": online, "last_seen": last_seen}
        for uid in list(self.active.keys()):
            await self.send_event(uid, event)

    async def force_disconnect_user(self, user_id: str):
        """Close every WebSocket for a user (e.g. after admin account deletion)."""
        sockets = list(self.active.pop(user_id, set()))
        for ws in sockets:
            try:
                await ws.close(code=4000)
            except Exception:
                pass
        ts = now_iso()
        try:
            await db.users.update_one({"id": user_id}, {"$set": {"online": False, "last_seen": ts}})
        except Exception:
            pass
        await self._broadcast_presence(user_id, False, ts)


manager = ConnectionManager()


def _schedule_fcm_for_recipient(
    *,
    recipient_id: str,
    title: str,
    body: str,
    data: Dict[str, str],
    conversation_id: str,
    sender_id: str,
) -> None:
    """
    Queue FCM for a message recipient.

    Sends push even when a WebSocket is still open — mobile WebViews often keep the
    socket connected while the app is backgrounded. Logs websocket_active so PM2 logs
    show why push was scheduled.
    """

    async def _run() -> None:
        ws_active = manager.has_active_connection(recipient_id)
        logger.info(
            "Scheduling FCM for user_id=%s conversation_id=%s websocket_active=%s",
            recipient_id,
            conversation_id,
            ws_active,
        )
        if not ws_active:
            logger.info(
                "Recipient user_id=%s has no active WebSocket — FCM required for delivery",
                recipient_id,
            )
        await send_fcm_notification(
            recipient_id,
            title,
            body,
            data,
            conversation_id=conversation_id,
            sender_id=sender_id,
        )

    task = asyncio.create_task(_run())

    def _on_done(t: asyncio.Task) -> None:
        try:
            t.result()
        except Exception:
            logger.exception("FCM background task failed for user_id=%s", recipient_id)

    task.add_done_callback(_on_done)


@app.websocket("/api/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    browser_id: Optional[str] = Query(None, alias="bid"),
):
    try:
        jwt_token = (token or "").strip() or (websocket.cookies.get(AUTH_COOKIE_NAME) or "").strip()
        if not jwt_token:
            logger.warning("WS reject: missing token (query or cookie)")
            await websocket.close(code=4401)
            return

        payload = jwt.decode(jwt_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        try:
            _assert_jwt_browser_binding_ws(payload, browser_id)
        except HTTPException:
            logger.warning("WS reject: browser binding mismatch")
            await websocket.close(code=4401)
            return
        try:
            await assert_active_session(payload.get("jti"))
        except HTTPException:
            logger.warning("WS reject: inactive session jti=%s", payload.get("jti"))
            await websocket.close(code=4401)
            return
        user_id = payload.get("sub")
        if not user_id:
            logger.warning("WS reject: token missing sub")
            await websocket.close(code=4401)
            return
    except Exception as e:
        logger.warning(f"WS reject: invalid token: {e}")
        await websocket.close(code=4401)
        return

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        logger.warning(f"WS reject: user not found for sub={user_id}")
        await websocket.close(code=4401)
        return

    await manager.connect(user_id, websocket)
    logger.info(f"WS connected: user_id={user_id} username={user.get('username')}")

    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except Exception:
                continue

            if payload.get("type") == "typing":
                conv_id = payload.get("conversation_id")
                if not conv_id:
                    continue

                conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
                if not conv or user_id not in conv["participants"]:
                    continue

                await manager.broadcast_typing(
                    user_id,
                    user["full_name"],
                    conv_id,
                    conv["participants"],
                    bool(payload.get("is_typing")),
                )

            elif payload.get("type") == "ping":
                ts = now_iso()
                await db.users.update_one({"id": user_id}, {"$set": {"last_seen": ts}})
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: user_id={user_id}")
        await manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.warning(f"WS error for user_id={user_id}: {e}")
        await manager.disconnect(user_id, websocket)


# ---------- Startup ----------
ADMIN_USER_ID = "admin-user-id"


# Seed users handled separately so the migration doesn't claim their canonical
# phones with placeholders.
_SEED_USERNAMES = {"admin", "employee1", "client1"}


async def _migrate_user_documents() -> None:
    """Make legacy documents compatible with the phone-based schema.

    - Drops the old unique email index if present (email is now optional).
    - Backfills phone_number for any user that doesn't have one (using a
      deterministic placeholder so the admin can later edit them).
    - Ensures account_creation_access / created_by fields exist.
    """
    try:
        existing = await db.users.index_information()
        for name, spec in list(existing.items()):
            keys = spec.get("key") or []
            if keys and keys[0][0] == "email" and spec.get("unique"):
                try:
                    await db.users.drop_index(name)
                    logger.info("Dropped legacy unique email index: %s", name)
                except Exception as e:
                    logger.warning("Could not drop legacy email index %s: %s", name, e)
    except Exception as e:
        logger.warning("Could not inspect user indexes: %s", e)

    seed_username = normalize_username(os.environ.get("ADMIN_USERNAME", "admin"))
    skip_usernames = set(_SEED_USERNAMES) | {seed_username}

    cursor = db.users.find({
        "username": {"$nin": list(skip_usernames)},
        "$or": [
            {"phone_number": {"$exists": False}},
            {"phone_number": None},
            {"phone_number": ""},
        ],
    })
    seq = 1
    async for u in cursor:
        # Deterministic placeholder for legacy users; admin should reset later.
        suffix = (str(abs(hash(u.get("id", "")))) + "0000000000")[:10]
        placeholder = f"+91{suffix}"
        while await db.users.find_one({"phone_number": placeholder, "id": {"$ne": u["id"]}}):
            seq += 1
            placeholder = f"+91{(str(seq)).zfill(10)}"
        await db.users.update_one({"id": u["id"]}, {"$set": {"phone_number": placeholder}})

    await db.users.update_many(
        {"account_creation_access": {"$exists": False}},
        {"$set": {"account_creation_access": False}},
    )
    await db.users.update_many({"created_by": {"$exists": False}}, {"$set": {"created_by": None}})
    await db.users.update_many({"password_reset_by": {"$exists": False}}, {"$set": {"password_reset_by": None}})
    # Active-status lifecycle (everyone defaults to active; admins flip clients off later).
    await db.users.update_many(
        {"is_active": {"$exists": False}},
        {"$set": {"is_active": True, "inactive_at": None, "inactive_by": None}},
    )
    async for u in db.users.find({"role": "client", "client_status": {"$exists": False}}, {"id": 1, "is_active": 1}):
        cs = "inactive" if u.get("is_active") is False else "active"
        await db.users.update_one({"id": u["id"]}, {"$set": {"client_status": cs}})
    async for b in db.batches.find({}, {"id": 1, "created_at": 1, "start_date": 1, "status": 1, "end_date": 1}):
        patch: Dict[str, object] = {}
        if not b.get("status"):
            patch["status"] = "active"
        start = (b.get("start_date") or (b.get("created_at") or "")[:10] or today_date_str())[:10]
        if not b.get("start_date"):
            patch["start_date"] = start
        if not b.get("end_date"):
            patch["end_date"] = batch_end_date_from_start(start)
        if patch:
            await db.batches.update_one({"id": b["id"]}, {"$set": patch})
    # Medical profile defaults for existing client accounts (admin can populate later).
    await db.users.update_many(
        {"role": "client", "medical_profile": {"$exists": False}},
        {
            "$set": {
                "medical_profile": None,
                "medical_profile_updated_at": None,
                "medical_profile_updated_by": None,
            }
        },
    )


async def _reconcile_phone(target_user_id: str, desired_phone: str) -> Optional[str]:
    """Force a seeded user's phone_number to `desired_phone`, freeing it first
    from any other row that happens to be squatting on it. Returns the phone
    actually assigned (or None if reconciliation failed).
    """
    try:
        squatter = await db.users.find_one({"phone_number": desired_phone, "id": {"$ne": target_user_id}})
        if squatter:
            # Move the squatter to a deterministic placeholder so the seeded user can claim its phone.
            suffix = (str(abs(hash(squatter.get("id", "")))) + "0000000000")[:10]
            placeholder = f"+91{suffix}"
            n = 1
            while await db.users.find_one({"phone_number": placeholder, "id": {"$ne": squatter["id"]}}):
                n += 1
                placeholder = f"+91{(str(n)).zfill(10)}"
            await db.users.update_one(
                {"id": squatter["id"]},
                {"$set": {"phone_number": placeholder}},
            )
            logger.warning(
                "Phone %s was held by user_id=%s; moved them to placeholder %s so the seeded account can use it.",
                desired_phone, squatter.get("id"), placeholder,
            )
        await db.users.update_one({"id": target_user_id}, {"$set": {"phone_number": desired_phone}})
        return desired_phone
    except Exception as e:
        logger.warning("Failed to reconcile phone for user_id=%s: %s", target_user_id, e)
        return None


@app.on_event("startup")
async def on_startup():
    try:
        await client.admin.command("ping")
        logger.info("MongoDB connection established")

        await _migrate_user_documents()

        await db.users.create_index("username", unique=True)
        await db.users.create_index("phone_number", unique=True)
        await db.conversations.create_index("participants")
        await db.messages.create_index("conversation_id")
        await db.messages.create_index("created_at")
        await db.batches.create_index("employee_id")
        await db.batches.create_index([("employee_id", 1), ("name", 1)])
        await db.audit_logs.create_index([("timestamp", -1)])
        await db.audit_logs.create_index("actor_user_id")
        await db.audit_logs.create_index("target_user_id")
        await db.audit_logs.create_index("action")
        await db.diet_plans.create_index([("client_id", 1), ("day_number", 1)], unique=True)
        await db.diet_plans.create_index([("client_id", 1), ("date", 1)])
        await db.conversation_preferences.create_index(
            [("user_id", 1), ("conversation_id", 1)], unique=True
        )
        await db.complaints.create_index([("status", 1), ("created_at", -1)])
        await db.complaints.create_index("client_id")
        await db.complaints.create_index("employee_id")
        await db.folders.create_index([("created_at", -1)])
        await db.folders.create_index("created_by_type")
        await db.folders.create_index("created_by_id")
        await db.diet_entries.create_index([("client_id", 1), ("day_number", 1)])
        await db.diet_entries.create_index([("client_id", 1), ("entry_date", 1)])
        await db.folder_items.create_index("folder_id")
        await db.folder_items.create_index([("folder_id", 1), ("category", 1)])
        await migrate_folders_schema(db)

        if _init_firebase():
            logger.info("Firebase Admin ready — background push (FCM) enabled")
        else:
            logger.warning(
                "Firebase Admin NOT configured — push notifications will not be sent. "
                "Set FIREBASE_SERVICE_ACCOUNT_FILE or FIREBASE_SERVICE_ACCOUNT_JSON, "
                "or add firebase-adminsdk.json under backend/"
            )
    except Exception as e:
        logger.exception("Database startup failed")
        raise RuntimeError(
            "Database startup failed. Check MONGO_URL, Atlas username/password, "
            "and URL-encode special characters in the password."
        ) from e

    admin_username = normalize_username(os.environ.get("ADMIN_USERNAME", "admin"))
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin_phone = normalize_phone(os.environ.get("ADMIN_PHONE", "+910000000001"))

    existing = await db.users.find_one({"username": admin_username})
    if existing is None:
        await db.users.insert_one({
            "id": ADMIN_USER_ID,
            "username": admin_username,
            "phone_number": admin_phone,
            "full_name": "Administrator",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "bio": "System administrator",
            "status": "available",
            "avatar_url": None,
            "created_at": now_iso(),
            "online": False,
            "last_seen": now_iso(),
            "created_by": None,
            "account_creation_access": True,
            "password_reset_by": None,
            "password_reset_at": None,
        })
        logger.info("Seeded admin user: %s (phone=%s)", admin_username, admin_phone)
    else:
        updates: Dict[str, object] = {}
        if existing.get("id") != ADMIN_USER_ID:
            updates["id"] = ADMIN_USER_ID
        if not verify_password(admin_password, existing.get("password_hash", "")):
            updates["password_hash"] = hash_password(admin_password)
        updates["role"] = "admin"
        updates["account_creation_access"] = True
        if updates:
            await db.users.update_one({"username": admin_username}, {"$set": updates})

        # Re-fetch with the canonical id then reconcile the phone unconditionally.
        admin_doc = await db.users.find_one({"username": admin_username})
        if admin_doc and admin_doc.get("phone_number") != admin_phone:
            assigned = await _reconcile_phone(admin_doc["id"], admin_phone)
            if assigned:
                logger.info(
                    "Reconciled admin phone: %s → %s",
                    admin_doc.get("phone_number"), assigned,
                )

    # Demo seed accounts (also phone-based; admin can reset these later).
    demo_seed = [
        {"username": "employee1", "password": "employee123", "full_name": "Emma Employee", "role": "employee", "phone": "+910000000011"},
        {"username": "client1", "password": "client123", "full_name": "Carl Client", "role": "client", "phone": "+910000000021"},
    ]
    for demo in demo_seed:
        try:
            phone = normalize_phone(demo["phone"])
        except HTTPException:
            continue

        ex = await db.users.find_one({"username": demo["username"]})
        if ex:
            # Reconcile the canonical phone for the seeded user (and warn if
            # another row was sitting on it).
            if ex.get("phone_number") != phone:
                assigned = await _reconcile_phone(ex["id"], phone)
                if assigned:
                    logger.info(
                        "Reconciled %s phone: %s → %s",
                        demo["username"], ex.get("phone_number"), assigned,
                    )
            continue

        # Brand-new seed: make sure the canonical phone is free.
        squatter = await db.users.find_one({"phone_number": phone})
        if squatter:
            # Move squatter aside so the demo account can claim the canonical phone.
            await _reconcile_phone(str(uuid.uuid4()), phone)  # no-op safety; just log
            squatter = await db.users.find_one({"phone_number": phone})
            if squatter:
                logger.warning(
                    "Skipping demo seed %s — phone %s is taken by another account",
                    demo["username"], phone,
                )
                continue

        seed_doc = {
            "id": str(uuid.uuid4()),
            "username": demo["username"],
            "phone_number": phone,
            "full_name": demo["full_name"],
            "password_hash": hash_password(demo["password"]),
            "role": demo["role"],
            "bio": "",
            "status": "available",
            "avatar_url": None,
            "created_at": now_iso(),
            "online": False,
            "last_seen": now_iso(),
            "created_by": ADMIN_USER_ID,
            "account_creation_access": False,
            "password_reset_by": None,
            "password_reset_at": None,
        }
        await db.users.insert_one(seed_doc)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ---------- CORS & router ----------
_cors_allow_all = (os.environ.get("CORS_ALLOW_ALL") or "").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
_cors_env = (os.environ.get("CORS_ORIGINS") or "").strip()
if _cors_allow_all:
    CORS_ORIGINS = ["*"]
    CORS_CREDENTIALS = False
elif _cors_env:
    CORS_ORIGINS = [o.strip().rstrip("/") for o in _cors_env.split(",") if o.strip()]
    CORS_CREDENTIALS = True
else:
    CORS_ORIGINS = [
        "http://localhost",
        "http://localhost:3000",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "capacitor://localhost",
        "ionic://localhost",
        "https://chatflow-2-z7w6.onrender.com",
    ]
    CORS_CREDENTIALS = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _folder_upload_fileobj(fileobj, key: str, content_type: str, filename: str):
    mime = (content_type or "").lower()
    file_id = key.split("/")[-1]
    size: Optional[int] = None
    try:
        fileobj.seek(0, os.SEEK_END)
        size = fileobj.tell()
        fileobj.seek(0)
    except (OSError, AttributeError):
        size = None

    if S3_BUCKET:
        await asyncio.to_thread(_upload_to_s3, fileobj, key, mime)
        file_url = _infer_public_url(S3_BUCKET, S3_REGION, key)
    else:
        dest = UPLOAD_DIR / file_id
        with dest.open("wb") as f:
            shutil.copyfileobj(fileobj, f)
        if size is None:
            try:
                size = dest.stat().st_size
            except OSError:
                size = None
        file_url = f"/api/files/{file_id}"
    return file_url, size


async def _folder_delete_storage_urls(urls: List[Optional[str]]) -> None:
    keys = _urls_to_s3_keys(urls)
    if keys:
        await asyncio.to_thread(_delete_s3_keys_blocking, keys)
    for url in urls or []:
        if not url or not str(url).startswith("/api/files/"):
            continue
        fid = str(url).rstrip("/").split("/")[-1]
        if ".." in fid or "/" in fid or "\\" in fid:
            continue
        path = UPLOAD_DIR / fid
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass


from diet_api import register_diet_routes
from folders_api import migrate_folders_schema, register_folder_routes
from reports_api import register_reports_routes

register_diet_routes(
    api_router,
    db,
    get_current_user=get_current_user,
    upload_fileobj=_folder_upload_fileobj,
    delete_storage_urls=_folder_delete_storage_urls,
    log_audit=log_audit,
)

register_reports_routes(
    api_router,
    db,
    require_admin=require_admin,
    upload_dir=str(UPLOAD_DIR),
)

register_folder_routes(
    api_router,
    db,
    get_current_user=get_current_user,
    require_admin=require_admin,
    upload_fileobj=_folder_upload_fileobj,
    delete_storage_urls=_folder_delete_storage_urls,
    log_audit=log_audit,
)

app.include_router(api_router, prefix="/api")
