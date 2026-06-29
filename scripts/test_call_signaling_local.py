#!/usr/bin/env python3
"""Quick local check: two WS sessions + call-offer must reach callee."""
from __future__ import annotations

import asyncio
import json
import uuid

import httpx
import websockets

BASE = "http://localhost:8002"
WS_BASE = "ws://localhost:8002/api/ws"


async def login(username: str, password: str, bid: str) -> tuple[str, dict]:
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        r = await client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
            headers={"X-ChatFlow-Browser-Id": bid},
        )
        r.raise_for_status()
        data = r.json()
        return data["access_token"], data["user"]


async def direct_conv(token: str, bid: str, other_id: str) -> str:
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        r = await client.post(
            "/api/conversations/start",
            json={"other_user_id": other_id},
            headers={
                "Authorization": f"Bearer {token}",
                "X-ChatFlow-Browser-Id": bid,
            },
        )
        r.raise_for_status()
        return r.json()["conversation"]["id"]


async def ws_connect(token: str, bid: str):
    url = f"{WS_BASE}?token={token}&bid={bid}"
    return await websockets.connect(url)


async def wait_for(ws, types: set[str], timeout: float = 8.0):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        raw = await asyncio.wait_for(ws.recv(), timeout=deadline - asyncio.get_event_loop().time())
        frame = json.loads(raw)
        if frame.get("type") in types:
            return frame
    raise TimeoutError(f"Timed out waiting for {types}")


async def main() -> int:
    admin_bid = f"test-admin-{uuid.uuid4().hex[:8]}"
    emp_bid = f"test-emp-{uuid.uuid4().hex[:8]}"

    print("Logging in admin + employee1…")
    admin_token, admin_user = await login("admin", "vijju2810", admin_bid)
    emp_token, emp_user = await login("employee1", "employee123", emp_bid)
    conv_id = await direct_conv(admin_token, admin_bid, emp_user["id"])
    call_id = f"test-{uuid.uuid4().hex}"

    print(f"Admin={admin_user['id']}  Employee={emp_user['id']}  conv={conv_id}")

    admin_ws = await ws_connect(admin_token, admin_bid)
    emp_ws = await ws_connect(emp_token, emp_bid)
    print("WebSockets connected.")

    offer = {
        "type": "call-offer",
        "target_user_id": emp_user["id"],
        "call_id": call_id,
        "conversation_id": conv_id,
        "sdp": "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
    }

    recv_task = asyncio.create_task(wait_for(emp_ws, {"call-offer", "call-ring"}))
    await admin_ws.send(json.dumps(offer))
    print("Sent call-offer from admin.")

    frame = await recv_task
    print(f"Callee received: {frame.get('type')} call_id={frame.get('call_id')}")

    ringing = await wait_for(admin_ws, {"call-ringing", "call-error"})
    print(f"Caller received: {ringing.get('type')} reason={ringing.get('reason')}")

    await admin_ws.close()
    await emp_ws.close()

    if frame.get("type") != "call-offer" or ringing.get("type") != "call-ringing":
        print("FAIL — signaling did not complete as expected.")
        return 1

    print("PASS — local call signaling works.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
