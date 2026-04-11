from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from gateway.services.voices import (
    delete_tenant_voice,
    get_all_voices,
    list_tenant_voices,
    save_tenant_voice,
    set_default_voice,
)

router = APIRouter()

MAX_VOICE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.get("/v1/voices")
async def list_voices(request: Request):
    tenant = request.state.tenant
    custom_voices = await list_tenant_voices(tenant["id"])
    builtin = get_all_voices()
    return JSONResponse(content={
        "custom_voices": custom_voices,
        "builtin_voices": builtin,
    })


@router.post("/v1/voices/upload")
async def upload_voice(
    request: Request,
    file: UploadFile = File(...),
    voice_name: str = Form(...),
    language: str = Form(default="it"),
):
    tenant = request.state.tenant
    audio_bytes = await file.read()

    if len(audio_bytes) > MAX_VOICE_BYTES:
        return JSONResponse(
            status_code=400,
            content={"error": {"type": "invalid_request_error", "message": "Voice file exceeds 10MB limit"}},
        )

    voice = await save_tenant_voice(tenant["id"], voice_name, audio_bytes, language)
    return JSONResponse(content=voice, status_code=201)


@router.delete("/v1/voices/{voice_name}")
async def delete_voice(voice_name: str, request: Request):
    tenant = request.state.tenant
    deleted = await delete_tenant_voice(tenant["id"], voice_name)
    if not deleted:
        return JSONResponse(
            status_code=404,
            content={"error": {"type": "not_found", "message": f"Voice '{voice_name}' not found"}},
        )
    return JSONResponse(content={"deleted": True, "voice_name": voice_name})


@router.patch("/v1/voices/{voice_name}/default")
async def set_voice_default(voice_name: str, request: Request):
    tenant = request.state.tenant
    ok = await set_default_voice(tenant["id"], voice_name)
    if not ok:
        return JSONResponse(
            status_code=404,
            content={"error": {"type": "not_found", "message": f"Voice '{voice_name}' not found"}},
        )
    return JSONResponse(content={"success": True, "default_voice": voice_name})
