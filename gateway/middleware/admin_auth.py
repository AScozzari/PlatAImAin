import logging

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from gateway.services.auth_service import decode_access_token

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail={"code": "missing_token", "message": "Authorization header required"},
        )
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail={"code": "token_expired", "message": "Access token expired. Use /auth/refresh"},
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=401,
            detail={"code": "token_invalid", "message": str(e)},
        )

    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "Admin role required"},
        )

    return payload
