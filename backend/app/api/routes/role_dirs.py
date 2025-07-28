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
    RoleDir,
    RoleDirCreate,
    RoleDirPublic,
    RoleDirsPublic,
    RoleDirUpdate,
)

router = APIRouter(prefix="/role-dirs", tags=["role-dirs"])


@router.get(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RoleDirsPublic,
)
def read_role_dirs(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    ip: str | None = Query(None, description="搜索IP分类名称（模糊匹配）"),
    ip_desc: str | None = Query(None, description="搜索IP描述（模糊匹配）"),
) -> Any:
    """
    获取角色分类列表（支持筛选）
    """
    # 构建查询条件
    conditions = []
    
    if ip:
        conditions.append(col(RoleDir.ip).icontains(ip))
    
    if ip_desc:
        conditions.append(col(RoleDir.ip_desc).icontains(ip_desc))

    # 构建基础查询
    base_query = select(RoleDir)
    count_query = select(func.count()).select_from(RoleDir)
    
    # 应用过滤条件
    if conditions:
        for condition in conditions:
            base_query = base_query.where(condition)
            count_query = count_query.where(condition)

    # 获取总数
    count = session.exec(count_query).one()

    # 获取分页数据，按创建时间倒序
    statement = base_query.order_by(RoleDir.created_at.desc()).offset(skip).limit(limit)
    role_dirs = session.exec(statement).all()

    return RoleDirsPublic(data=role_dirs, count=count)


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RoleDirPublic,
)
def create_role_dir(*, session: SessionDep, role_dir_in: RoleDirCreate) -> Any:
    """
    创建新的角色分类
    """
    # 检查IP名称是否已存在
    existing_role_dir = session.exec(
        select(RoleDir).where(RoleDir.ip == role_dir_in.ip)
    ).first()
    if existing_role_dir:
        raise HTTPException(
            status_code=400,
            detail="The role directory with this IP name already exists in the system.",
        )

    role_dir = RoleDir.model_validate(role_dir_in)
    session.add(role_dir)
    session.commit()
    session.refresh(role_dir)
    return role_dir


@router.get("/{role_dir_id}", response_model=RoleDirPublic)
def read_role_dir_by_id(
    role_dir_id: int, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    根据ID获取指定角色分类
    """
    role_dir = session.get(RoleDir, role_dir_id)
    if not role_dir:
        raise HTTPException(status_code=404, detail="Role directory not found")
    return role_dir


@router.patch(
    "/{role_dir_id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=RoleDirPublic,
)
def update_role_dir(
    *,
    session: SessionDep,
    role_dir_id: int,
    role_dir_in: RoleDirUpdate,
) -> Any:
    """
    更新角色分类
    """
    db_role_dir = session.get(RoleDir, role_dir_id)
    if not db_role_dir:
        raise HTTPException(
            status_code=404,
            detail="The role directory with this id does not exist in the system",
        )
    
    # 如果更新IP名称，检查是否与其他记录重复
    if role_dir_in.ip and role_dir_in.ip != db_role_dir.ip:
        existing_role_dir = session.exec(
            select(RoleDir).where(RoleDir.ip == role_dir_in.ip)
        ).first()
        if existing_role_dir:
            raise HTTPException(
                status_code=409, 
                detail="Role directory with this IP name already exists"
            )

    # 更新字段
    role_dir_data = role_dir_in.model_dump(exclude_unset=True)
    db_role_dir.sqlmodel_update(role_dir_data)
    session.add(db_role_dir)
    session.commit()
    session.refresh(db_role_dir)
    return db_role_dir


@router.delete(
    "/{role_dir_id}", 
    dependencies=[Depends(get_current_active_superuser)]
)
def delete_role_dir(
    session: SessionDep, role_dir_id: int
) -> Message:
    """
    删除角色分类
    """
    role_dir = session.get(RoleDir, role_dir_id)
    if not role_dir:
        raise HTTPException(status_code=404, detail="Role directory not found")
    
    session.delete(role_dir)
    session.commit()
    return Message(message="Role directory deleted successfully") 