from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, delete, func, select

from app.api.deps import SessionDep, get_current_active_superuser
from app.models import (
    TaskCreatRolePrompt,
    TaskCreatRolePromptCreate,
    TaskCreatRolePromptUpdate,
    TaskCreatRolePromptPublic,
    TaskCreatRolePromptsPublic,
    Role,
)

router = APIRouter(prefix="/task-creat-role-prompts", tags=["task-creat-role-prompts"])


@router.get("/", dependencies=[Depends(get_current_active_superuser)], response_model=TaskCreatRolePromptsPublic)
def read_task_creat_role_prompts(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
    task_name: str | None = Query(None, description="任务名称筛选"),
    task_state: str | None = Query(None, description="任务状态筛选"),
    role_id: int | None = Query(None, description="角色ID筛选"),
) -> Any:
    """
    获取角色创建提示词任务列表
    """
    # 构建查询条件
    conditions = []
    
    if task_name:
        conditions.append(col(TaskCreatRolePrompt.task_name).icontains(task_name))
    
    if task_state:
        conditions.append(TaskCreatRolePrompt.task_state == task_state)
    
    if role_id:
        conditions.append(TaskCreatRolePrompt.role_id == role_id)

    # 构建基础查询
    base_query = select(TaskCreatRolePrompt).join(Role, TaskCreatRolePrompt.role_id == Role.id, isouter=True)
    count_query = select(func.count()).select_from(TaskCreatRolePrompt)
    
    # 应用过滤条件
    if conditions:
        for condition in conditions:
            base_query = base_query.where(condition)
            count_query = count_query.where(condition)

    # 获取总数
    count = session.exec(count_query).one()

    # 获取分页数据
    statement = base_query.offset(skip).limit(limit)
    task_prompts = session.exec(statement).all()

    return TaskCreatRolePromptsPublic(data=task_prompts, count=count)


@router.post("/", dependencies=[Depends(get_current_active_superuser)], response_model=TaskCreatRolePromptPublic)
def create_task_creat_role_prompt(*, session: SessionDep, task_prompt_in: TaskCreatRolePromptCreate) -> Any:
    """
    创建角色创建提示词任务
    """
    # 验证角色是否存在
    if task_prompt_in.role_id:
        role = session.get(Role, task_prompt_in.role_id)
        if not role:
            raise HTTPException(
                status_code=404,
                detail=f"Role with id {task_prompt_in.role_id} not found"
            )
    
    # 创建任务
    task_prompt = TaskCreatRolePrompt(**task_prompt_in.model_dump())
    session.add(task_prompt)
    session.commit()
    session.refresh(task_prompt)
    return task_prompt


@router.get("/{task_prompt_id}", dependencies=[Depends(get_current_active_superuser)], response_model=TaskCreatRolePromptPublic)
def read_task_creat_role_prompt_by_id(task_prompt_id: int, session: SessionDep) -> Any:
    """
    根据ID获取角色创建提示词任务
    """
    task_prompt = session.get(TaskCreatRolePrompt, task_prompt_id)
    if not task_prompt:
        raise HTTPException(status_code=404, detail="Task prompt not found")
    return task_prompt


@router.patch("/{task_prompt_id}", dependencies=[Depends(get_current_active_superuser)], response_model=TaskCreatRolePromptPublic)
def update_task_creat_role_prompt(
    *, session: SessionDep, task_prompt_id: int, task_prompt_in: TaskCreatRolePromptUpdate
) -> Any:
    """
    更新角色创建提示词任务
    """
    task_prompt = session.get(TaskCreatRolePrompt, task_prompt_id)
    if not task_prompt:
        raise HTTPException(status_code=404, detail="Task prompt not found")
    
    # 如果要更新角色ID，验证角色是否存在
    if task_prompt_in.role_id and task_prompt_in.role_id != task_prompt.role_id:
        role = session.get(Role, task_prompt_in.role_id)
        if not role:
            raise HTTPException(
                status_code=404,
                detail=f"Role with id {task_prompt_in.role_id} not found"
            )

    update_dict = task_prompt_in.model_dump(exclude_unset=True)
    task_prompt.sqlmodel_update(update_dict)
    session.add(task_prompt)
    session.commit()
    session.refresh(task_prompt)
    return task_prompt


@router.delete("/{task_prompt_id}", dependencies=[Depends(get_current_active_superuser)])
def delete_task_creat_role_prompt(task_prompt_id: int, session: SessionDep) -> Any:
    """
    删除角色创建提示词任务
    """
    task_prompt = session.get(TaskCreatRolePrompt, task_prompt_id)
    if not task_prompt:
        raise HTTPException(status_code=404, detail="Task prompt not found")
    
    session.delete(task_prompt)
    session.commit()
    return {"message": "Task prompt deleted successfully"} 