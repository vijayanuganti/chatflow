from dotenv import load_dotenv
from pathlib import Path
from urllib.parse import quote_plus


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


import os
import uuid
import json
import logging
import random
import shutil
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Set
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import parseaddr
import boto3
from botocore.exceptions import BotoCoreError, ClientError


from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr


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
OTP_EXPIRY_MINUTES = 10


UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

S3_BUCKET = os.environ.get("S3_BUCKET") or ""
S3_REGION = os.environ.get("AWS_REGION") or os.environ.get("S3_REGION") or ""
S3_PUBLIC_BASE_URL = (os.environ.get("S3_PUBLIC_BASE_URL") or "").rstrip("/")


client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000)
db = client[DB_NAME]


app = FastAPI(title="ChatFlow API")
api_router = APIRouter(prefix="/api")


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def direct_conv_id(user_a: str, user_b: str) -> str:
    pair = sorted([user_a, user_b])
    return f"direct_{pair[0]}_{pair[1]}"


def clean_user(u: dict) -> dict:
    u = dict(u)
    u.pop("_id", None)
    u.pop("password_hash", None)
    return u


def normalize_username(username: str) -> str:
    return username.strip().lower()


def normalize_email(email: Optional[str]) -> Optional[str]:
    if email is None:
        return None
    email = email.strip().lower()
    return email or None


def mask_email(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    if "@" not in email:
        return email
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        masked_name = name[0] + "*" * max(0, len(name) - 1)
    else:
        masked_name = name[:2] + "*" * max(0, len(name) - 2)
    return f"{masked_name}@{domain}"


def _hash_otp(otp: str) -> str:
    return bcrypt.hashpw(otp.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_otp(otp: str, otp_hash: str) -> bool:
    return verify_password(otp, otp_hash)


def _smtp_send(to_email: str, subject: str, body: str) -> bool:
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    from_email = os.environ.get("SMTP_FROM", user or "no-reply@chatflow.local")
    secure_mode = (os.environ.get("SMTP_SECURE", "starttls") or "starttls").strip().lower()

    if not host or not user or not password:
        return False
    if "@" not in parseaddr(from_email)[1]:
        logger.warning("Invalid SMTP_FROM configured; falling back to SMTP_USER")
        from_email = user

    msg = EmailMessage()
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    timeout = int(os.environ.get("SMTP_TIMEOUT", "20"))
    if secure_mode == "ssl":
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as s:
            s.ehlo()
            s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=timeout) as s:
            s.ehlo()
            if secure_mode == "starttls":
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
            s.login(user, password)
            s.send_message(msg)
    return True


def _infer_public_url(bucket: str, region: str, key: str) -> str:
    if S3_PUBLIC_BASE_URL:
        return f"{S3_PUBLIC_BASE_URL}/{key}"
    # Default virtual-hosted style URL (works for public buckets)
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


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return clean_user(user)


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------- Models ----------
class RegisterBody(BaseModel):
    username: str
    password: str
    full_name: str
    email: EmailStr
    role: str  # employee | client
    # Only for clients (allocation)
    batch_id: Optional[str] = None
    employee_id: Optional[str] = None
    email_verification_token: str


class LoginBody(BaseModel):
    username: str
    password: str


class ForgotBody(BaseModel):
    identifier: str  # username or email


class ResetBody(BaseModel):
    identifier: str
    otp: str
    new_password: str


class EmailOtpSendBody(BaseModel):
    email: EmailStr


class EmailOtpVerifyBody(BaseModel):
    email: EmailStr
    otp: str


class ProfileBody(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    bio: Optional[str] = None
    status: Optional[str] = None  # available | busy | away | dnd
    avatar_url: Optional[str] = None


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class MessageBody(BaseModel):
    conversation_id: str
    content: str = ""
    message_type: str = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None


class StartDirectBody(BaseModel):
    other_user_id: str


class CreateGroupBody(BaseModel):
    name: str
    member_ids: List[str]


class CreateBatchBody(BaseModel):
    name: str


# ---------- Auth ----------
@api_router.post("/auth/register")
async def register(body: RegisterBody):
    username = normalize_username(body.username)
    email = normalize_email(body.email)
    full_name = body.full_name.strip()

    if not username or len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Username and password (min 4 chars) required")

    if body.role not in ("employee", "client"):
        raise HTTPException(status_code=400, detail="Role must be 'employee' or 'client'")

    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Username already taken")

    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")

    # Require verified email before creating account
    ver = await db.email_verifications.find_one({"email": email}, {"_id": 0})
    if not ver or not ver.get("verified") or ver.get("token") != body.email_verification_token:
        raise HTTPException(status_code=400, detail="Email is not verified")
    if ver.get("expires_at") and datetime.fromisoformat(ver["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Email verification expired. Please request OTP again.")

    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "username": username,
        "full_name": full_name or username,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "bio": "",
        "status": "available",
        "avatar_url": None,
        "created_at": now_iso(),
        "online": False,
        "last_seen": now_iso(),
    }
    doc["email"] = email

    # Client allocation: must pick employee + batch
    if body.role == "client":
        if not body.employee_id or not body.batch_id:
            raise HTTPException(status_code=400, detail="Client must select employee and batch")

        employee = await db.users.find_one({"id": body.employee_id, "role": "employee"}, {"_id": 0})
        if not employee:
            raise HTTPException(status_code=400, detail="Selected employee not found")

        batch = await db.batches.find_one({"id": body.batch_id}, {"_id": 0})
        if not batch:
            raise HTTPException(status_code=400, detail="Selected batch not found")
        if batch.get("employee_id") != body.employee_id:
            raise HTTPException(status_code=400, detail="Selected batch does not belong to selected employee")

        client_ids = batch.get("client_ids") or []
        max_clients = int(batch.get("max_clients") or 20)
        if len(client_ids) >= max_clients:
            raise HTTPException(status_code=400, detail="Selected batch is full")

        doc["employee_id"] = body.employee_id
        doc["batch_id"] = body.batch_id

    await db.users.insert_one(dict(doc))

    # Keep batch membership in sync (best-effort; if this fails we still created the user)
    if body.role == "client":
        await db.batches.update_one(
            {"id": body.batch_id},
            {"$addToSet": {"client_ids": user_id}},
        )
        # Auto-create the employee↔client conversation so it shows up immediately
        await _ensure_direct(body.employee_id, user_id)

    token = create_access_token(user_id, username, body.role)
    return {"token": token, "user": clean_user(doc)}


@api_router.post("/auth/login")
async def login(body: LoginBody):
    ident = body.username.strip().lower()
    user = await db.users.find_one({"$or": [{"username": ident}, {"email": ident}]})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token(user["id"], user["username"], user["role"])
    return {"token": token, "user": clean_user(user)}


@api_router.post("/auth/email/send-otp")
async def send_email_otp(body: EmailOtpSendBody):
    email = normalize_email(body.email)
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")

    otp = f"{random.randint(100000, 999999)}"
    await db.email_verifications.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "otp_hash": _hash_otp(otp),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat(),
            "verified": False,
            "token": None,
            "updated_at": now_iso(),
        }},
        upsert=True,
    )

    subject = "ChatFlow email verification OTP"
    body_text = f"Your ChatFlow verification OTP is: {otp}\n\nThis OTP expires in {OTP_EXPIRY_MINUTES} minutes."
    sent = False
    try:
        sent = _smtp_send(email, subject, body_text)
    except Exception as e:
        logger.warning(f"SMTP send failed for {email}: {e}")
        sent = False

    if not sent:
        logger.warning(f"[DEV EMAIL OTP] email={email} otp={otp}")
        raise HTTPException(
            status_code=503,
            detail="Email delivery failed. Please check SMTP settings and try again."
        )

    return {
        "message": "OTP sent to your email.",
        "sent_via_email": sent,
        "expires_in_minutes": OTP_EXPIRY_MINUTES,
        "email_masked": mask_email(email),
    }


@api_router.post("/auth/email/verify-otp")
async def verify_email_otp(body: EmailOtpVerifyBody):
    email = normalize_email(body.email)
    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    rec = await db.email_verifications.find_one({"email": email}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="No OTP requested for this email")

    if datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP expired. Please request again.")

    if not _verify_otp(body.otp.strip(), rec.get("otp_hash", "")):
        raise HTTPException(status_code=400, detail="Invalid OTP")

    token = uuid.uuid4().hex
    await db.email_verifications.update_one(
        {"email": email},
        {"$set": {"verified": True, "token": token, "verified_at": now_iso()}},
    )
    return {"message": "Email verified", "email_verification_token": token}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean_user(user)


@api_router.post("/auth/forgot-password")
async def forgot_password(body: ForgotBody):
    ident = body.identifier.strip().lower()
    user = await db.users.find_one({"$or": [{"username": ident}, {"email": ident}]})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with that username/email")

    otp = f"{random.randint(100000, 999999)}"
    await db.password_otps.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "user_id": user["id"],
            "otp": otp,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat(),
            "used": False,
            "updated_at": now_iso(),
        }},
        upsert=True,
    )

    logger.warning(f"[DEV OTP] username={user['username']} email={user.get('email')} otp={otp}")
    return {
        "message": "OTP generated. In production this would be emailed.",
        "dev_otp": otp,
        "expires_in_minutes": OTP_EXPIRY_MINUTES,
        "email_masked": mask_email(user.get("email")),
    }


@api_router.post("/auth/reset-password")
async def reset_password(body: ResetBody):
    ident = body.identifier.strip().lower()
    user = await db.users.find_one({"$or": [{"username": ident}, {"email": ident}]})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    rec = await db.password_otps.find_one({"user_id": user["id"]})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="No active OTP. Please request again.")

    if rec["otp"] != body.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid OTP")

    if datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP expired. Please request again.")

    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 chars")

    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await db.password_otps.update_one({"user_id": user["id"]}, {"$set": {"used": True}})
    return {"message": "Password updated. You can now sign in."}


# ---------- Users / Profile ----------
@api_router.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({"id": {"$ne": user["id"]}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


# ---------- Public registration metadata ----------
@api_router.get("/public/employees")
async def public_employees():
    employees = await db.users.find(
        {"role": "employee"},
        {"_id": 0, "password_hash": 0},
    ).sort("full_name", 1).to_list(1000)
    return employees


@api_router.get("/public/batches")
async def public_batches(employee_id: Optional[str] = None):
    query = {}
    if employee_id:
        query["employee_id"] = employee_id
    batches = await db.batches.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)

    emp_ids = list({b.get("employee_id") for b in batches if b.get("employee_id")})
    emp_map = {}
    if emp_ids:
        async for e in db.users.find({"id": {"$in": emp_ids}}, {"_id": 0, "password_hash": 0}):
            emp_map[e["id"]] = e

    out = []
    for b in batches:
        client_count = len(b.get("client_ids") or [])
        max_clients = int(b.get("max_clients") or 20)
        out.append({
            **b,
            "client_count": client_count,
            "max_clients": max_clients,
            "employee": clean_user(emp_map.get(b.get("employee_id")) or {}),
            "is_full": client_count >= max_clients,
        })
    return out


# ---------- Batches (employee) ----------
@api_router.get("/batches/me")
async def my_batches(user: dict = Depends(get_current_user)):
    if user.get("role") != "employee":
        raise HTTPException(status_code=403, detail="Employee access required")
    batches = await db.batches.find({"employee_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for b in batches:
        b["client_count"] = len(b.get("client_ids") or [])
        b["max_clients"] = int(b.get("max_clients") or 20)
    return batches


@api_router.post("/batches")
async def create_batch(body: CreateBatchBody, user: dict = Depends(get_current_user)):
    if user.get("role") != "employee":
        raise HTTPException(status_code=403, detail="Employee access required")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Batch name required")

    batch = {
        "id": f"batch_{uuid.uuid4().hex}",
        "name": name[:80],
        "employee_id": user["id"],
        "client_ids": [],
        "max_clients": 20,
        "created_at": now_iso(),
    }
    await db.batches.insert_one(dict(batch))
    return batch


@api_router.put("/users/me")
async def update_profile(body: ProfileBody, user: dict = Depends(get_current_user)):
    update = {}

    if body.full_name is not None:
        update["full_name"] = body.full_name.strip()[:80]

    if body.email is not None:
        new_email = normalize_email(body.email)
        if new_email:
            existing = await db.users.find_one({"email": new_email, "id": {"$ne": user["id"]}})
            if existing:
                raise HTTPException(status_code=400, detail="Email already in use")
        update["email"] = new_email

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


@api_router.post("/users/me/password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password incorrect")

    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 chars")

    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"message": "Password updated"}


# ---------- Conversations ----------
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
    other = await db.users.find_one({"id": body.other_user_id}, {"_id": 0, "password_hash": 0})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    if other["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot chat with yourself")
    conv = await _ensure_direct(user["id"], other["id"])
    return {"conversation": conv, "other_user": other}


@api_router.post("/conversations/group")
async def create_group(body: CreateGroupBody, user: dict = Depends(get_current_user)):
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
    if viewer_id:
        pipeline = [
            {"$match": {"recipient_ids": viewer_id, "read_by": {"$ne": viewer_id}}},
            {"$group": {"_id": "$conversation_id", "count": {"$sum": 1}}},
        ]
        async for row in db.messages.aggregate(pipeline):
            unread_map[row["_id"]] = int(row["count"])

    result = []
    for c in convs:
        parts = [users_map.get(p) for p in c["participants"] if users_map.get(p)]
        other = None
        if c["type"] == "direct" and viewer_id:
            other_id = next((p for p in c["participants"] if p != viewer_id), None)
            other = users_map.get(other_id) if other_id else None
        result.append({
            **c,
            "participants_info": parts,
            "other_user": other,
            "unread_count": unread_map.get(c["id"], 0) if viewer_id else 0,
        })
    return result


@api_router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    convs = await db.conversations.find(
        {"participants": user["id"]}, {"_id": 0}
    ).sort("last_message_at", -1).to_list(500)
    return await _enrich_conversations(convs, user["id"])


@api_router.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user["role"] != "admin" and user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Access denied")
    messages = await db.messages.find({"conversation_id": conv_id}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return messages


@api_router.post("/messages")
async def send_message(body: MessageBody, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": body.conversation_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")

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
    }

    await db.messages.insert_one(dict(msg))
    preview = body.content if body.message_type == "text" else f"[{body.message_type}]"
    if conv["type"] == "group":
        preview = f"{user['full_name']}: {preview}"

    await db.conversations.update_one(
        {"id": conv["id"]},
        {"$set": {"last_message": preview, "last_message_at": msg["created_at"]}},
    )

    await manager.broadcast_message(msg, conv)
    return msg


@api_router.post("/conversations/{conv_id}/read")
async def mark_read(conv_id: str, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")

    result = await db.messages.update_many(
        {"conversation_id": conv_id, "read_by": {"$ne": user["id"]}},
        {"$addToSet": {"read_by": user["id"]}},
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

    # Prefer S3 in production (Render) when configured; fallback to local disk for dev.
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


# ---------- Admin ----------
@api_router.get("/admin/users")
async def admin_users(user: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api_router.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_admin)):
    return {
        "total_users": await db.users.count_documents({}),
        "employees": await db.users.count_documents({"role": "employee"}),
        "clients": await db.users.count_documents({"role": "client"}),
        "admins": await db.users.count_documents({"role": "admin"}),
        "conversations": await db.conversations.count_documents({}),
        "groups": await db.conversations.count_documents({"type": "group"}),
        "messages": await db.messages.count_documents({}),
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

    # Preload direct conversations for employee↔client pairs
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
            **b,
            "client_count": len(b.get("client_ids") or []),
            "max_clients": max_clients,
            "clients": client_list,
        })

    return {"employee": clean_user(employee), "batches": out_batches}


# ---------- WebSocket Manager ----------
class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, Set[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(user_id, set()).add(ws)
        await db.users.update_one({"id": user_id}, {"$set": {"online": True, "last_seen": now_iso()}})
        await self._broadcast_presence(user_id, True)

    async def disconnect(self, user_id: str, ws: WebSocket):
        if user_id in self.active:
            self.active[user_id].discard(ws)
            if not self.active[user_id]:
                self.active.pop(user_id, None)
                await db.users.update_one({"id": user_id}, {"$set": {"online": False, "last_seen": now_iso()}})
                await self._broadcast_presence(user_id, False)

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

    async def _broadcast_presence(self, user_id: str, online: bool):
        event = {"type": "presence", "user_id": user_id, "online": online}
        for uid in list(self.active.keys()):
            await self.send_event(uid, event)


manager = ConnectionManager()

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
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
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: user_id={user_id}")
        await manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.warning(f"WS error for user_id={user_id}: {e}")
        await manager.disconnect(user_id, websocket)


# ---------- Startup ----------
ADMIN_USER_ID = "admin-user-id"

@app.on_event("startup")
async def on_startup():
    try:
        await client.admin.command("ping")
        logger.info("MongoDB connection established")

        await db.users.create_index("username", unique=True)
        await db.users.create_index("email", unique=True, sparse=True)
        await db.conversations.create_index("participants")
        await db.messages.create_index("conversation_id")
        await db.messages.create_index("created_at")
        await db.password_otps.create_index("user_id", unique=True)
        await db.email_verifications.create_index("email", unique=True)
        await db.batches.create_index("employee_id")
        await db.batches.create_index([("employee_id", 1), ("name", 1)])
    except Exception as e:
        logger.exception("Database startup failed")
        raise RuntimeError(
            "Database startup failed. Check MONGO_URL, Atlas username/password, "
            "and URL-encode special characters in the password."
        ) from e

    admin_username = normalize_username(os.environ.get("ADMIN_USERNAME", "admin"))
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    existing = await db.users.find_one({"username": admin_username})
    if existing is None:
        await db.users.insert_one({
            "id": ADMIN_USER_ID,
            "username": admin_username,
            "email": "admin@chatflow.local",
            "full_name": "Administrator",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "bio": "System administrator",
            "status": "available",
            "avatar_url": None,
            "created_at": now_iso(),
            "online": False,
            "last_seen": now_iso(),
        })
        logger.info(f"Seeded admin user: {admin_username}")
    else:
        if existing.get("id") != ADMIN_USER_ID:
            await db.users.update_one(
                {"username": admin_username},
                {"$set": {"id": ADMIN_USER_ID}},
            )
            logger.info(f"Updated admin id to {ADMIN_USER_ID}")

        if not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one(
                {"username": admin_username},
                {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
            )

    for demo in [
        {"username": "employee1", "password": "employee123", "full_name": "Emma Employee", "role": "employee", "email": "emma@chatflow.local"},
        {"username": "client1", "password": "client123", "full_name": "Carl Client", "role": "client", "email": "carl@chatflow.local"},
    ]:
        ex = await db.users.find_one({"username": demo["username"]})
        if not ex:
            seed_doc = {
                "id": str(uuid.uuid4()),
                "username": demo["username"],
                "full_name": demo["full_name"],
                "password_hash": hash_password(demo["password"]),
                "role": demo["role"],
                "bio": "",
                "status": "available",
                "avatar_url": None,
                "created_at": now_iso(),
                "online": False,
                "last_seen": now_iso(),
            }
            if demo.get("email"):
                seed_doc["email"] = normalize_email(demo["email"])
            await db.users.insert_one(seed_doc)
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# ---------- CORS & router ----------
# Configure as comma-separated list in env: CORS_ORIGINS="https://yourapp.vercel.app,http://localhost:3000"
_cors_env = (os.environ.get("CORS_ORIGINS") or "").strip()
if _cors_env:
    CORS_ORIGINS = [o.strip().rstrip("/") for o in _cors_env.split(",") if o.strip()]
else:
    CORS_ORIGINS = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)