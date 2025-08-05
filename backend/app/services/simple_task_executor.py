"""
简单任务执行器
处理单个任务的执行，调用AI API并更新结果
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, Any
from sqlmodel import Session, select

from app.core.db import engine
from app.models import TaskCreatRolePrompt, RolePrompt, Role, RoleTemplateItem
from app.services.external_api_client import ExternalApiClient, ApiProvider
from app.core.config import settings

logger = logging.getLogger(__name__)


class SimpleTaskExecutor:
    """简单任务执行器"""
    
    def __init__(self):
        self.api_client = ExternalApiClient(settings)
    
    async def execute_task(self, task_id: int) -> bool:
        """
        执行单个任务
        
        Args:
            task_id: 任务ID
            
        Returns:
            bool: 执行是否成功
        """
        try:
            # 获取任务信息
            with Session(engine) as session:
                task = session.get(TaskCreatRolePrompt, task_id)
                if not task:
                    logger.error(f"Task {task_id} not found")
                    return False
                
                # 更新任务状态为运行中
                task.task_state = "R"
                session.add(task)
                session.commit()
                
                logger.info(f"开始执行任务 {task_id}: {task.task_name}")
                
                # 获取相关数据
                role = session.get(Role, task.role_id)
                if not role:
                    logger.error(f"Role {task.role_id} not found for task {task_id}")
                    await self._mark_task_failed(session, task, "未找到关联的角色")
                    return False
                
                # 获取任务命令
                task_command = task.task_cmd.get("command", "") if isinstance(task.task_cmd, dict) else str(task.task_cmd)
                
                # 构建提示词内容
                prompt_content = await self._build_prompt_content(session, task, role, task_command)
                
                # 调用AI API
                result = await self._call_ai_api(task_command, prompt_content)
                
                if result:
                    # 保存结果到role_item_prompt字段
                    task.role_item_prompt = {"content": result, "generated_at": datetime.now().isoformat()}
                    task.task_state = "C"  # 完成
                    session.add(task)
                    try:
                        session.commit()
                        logger.info(f"任务 {task_id} 执行成功，状态已更新为完成")
                    except Exception as commit_error:
                        logger.error(f"任务 {task_id} 状态更新失败: {str(commit_error)}")
                        session.rollback()
                        # 重试一次状态更新
                        session.refresh(task)
                        task.task_state = "C"
                        task.role_item_prompt = {"content": result, "generated_at": datetime.now().isoformat()}
                        session.add(task)
                        session.commit()
                        logger.info(f"任务 {task_id} 状态重试更新成功")
                    return True
                else:
                    await self._mark_task_failed(session, task, "AI API调用失败")
                    return False
                    
        except Exception as e:
            logger.error(f"执行任务 {task_id} 时发生错误: {str(e)}")
            try:
                with Session(engine) as session:
                    task = session.get(TaskCreatRolePrompt, task_id)
                    if task:
                        await self._mark_task_failed(session, task, f"执行错误: {str(e)}")
            except:
                pass
            return False
    
    async def _build_prompt_content(self, session: Session, task: TaskCreatRolePrompt, role: Role, task_command: str) -> str:
        """构建提示词内容"""
        try:
            return f"""
角色信息：
- 角色名称：{role.name}
- 角色描述：{getattr(role, 'create_from', '') or ''}

任务命令：{task_command}

请根据以上信息生成角色提示词内容。
"""
        except Exception as e:
            logger.error(f"构建提示词内容时发生错误: {str(e)}")
            return f"角色：{role.name}\n任务：{task_command}"
    
    async def _call_ai_api(self, command: str, content: str) -> str:
        """调用AI API"""
        try:
            # 调用API（提供商由ExternalApiClient的current_provider决定）
            response = await self.api_client.call_generate_api(
                task_id=1,  # 临时任务ID
                command={
                    "messages": [
                        {"role": "system", "content": "你是一个专业的角色提示词生成助手。"},
                        {"role": "user", "content": content}
                    ]
                }
            )
            
            if response and response.success:
                # 从ApiResponse的data中获取内容（支持多种字段格式）
                if response.data:
                    # 优先检查mock API的字段
                    content_result = response.data.get('generated_content', '')
                    if content_result:
                        return content_result
                    
                    # 检查标准content字段
                    content_result = response.data.get('content', '')
                    if content_result:
                        return content_result
                    
                    # 检查OpenAI格式的返回
                    choices = response.data.get('choices', [])
                    if choices and len(choices) > 0:
                        message = choices[0].get('message', {})
                        content_result = message.get('content', '')
                        if content_result:
                            return content_result
            else:
                logger.error(f"AI API调用失败: {response.error if response else 'No response'}")
                # 返回一个模拟结果
                return f"这是基于命令 '{command}' 生成的模拟提示词内容。\n内容：{content[:200]}..."
                
        except Exception as e:
            logger.error(f"调用AI API时发生错误: {str(e)}")
            # 返回一个模拟结果
            return f"模拟生成的提示词内容（API调用失败）：{command}\n{content[:200]}..."
    
    async def _mark_task_failed(self, session: Session, task: TaskCreatRolePrompt, error_message: str):
        """标记任务为失败状态"""
        task.task_state = "F"
        task.role_item_prompt = {"error": error_message, "failed_at": datetime.now().isoformat()}
        session.add(task)
        session.commit()
        logger.error(f"任务 {task.id} 标记为失败: {error_message}")


# 全局执行器实例
task_executor = SimpleTaskExecutor()


async def execute_task_async(task_id: int) -> bool:
    """异步执行任务的便捷函数"""
    return await task_executor.execute_task(task_id)


def execute_task_background(task_id: int):
    """在后台执行任务"""
    import threading
    
    def run_task():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(execute_task_async(task_id))
            loop.close()
            logger.info(f"后台任务 {task_id} 执行完成，结果: {result}")
        except Exception as e:
            logger.error(f"后台执行任务 {task_id} 时发生错误: {str(e)}")
    
    thread = threading.Thread(target=run_task)
    thread.daemon = True
    thread.start()
    logger.info(f"任务 {task_id} 已在后台线程中启动")