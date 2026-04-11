from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/v1/models")
async def list_models(request: Request):
    tenant = getattr(request.state, "tenant", None)
    plan = tenant.get("plan", "starter") if tenant else "starter"

    from gateway.services.router import get_router
    model_router = get_router()
    models = model_router.list_all(plan=plan)

    return JSONResponse(content={"object": "list", "data": models})


@router.get("/v1/models/{model_id}")
async def get_model(model_id: str, request: Request):
    from gateway.services.router import get_router
    model_router = get_router()
    info = model_router.get_model_info(model_id)
    if not info:
        return JSONResponse(
            status_code=404,
            content={"error": {"type": "invalid_request_error", "message": f"Model '{model_id}' not found"}},
        )
    return JSONResponse(content={
        "id": model_id,
        "object": "model",
        "owned_by": "custom-ai",
        **{k: v for k, v in info.items() if k != "openai_aliases"},
    })
