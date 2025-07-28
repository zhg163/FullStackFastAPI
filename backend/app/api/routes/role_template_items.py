from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import (
    RoleTemplate,
    RoleTemplateItem, 
    RoleTemplateItemCreate, 
    RoleTemplateItemPublic, 
    RoleTemplateItemsPublic, 
    RoleTemplateItemUpdate,
    Message,
)

router = APIRouter(prefix="/role-template-items", tags=["role-template-items"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RoleTemplateItemsPublic,
)
def read_role_template_items(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    item_name: str | None = Query(None, description="搜索条目名称（模糊匹配）"),
    role_tmp_id: int | None = Query(None, description="角色模板ID筛选"),
) -> Any:
    """
    Retrieve role template items with optional filters.
    """

    # 构建查询条件
    conditions = []
    
    if item_name:
        conditions.append(col(RoleTemplateItem.item_name).icontains(item_name))
    
    if role_tmp_id:
        conditions.append(RoleTemplateItem.role_tmp_id == role_tmp_id)

    # 构建基础查询，包含关联查询
    base_query = select(RoleTemplateItem).join(
        RoleTemplate, 
        RoleTemplateItem.role_tmp_id == RoleTemplate.id, 
        isouter=True
    )
    count_query = select(func.count()).select_from(RoleTemplateItem)
    
    # 应用过滤条件
    if conditions:
        for condition in conditions:
            base_query = base_query.where(condition)
            count_query = count_query.where(condition)

    # 获取总数
    count = session.exec(count_query).one()

    # 获取分页数据，按创建时间倒序
    statement = base_query.order_by(RoleTemplateItem.created_at.desc()).offset(skip).limit(limit)
    role_template_items = session.exec(statement).all()

    return RoleTemplateItemsPublic(data=role_template_items, count=count)


@router.post(
    "/", 
    dependencies=[Depends(get_current_active_superuser)], 
    response_model=RoleTemplateItemPublic
)
def create_role_template_item(*, session: SessionDep, role_template_item_in: RoleTemplateItemCreate) -> Any:
    """
    Create new role template item.
    """
    # 检查关联的角色模板是否存在
    role_template = session.get(RoleTemplate, role_template_item_in.role_tmp_id)
    if not role_template:
        raise HTTPException(
            status_code=404,
            detail=f"Role template with id {role_template_item_in.role_tmp_id} not found"
        )

    # 创建角色模板条目，避免之前的model_validate错误
    role_template_item = RoleTemplateItem(**role_template_item_in.model_dump())
    session.add(role_template_item)
    session.commit()
    session.refresh(role_template_item)
    return role_template_item


@router.get(
    "/{role_template_item_id}", 
    dependencies=[Depends(get_current_active_superuser)], 
    response_model=RoleTemplateItemPublic
)
def read_role_template_item_by_id(
    role_template_item_id: int, session: SessionDep
) -> Any:
    """
    Get role template item by ID.
    """
    role_template_item = session.get(RoleTemplateItem, role_template_item_id)
    if not role_template_item:
        raise HTTPException(status_code=404, detail="Role template item not found")
    return role_template_item


@router.patch(
    "/{role_template_item_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RoleTemplateItemPublic,
)
def update_role_template_item(
    *,
    session: SessionDep,
    role_template_item_id: int,
    role_template_item_in: RoleTemplateItemUpdate,
) -> Any:
    """
    Update a role template item.
    """
    role_template_item = session.get(RoleTemplateItem, role_template_item_id)
    if not role_template_item:
        raise HTTPException(status_code=404, detail="Role template item not found")
    
    # 如果更新了role_tmp_id，检查新的角色模板是否存在
    if role_template_item_in.role_tmp_id and role_template_item_in.role_tmp_id != role_template_item.role_tmp_id:
        role_template = session.get(RoleTemplate, role_template_item_in.role_tmp_id)
        if not role_template:
            raise HTTPException(
                status_code=404,
                detail=f"Role template with id {role_template_item_in.role_tmp_id} not found"
            )

    role_template_item_data = role_template_item_in.model_dump(exclude_unset=True)
    role_template_item.sqlmodel_update(role_template_item_data)
    session.add(role_template_item)
    session.commit()
    session.refresh(role_template_item)
    return role_template_item


@router.delete(
    "/{role_template_item_id}", 
    dependencies=[Depends(get_current_active_superuser)]
)
def delete_role_template_item(
    session: SessionDep, role_template_item_id: int
) -> Message:
    """
    Delete a role template item.
    """
    role_template_item = session.get(RoleTemplateItem, role_template_item_id)
    if not role_template_item:
        raise HTTPException(status_code=404, detail="Role template item not found")
    
    session.delete(role_template_item)
    session.commit()
    return Message(message="Role template item deleted successfully") 