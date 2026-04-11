from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr

from gateway.middleware.admin_auth import require_admin
from gateway.services.auth_service import login, logout, refresh_tokens
from gateway.db import postgres as db

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class RefreshBody(BaseModel):
    refresh_token: str


class LogoutBody(BaseModel):
    refresh_token: str


@router.post("/login")
async def auth_login(body: LoginBody, request: Request):
    try:
        tokens = await login(
            body.email,
            body.password,
            device_info=request.headers.get("user-agent"),
            ip=request.client.host if request.client else None,
        )
        return JSONResponse(content=tokens)
    except ValueError:
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "invalid_credentials", "message": "Invalid email or password"}},
        )


@router.post("/refresh")
async def auth_refresh(body: RefreshBody):
    try:
        tokens = await refresh_tokens(body.refresh_token)
        return JSONResponse(content=tokens)
    except ValueError:
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "invalid_refresh_token", "message": "Refresh token is invalid or expired"}},
        )


@router.post("/logout")
async def auth_logout(body: LogoutBody):
    await logout(body.refresh_token)
    return JSONResponse(content={"success": True})


@router.get("/me")
async def auth_me(payload: dict = Depends(require_admin)):
    user = await db.fetchrow(
        "SELECT id, email, name, role, last_login_at FROM admin_users WHERE id = $1",
        payload["sub"],
    )
    if not user:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    return JSONResponse(content=dict(user) | {"id": str(user["id"])})
