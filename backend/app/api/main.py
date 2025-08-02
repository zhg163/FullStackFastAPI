from fastapi import APIRouter

from app.api.routes import items, login, private, users, utils, role_dirs, roles, role_templates, role_template_items, role_prompts, task_creat_role_prompts
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


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
