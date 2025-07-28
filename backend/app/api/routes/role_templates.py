from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import (
    Role,
    RoleTemplate, 
    RoleTemplateCreate, 
    RoleTemplatePublic, 
    RoleTemplatesPublic, 
    RoleTemplateUpdate,
    Message,
)

router = APIRouter(prefix="/role-templates", tags=["role-templates"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RoleTemplatesPublic,
)
def read_role_templates(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    template_name: str | None = Query(None, description="搜索模板名称（模糊匹配）"),
    role_id: int | None = Query(None, description="角色ID筛选"),
    is_active: str | None = Query(None, description="激活状态筛选(Y/N)"),
) -> Any:
    """
    Retrieve role templates with optional filters.
    """

    # 构建查询条件
    conditions = []
    
    if template_name:
        conditions.append(col(RoleTemplate.template_name).icontains(template_name))
    
    if role_id:
        conditions.append(RoleTemplate.role_id == role_id)
        
    if is_active:
        conditions.append(RoleTemplate.is_active == is_active)

    # 构建基础查询，包含关联查询
    base_query = select(RoleTemplate).join(Role, RoleTemplate.role_id == Role.id, isouter=True)
    count_query = select(func.count()).select_from(RoleTemplate)
    
    # 应用过滤条件
    if conditions:
        for condition in conditions:
            base_query = base_query.where(condition)
            count_query = count_query.where(condition)

    # 获取总数
    count = session.exec(count_query).one()

    # 获取分页数据，按创建时间倒序
    statement = base_query.order_by(RoleTemplate.created_at.desc()).offset(skip).limit(limit)
    role_templates = session.exec(statement).all()

    return RoleTemplatesPublic(data=role_templates, count=count)


@router.post(
    "/", 
    dependencies=[Depends(get_current_active_superuser)], 
    response_model=RoleTemplatePublic
)
def create_role_template(*, session: SessionDep, role_template_in: RoleTemplateCreate) -> Any:
    """
    Create new role template.
    """
    # 检查关联的角色是否存在
    role = session.get(Role, role_template_in.role_id)
    if not role:
        raise HTTPException(
            status_code=404,
            detail=f"Role with id {role_template_in.role_id} not found"
        )

    # 创建角色模板，避免之前的model_validate错误
    role_template = RoleTemplate(**role_template_in.model_dump())
    session.add(role_template)
    session.commit()
    session.refresh(role_template)
    return role_template


@router.get(
    "/{role_template_id}", 
    dependencies=[Depends(get_current_active_superuser)], 
    response_model=RoleTemplatePublic
)
def read_role_template_by_id(
    role_template_id: int, session: SessionDep
) -> Any:
    """
    Get role template by ID.
    """
    role_template = session.get(RoleTemplate, role_template_id)
    if not role_template:
        raise HTTPException(status_code=404, detail="Role template not found")
    return role_template


@router.patch(
    "/{role_template_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RoleTemplatePublic,
)
def update_role_template(
    *,
    session: SessionDep,
    role_template_id: int,
    role_template_in: RoleTemplateUpdate,
) -> Any:
    """
    Update a role template.
    """
    role_template = session.get(RoleTemplate, role_template_id)
    if not role_template:
        raise HTTPException(status_code=404, detail="Role template not found")
    
    # 如果更新了role_id，检查新的角色是否存在
    if role_template_in.role_id and role_template_in.role_id != role_template.role_id:
        role = session.get(Role, role_template_in.role_id)
        if not role:
            raise HTTPException(
                status_code=404,
                detail=f"Role with id {role_template_in.role_id} not found"
            )

    role_template_data = role_template_in.model_dump(exclude_unset=True)
    role_template.sqlmodel_update(role_template_data)
    session.add(role_template)
    session.commit()
    session.refresh(role_template)
    return role_template


@router.delete(
    "/{role_template_id}", 
    dependencies=[Depends(get_current_active_superuser)]
)
def delete_role_template(
    session: SessionDep, role_template_id: int
) -> Message:
    """
    Delete a role template.
    """
    role_template = session.get(RoleTemplate, role_template_id)
    if not role_template:
        raise HTTPException(status_code=404, detail="Role template not found")
    
    session.delete(role_template)
    session.commit()
    return Message(message="Role template deleted successfully") 