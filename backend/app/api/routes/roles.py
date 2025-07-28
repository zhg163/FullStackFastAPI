from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, delete, func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    get_current_active_superuser,
)
from app.models import (
    Message,
    Role,
    RoleCreate,
    RolePublic,
    RolesPublic,
    RoleUpdate,
    RoleDir,
)

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RolesPublic,
)
def read_roles(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    name: str | None = Query(None, description="搜索角色名称（模糊匹配）"),
    ip_id: int | None = Query(None, description="筛选IP分类ID"),
    create_from: str | None = Query(None, description="搜索创建端（模糊匹配）"),
    has_prompts: str | None = Query(None, description="是否有提示词(Y/N)"),
) -> Any:
    """
    获取角色列表（支持筛选）
    """
    # 构建查询条件
    conditions = []
    
    if name:
        conditions.append(col(Role.name).icontains(name))
    
    if ip_id:
        conditions.append(Role.ip_id == ip_id)
    
    if create_from:
        conditions.append(col(Role.create_from).icontains(create_from))
        
    if has_prompts:
        conditions.append(Role.has_prompts == has_prompts)

    # 构建基础查询，包含关联的role_dir信息
    base_query = select(Role).join(RoleDir, Role.ip_id == RoleDir.id, isouter=True)
    count_query = select(func.count()).select_from(Role)
    
    # 应用过滤条件
    if conditions:
        for condition in conditions:
            base_query = base_query.where(condition)
            count_query = count_query.where(condition)

    # 获取总数
    count = session.exec(count_query).one()

    # 获取分页数据，按创建时间倒序
    statement = base_query.order_by(Role.created_at.desc()).offset(skip).limit(limit)
    roles = session.exec(statement).all()

    return RolesPublic(data=roles, count=count)


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RolePublic,
)
def create_role(*, session: SessionDep, role_in: RoleCreate) -> Any:
    """
    创建新的角色
    """
    # 检查IP分类是否存在
    role_dir = session.get(RoleDir, role_in.ip_id)
    if not role_dir:
        raise HTTPException(
            status_code=400,
            detail="The specified role directory does not exist.",
        )
    
    # 检查角色名称是否已存在
    existing_role = session.exec(
        select(Role).where(Role.name == role_in.name)
    ).first()
    if existing_role:
        raise HTTPException(
            status_code=400,
            detail="The role with this name already exists in the system.",
        )

    # 使用字典展开创建实例，避免model_validate错误
    role = Role(**role_in.model_dump())
    session.add(role)
    session.commit()
    session.refresh(role)
    return role


@router.get("/{role_id}", response_model=RolePublic)
def read_role_by_id(
    role_id: int, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    根据ID获取指定角色
    """
    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.patch(
    "/{role_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RolePublic,
)
def update_role(
    *,
    session: SessionDep,
    role_id: int,
    role_in: RoleUpdate,
) -> Any:
    """
    更新角色
    """
    db_role = session.get(Role, role_id)
    if not db_role:
        raise HTTPException(
            status_code=404,
            detail="The role with this id does not exist in the system",
        )
    
    # 如果更新IP分类ID，检查是否存在
    if role_in.ip_id and role_in.ip_id != db_role.ip_id:
        role_dir = session.get(RoleDir, role_in.ip_id)
        if not role_dir:
            raise HTTPException(
                status_code=400,
                detail="The specified role directory does not exist.",
            )
    
    # 如果更新角色名称，检查是否与其他记录重复
    if role_in.name and role_in.name != db_role.name:
        existing_role = session.exec(
            select(Role).where(Role.name == role_in.name)
        ).first()
        if existing_role:
            raise HTTPException(
                status_code=409, 
                detail="Role with this name already exists"
            )

    # 更新字段
    role_data = role_in.model_dump(exclude_unset=True)
    db_role.sqlmodel_update(role_data)
    session.add(db_role)
    session.commit()
    session.refresh(db_role)
    return db_role


@router.delete(
    "/{role_id}", 
    dependencies=[Depends(get_current_active_superuser)]
)
def delete_role(
    session: SessionDep, role_id: int
) -> Message:
    """
    删除角色
    """
    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    session.delete(role)
    session.commit()
    return Message(message="Role deleted successfully") 