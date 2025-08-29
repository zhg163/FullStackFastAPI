from fastapi import APIRouter

from app.api.routes import items, login, private, users, utils, role_dirs, roles, role_templates, role_template_items, role_prompts, task_creat_role_prompts, batch_execution, sync_to_role_prompts
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(private.router)
api_router.include_router(role_dirs.router)
api_router.include_router(roles.router)
api_router.include_router(role_templates.router)
api_router.include_router(role_template_items.router)
api_router.include_router(role_prompts.router)
api_router.include_router(task_creat_role_prompts.router)
api_router.include_router(batch_execution.router, prefix="/batch-execution", tags=["批次执行"])
api_router.include_router(sync_to_role_prompts.router, prefix="/sync", tags=["同步到角色提示词"])


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
