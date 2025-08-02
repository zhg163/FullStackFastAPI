from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, delete, func, select

from app.api.deps import SessionDep, get_current_active_superuser
from app.models import (
    RolePrompt,
    RolePromptCreate,
    RolePromptUpdate,
    RolePromptPublic,
    RolePromptsPublic,
    Role,
)

router = APIRouter(prefix="/role-prompts", tags=["role-prompts"])


@router.get("/", dependencies=[Depends(get_current_active_superuser)], response_model=RolePromptsPublic)
def read_role_prompts(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    role_id: int | None = Query(None, description="角色ID筛选"),
    version: int | None = Query(None, description="版本号筛选"),
    is_active: str | None = Query(None, description="激活状态筛选(Y/N)"),
) -> Any:
    """
    获取角色提示词列表
    """
    # 构建查询条件
    conditions = []
    
    if role_id:
        conditions.append(RolePrompt.role_id == role_id)
    
    if version:
        conditions.append(RolePrompt.version == version)
    
    if is_active:
        conditions.append(RolePrompt.is_active == is_active)

    # 构建基础查询
    base_query = select(RolePrompt).join(Role, RolePrompt.role_id == Role.id)
    count_query = select(func.count()).select_from(RolePrompt)
    
    # 应用过滤条件
    if conditions:
        for condition in conditions:
            base_query = base_query.where(condition)
            count_query = count_query.where(condition)

    # 获取总数
    count = session.exec(count_query).one()

    # 获取分页数据
    statement = base_query.offset(skip).limit(limit)
    role_prompts = session.exec(statement).all()

    return RolePromptsPublic(data=role_prompts, count=count)


@router.post("/", dependencies=[Depends(get_current_active_superuser)], response_model=RolePromptPublic)
def create_role_prompt(*, session: SessionDep, role_prompt_in: RolePromptCreate) -> Any:
    """
    创建角色提示词
    """
    # 验证角色是否存在
    role = session.get(Role, role_prompt_in.role_id)
    if not role:
        raise HTTPException(
            status_code=404,
            detail=f"Role with id {role_prompt_in.role_id} not found"
        )
    
    # 创建角色提示词
    role_prompt = RolePrompt(**role_prompt_in.model_dump())
    session.add(role_prompt)
    session.commit()
    session.refresh(role_prompt)
    return role_prompt


@router.get("/{role_prompt_id}", dependencies=[Depends(get_current_active_superuser)], response_model=RolePromptPublic)
def read_role_prompt_by_id(role_prompt_id: int, session: SessionDep) -> Any:
    """
    根据ID获取角色提示词
    """
    role_prompt = session.get(RolePrompt, role_prompt_id)
    if not role_prompt:
        raise HTTPException(status_code=404, detail="Role prompt not found")
    return role_prompt


@router.patch("/{role_prompt_id}", dependencies=[Depends(get_current_active_superuser)], response_model=RolePromptPublic)
def update_role_prompt(
    *, session: SessionDep, role_prompt_id: int, role_prompt_in: RolePromptUpdate
) -> Any:
    """
    更新角色提示词
    """
    role_prompt = session.get(RolePrompt, role_prompt_id)
    if not role_prompt:
        raise HTTPException(status_code=404, detail="Role prompt not found")
    
    # 如果要更新角色ID，验证角色是否存在
    if role_prompt_in.role_id and role_prompt_in.role_id != role_prompt.role_id:
        role = session.get(Role, role_prompt_in.role_id)
        if not role:
            raise HTTPException(
                status_code=404,
                detail=f"Role with id {role_prompt_in.role_id} not found"
            )

    update_dict = role_prompt_in.model_dump(exclude_unset=True)
    role_prompt.sqlmodel_update(update_dict)
    session.add(role_prompt)
    session.commit()
    session.refresh(role_prompt)
    return role_prompt


@router.delete("/{role_prompt_id}", dependencies=[Depends(get_current_active_superuser)])
def delete_role_prompt(role_prompt_id: int, session: SessionDep) -> Any:
    """
    删除角色提示词
    """
    role_prompt = session.get(RolePrompt, role_prompt_id)
    if not role_prompt:
        raise HTTPException(status_code=404, detail="Role prompt not found")
    
    session.delete(role_prompt)
    session.commit()
    return {"message": "Role prompt deleted successfully"} 