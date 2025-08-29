"""
同步任务到角色提示词的API路由
"""
from datetime import datetime
from typing import Any, Dict, List
import json
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.api.deps import get_current_active_superuser, SessionDep
from app.models import User, TaskCreatRolePrompt, RolePrompt, Role

router = APIRouter()


@router.post("/sync-batch-to-role-prompts")
def sync_batch_to_role_prompts(
    *,
    session: SessionDep,
    current_user: User = Depends(get_current_active_superuser),
) -> Dict[str, Any]:
    """
    同步批次任务到角色提示词
    
    业务逻辑：
    1. 查询所有已完成的任务
    2. 提取批次编号
    3. 验证批次完整性
    4. 按角色分组合并content
    5. 写入角色提示词表
    6. 更新任务状态
    """
    
    # 1. 查询所有已完成的任务
    completed_tasks_stmt = select(TaskCreatRolePrompt).where(
        TaskCreatRolePrompt.task_state == "C"
    )
    completed_tasks = session.exec(completed_tasks_stmt).all()
    
    if not completed_tasks:
        raise HTTPException(status_code=404, detail="没有找到已完成的任务")
    
    # 2. 提取批次编号并分组
    batch_groups = _extract_and_group_by_batch(completed_tasks)
    
    if not batch_groups:
        raise HTTPException(status_code=400, detail="没有找到有效的批次编号")
    
    # 3. 验证每个批次的完整性并处理
    sync_results = []
    
    for batch_number, batch_tasks in batch_groups.items():
        try:
            # 验证批次完整性
            batch_validation = _validate_batch_completeness(session, batch_number)
            
            if not batch_validation["is_complete"]:
                sync_results.append({
                    "batch_number": batch_number,
                    "status": "skipped",
                    "reason": f"批次不完整，总任务{batch_validation['total_tasks']}个，已完成{batch_validation['completed_tasks']}个"
                })
                continue
            
            # 按角色分组合并content
            role_merged_data = _merge_content_by_role(batch_tasks)
            
            # 写入角色提示词表
            created_prompts = _create_role_prompts(session, role_merged_data, batch_number)
            
            # 更新任务状态为已同步 (使用状态码 "S" 表示 Synced)
            _update_tasks_status(session, batch_tasks, "S")
            
            sync_results.append({
                "batch_number": batch_number,
                "status": "success",
                "created_prompts": len(created_prompts),
                "roles": list(role_merged_data.keys())
            })
            
        except Exception as e:
            sync_results.append({
                "batch_number": batch_number,
                "status": "error",
                "error": str(e)
            })
    
    session.commit()
    
    return {
        "message": "批次同步处理完成",
        "results": sync_results
    }


def _extract_batch_number(task_name: str) -> str:
    """
    从任务名称中提取批次编号
    任务名称格式：明日方舟角色任务001-213307-明日方舟-铃兰-人物关系
    提取：213307（第一个"-"和第二个"-"之间的数字）
    """
    pattern = r'-(\d+)-'
    match = re.search(pattern, task_name)
    if match:
        return match.group(1)
    return ""


def _extract_and_group_by_batch(tasks: List[TaskCreatRolePrompt]) -> Dict[str, List[TaskCreatRolePrompt]]:
    """
    提取批次编号并按批次分组任务
    """
    batch_groups = {}
    
    for task in tasks:
        batch_number = _extract_batch_number(task.task_name)
        if batch_number:
            if batch_number not in batch_groups:
                batch_groups[batch_number] = []
            batch_groups[batch_number].append(task)
    
    return batch_groups


def _validate_batch_completeness(session: Session, batch_number: str) -> Dict[str, Any]:
    """
    验证批次的完整性（该批次的所有任务是否都已完成）
    """
    # 查询包含该批次号的所有任务
    batch_pattern = f"%-{batch_number}-%"
    all_batch_tasks_stmt = select(TaskCreatRolePrompt).where(
        TaskCreatRolePrompt.task_name.like(batch_pattern)
    )
    all_batch_tasks = session.exec(all_batch_tasks_stmt).all()
    
    # 统计完成状态
    total_tasks = len(all_batch_tasks)
    completed_tasks = len([task for task in all_batch_tasks if task.task_state == "C"])
    
    return {
        "is_complete": total_tasks == completed_tasks and total_tasks > 0,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "all_tasks": all_batch_tasks
    }


def _merge_content_by_role(tasks: List[TaskCreatRolePrompt]) -> Dict[str, Dict[str, Any]]:
    """
    按角色分组并合并content内容
    """
    role_data = {}
    
    for task in tasks:
        if not task.role_item_prompt:
            continue
            
        role_name = task.role.name if task.role else "未知角色"
        
        # 解析role_item_prompt中的content
        try:
            if isinstance(task.role_item_prompt, str):
                prompt_data = json.loads(task.role_item_prompt)
            else:
                prompt_data = task.role_item_prompt
            
            content = prompt_data.get("content", {})
            
            if role_name not in role_data:
                role_data[role_name] = {}
            
            # 合并content数据
            _deep_merge_dict(role_data[role_name], content)
            
        except (json.JSONDecodeError, TypeError) as e:
            print(f"解析任务 {task.task_name} 的role_item_prompt失败: {e}")
            continue
    
    return role_data


def _deep_merge_dict(target: Dict[str, Any], source: Dict[str, Any]) -> None:
    """
    深度合并字典
    """
    for key, value in source.items():
        if key in target:
            if isinstance(target[key], dict) and isinstance(value, dict):
                _deep_merge_dict(target[key], value)
            elif isinstance(target[key], list) and isinstance(value, list):
                # 合并列表，去重
                target[key].extend(item for item in value if item not in target[key])
            else:
                # 覆盖非字典值
                target[key] = value
        else:
            target[key] = value


def _create_role_prompts(
    session: Session, 
    role_data: Dict[str, Dict[str, Any]], 
    batch_number: str
) -> List[RolePrompt]:
    """
    创建角色提示词记录
    """
    created_prompts = []
    
    for role_name, merged_content in role_data.items():
        # 查找角色
        role_stmt = select(TaskCreatRolePrompt).where(
            TaskCreatRolePrompt.role.has(name=role_name)
        ).limit(1)
        sample_task = session.exec(role_stmt).first()
        
        if not sample_task or not sample_task.role:
            print(f"未找到角色 {role_name}，跳过")
            continue
        
        # 创建角色提示词记录
        role_prompt = RolePrompt(
            role_id=sample_task.role.id,
            version=int(batch_number),
            user_prompt=merged_content,
            is_active="Y",
            created_at=datetime.utcnow()
        )
        
        session.add(role_prompt)
        created_prompts.append(role_prompt)
    
    return created_prompts


def _update_tasks_status(
    session: Session, 
    tasks: List[TaskCreatRolePrompt], 
    new_status: str
) -> None:
    """
    更新任务状态
    """
    for task in tasks:
        task.task_state = new_status
