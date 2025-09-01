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
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"找到 {len(batch_groups)} 个批次: {list(batch_groups.keys())}")
    
    for batch_number, batch_tasks in batch_groups.items():
        logger.info(f"处理批次 {batch_number}, 包含 {len(batch_tasks)} 个已完成任务")
        
        try:
            # 验证批次完整性
            batch_validation = _validate_batch_completeness(session, batch_number)
            
            logger.info(f"批次 {batch_number} 验证结果: 总任务{batch_validation['total_tasks']}个, 已完成{batch_validation['completed_tasks']}个")
            
            if not batch_validation["is_complete"]:
                sync_results.append({
                    "batch_number": batch_number,
                    "status": "skipped",
                    "reason": f"批次不完整，总任务{batch_validation['total_tasks']}个，已完成{batch_validation['completed_tasks']}个"
                })
                continue
            
            # 按角色分组合并content
            role_merged_data = _merge_content_by_role(batch_tasks)
            
            if not role_merged_data:
                logger.warning(f"批次 {batch_number} 没有可用的角色数据")
                sync_results.append({
                    "batch_number": batch_number,
                    "status": "skipped",
                    "reason": "没有可用的角色数据"
                })
                continue
            
            # 写入角色提示词表
            created_prompts = _create_role_prompts(session, role_merged_data, batch_number)
            
            if not created_prompts:
                logger.warning(f"批次 {batch_number} 没有创建任何角色提示词")
                sync_results.append({
                    "batch_number": batch_number,
                    "status": "error",
                    "error": "没有创建任何角色提示词"
                })
                continue
            
            # 更新任务状态为已同步 (使用状态码 "S" 表示 Synced)
            _update_tasks_status(session, batch_tasks, "S")
            
            logger.info(f"批次 {batch_number} 同步成功: 创建了 {len(created_prompts)} 个角色提示词")
            
            sync_results.append({
                "batch_number": batch_number,
                "status": "success",
                "created_prompts": len(created_prompts),
                "roles": list(role_merged_data.keys())
            })
            
        except Exception as e:
            logger.error(f"处理批次 {batch_number} 时发生错误: {str(e)}")
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
    任务名称格式：明日方舟角色任务001-143257-明日方舟-铃兰-人物关系
    提取：143257（第二个"-"和第三个"-"之间的数字）
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # 修正提取逻辑：提取第二个"-"和第三个"-"之间的内容
    parts = task_name.split('-')
    if len(parts) >= 3:
        batch_number = parts[1]  # 第二个部分应该是批次号
        if batch_number.isdigit():
            logger.debug(f"从任务名称 '{task_name}' 提取到批次号: {batch_number}")
            return batch_number
    
    logger.warning(f"无法从任务名称 '{task_name}' 提取有效的批次号")
    return ""


def _extract_and_group_by_batch(tasks: List[TaskCreatRolePrompt]) -> Dict[str, List[TaskCreatRolePrompt]]:
    """
    提取批次编号并按批次分组任务
    """
    batch_groups = {}
    
    for task in tasks:
        if not task.task_name:  # 添加空值检查
            continue
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
    import logging
    logger = logging.getLogger(__name__)
    
    role_data = {}
    
    for task in tasks:
        if not task.role_item_prompt:
            logger.warning(f"任务 {task.task_name} 的 role_item_prompt 为空，跳过")
            continue
            
        role_name = task.role.name if task.role else "未知角色"
        
        # 解析role_item_prompt中的内容
        try:
            if isinstance(task.role_item_prompt, str):
                prompt_data = json.loads(task.role_item_prompt)
            else:
                prompt_data = task.role_item_prompt
            
            logger.info(f"任务 {task.task_name} 的 role_item_prompt 结构: {type(prompt_data)}")
            
            # 多种数据结构支持
            content = None
            
            # 1. 尝试直接是JSON结构（新版本）
            if isinstance(prompt_data, dict) and 'basic_info' in prompt_data:
                content = prompt_data
                logger.info(f"检测到JSON结构任务，直接使用: {role_name}")
            
            # 2. 尝试从Legacy格式提取 generated_content （tasks.py的格式）
            elif isinstance(prompt_data, dict) and 'generated_content' in prompt_data:
                generated_content = prompt_data['generated_content']
                # 尝试解析 generated_content 为 JSON
                if isinstance(generated_content, str):
                    try:
                        content = json.loads(generated_content)
                        logger.info(f"从 generated_content 解析出JSON: {role_name}")
                    except json.JSONDecodeError:
                        content = {"content": generated_content}
                        logger.info(f"从 generated_content 作为文本: {role_name}")
                else:
                    content = generated_content
                    logger.info(f"直接使用 generated_content: {role_name}")
            
            # 3. 尝试从 content 字段提取（旧版本）
            elif isinstance(prompt_data, dict) and 'content' in prompt_data:
                content_value = prompt_data['content']
                if isinstance(content_value, str):
                    try:
                        content = json.loads(content_value)
                        logger.info(f"从 content 字段解析出JSON: {role_name}")
                    except json.JSONDecodeError:
                        content = {"content": content_value}
                        logger.info(f"从 content 字段作为文本: {role_name}")
                else:
                    content = content_value
                    logger.info(f"直接使用 content 字段: {role_name}")
            
            # 4. 如果都没有，尝试直接使用整个 prompt_data
            else:
                content = prompt_data
                logger.warning(f"使用整个 prompt_data 作为 content: {role_name}")
            
            if content is None:
                logger.error(f"无法从任务 {task.task_name} 提取有效内容")
                continue
            
            if role_name not in role_data:
                role_data[role_name] = {}
            
            # 合并content数据
            if isinstance(content, dict):
                _deep_merge_dict(role_data[role_name], content)
                logger.info(f"成功合并角色 {role_name} 的字典内容")
            else:
                # 如果不是字典，就作为文本内容处理
                if "text_content" not in role_data[role_name]:
                    role_data[role_name]["text_content"] = []
                role_data[role_name]["text_content"].append(str(content))
                logger.info(f"成功合并角色 {role_name} 的文本内容")
            
        except (json.JSONDecodeError, TypeError, AttributeError) as e:
            logger.error(f"解析任务 {task.task_name} 的role_item_prompt失败: {e}")
            logger.error(f"原始数据: {task.role_item_prompt}")
            continue
    
    logger.info(f"最终合并结果: {len(role_data)} 个角色")
    for role_name, content in role_data.items():
        logger.info(f"角色 {role_name}: {list(content.keys()) if isinstance(content, dict) else type(content)}")
    
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
    import logging
    logger = logging.getLogger(__name__)
    
    created_prompts = []
    
    for role_name, merged_content in role_data.items():
        logger.info(f"正在为角色 {role_name} 创建提示词，批次号: {batch_number}")
        
        # 查找角色
        role_stmt = select(TaskCreatRolePrompt).where(
            TaskCreatRolePrompt.role.has(name=role_name)
        ).limit(1)
        sample_task = session.exec(role_stmt).first()
        
        if not sample_task or not sample_task.role:
            logger.error(f"未找到角色 {role_name}，跳过")
            continue
        
        # 检查是否已存在相同版本的提示词
        existing_prompt_stmt = select(RolePrompt).where(
            RolePrompt.role_id == sample_task.role.id,
            RolePrompt.version == int(batch_number)
        )
        existing_prompt = session.exec(existing_prompt_stmt).first()
        
        if existing_prompt:
            logger.warning(f"角色 {role_name} 的版本 {batch_number} 已存在，跳过创建")
            continue
        
        # 确保 merged_content 不为空
        if not merged_content:
            logger.warning(f"角色 {role_name} 的合并内容为空，跳过")
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
        
        logger.info(f"成功创建角色 {role_name} 的提示词，版本: {batch_number}")
        logger.debug(f"提示词内容预览: {str(merged_content)[:200]}...")
    
    logger.info(f"总共创建了 {len(created_prompts)} 个角色提示词")
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
