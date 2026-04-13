from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from gateway.middleware.admin_auth import require_admin

router = APIRouter(tags=["admin"])

_DOCS_PATH = Path(__file__).parent.parent.parent.parent / "docs" / "api.md"


@router.get("/docs/api", dependencies=[Depends(require_admin)])
async def get_api_docs() -> PlainTextResponse:
    """Serve the API reference markdown file."""
    if _DOCS_PATH.exists():
        return PlainTextResponse(_DOCS_PATH.read_text(encoding="utf-8"))
    return PlainTextResponse("# API Documentation\n\nFile not found.", status_code=200)
