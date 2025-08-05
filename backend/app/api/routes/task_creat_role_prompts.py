from typing import Any
from datetime import datetime

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


@router.post("/{id}/start", dependencies=[Depends(get_current_active_superuser)])
def start_task_creat_role_prompt(
    session: SessionDep,
    id: int,
) -> Any:
    """
    启动指定的角色创建提示词任务
    """
    # 查找任务
    task_prompt = session.get(TaskCreatRolePrompt, id)
    if not task_prompt:
        raise HTTPException(status_code=404, detail="Task prompt not found")
    
    # 检查任务状态 - 允许待启动和失败的任务启动/重新启动
    if task_prompt.task_state not in ["P", "F"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot start task in current state: {task_prompt.task_state}. Only tasks in 'P' (pending) or 'F' (failed) state can be started."
        )
    
    # 更新任务状态为等待中
    task_prompt.task_state = "W"
    session.add(task_prompt)
    session.commit()
    session.refresh(task_prompt)
    
    # 在后台执行任务
    try:
        from app.services.simple_task_executor import execute_task_background
        execute_task_background(task_prompt.id)
    except Exception as e:
        # 如果启动失败，将任务状态改为失败
        task_prompt.task_state = "F"
        task_prompt.role_item_prompt = {"error": f"启动失败: {str(e)}", "failed_at": datetime.now().isoformat()}
        session.add(task_prompt)
        session.commit()
        raise HTTPException(status_code=500, detail=f"Failed to start task: {str(e)}")
    
    return {
        "message": "Task started successfully",
        "task_id": task_prompt.id,
        "new_state": task_prompt.task_state
    }


@router.post("/{id}/stop", dependencies=[Depends(get_current_active_superuser)])
def stop_task_creat_role_prompt(
    session: SessionDep,
    id: int,
) -> Any:
    """
    停止指定的角色创建提示词任务
    """
    # 查找任务
    task_prompt = session.get(TaskCreatRolePrompt, id)
    if not task_prompt:
        raise HTTPException(status_code=404, detail="Task prompt not found")
    
    # 检查任务状态 - 只有运行中或等待中的任务才能停止
    if task_prompt.task_state not in ["W", "R"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot stop task in current state: {task_prompt.task_state}. Only tasks in 'W' (waiting) or 'R' (running) state can be stopped."
        )
    
    # 记录停止前的状态
    previous_state = task_prompt.task_state
    
    # 更新任务状态为失败，并记录停止原因
    task_prompt.task_state = "F"
    task_prompt.role_item_prompt = {
        "error": "任务被用户手动停止", 
        "stopped_at": datetime.now().isoformat(),
        "previous_state": previous_state
    }
    session.add(task_prompt)
    session.commit()
    session.refresh(task_prompt)
    
    return {
        "message": "Task stopped successfully",
        "task_id": task_prompt.id,
        "new_state": task_prompt.task_state
    } 