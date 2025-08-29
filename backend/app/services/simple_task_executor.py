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
                
                # 获取任务命令 - 优先使用description字段
                if isinstance(task.task_cmd, dict):
                    task_command = task.task_cmd.get("description", "") or task.task_cmd.get("command", "") or str(task.task_cmd)
                else:
                    task_command = str(task.task_cmd)
                
                # 构建提示词内容
                prompt_content = await self._build_prompt_content(session, task, role, task_command)
                
                # 调用AI API
                result = await self._call_ai_api(task_command, prompt_content)
                
                if result:
                    # 保存结果到role_item_prompt字段，智能处理JSON格式
                    content = self._process_ai_result(result)
                    task.role_item_prompt = {"content": content, "generated_at": datetime.now().isoformat()}
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
                        content = self._process_ai_result(result)
                        task.role_item_prompt = {"content": content, "generated_at": datetime.now().isoformat()}
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
        """构建提示词内容 - 通用实现"""
        try:
            # 解析任务命令（支持JSON格式和字符串格式）
            parsed_command = self._parse_task_command(task_command)
            
            # 根据解析结果构建提示词
            if parsed_command["task_type"] == "json_generation":
                return self._build_json_prompt(role, parsed_command)
            elif parsed_command["task_type"] == "structured_data":
                return self._build_structured_prompt(role, parsed_command)
            else:
                return self._build_content_prompt(role, parsed_command)
                
        except Exception as e:
            logger.error(f"构建提示词内容时发生错误: {str(e)}")
            # 降级处理：使用原始任务命令
            return self._build_fallback_prompt(role, task_command)
    
    def _parse_task_command(self, task_command: str) -> Dict[str, Any]:
        """解析任务命令为标准格式"""
        try:
            # 尝试解析为JSON格式
            if task_command.strip().startswith('{'):
                return json.loads(task_command)
        except json.JSONDecodeError:
            pass
        
        # 字符串格式的智能解析
        parsed = {
            "task_type": "content_generation",
            "output_format": {"type": "text"},
            "content_requirements": {
                "topic": "角色相关内容",
                "style": "详细生动",
                "specific_requirements": []
            },
            "context": {}
        }
        
        # 检测输出格式类型
        if self._contains_json_indicators(task_command):
            parsed["task_type"] = "json_generation"
            parsed["output_format"]["type"] = "json"
            
            # 提取JSON结构
            json_structure = self._extract_json_structure_from_command(task_command)
            if json_structure:
                try:
                    parsed["output_format"]["structure"] = json.loads(json_structure)
                except json.JSONDecodeError:
                    pass
        
        # 提取其他要求
        parsed["content_requirements"]["topic"] = self._extract_topic_from_command(task_command)
        parsed["content_requirements"]["specific_requirements"] = self._extract_requirements_from_command(task_command)
        
        return parsed
    
    def _contains_json_indicators(self, command: str) -> bool:
        """检测命令中是否包含JSON格式指示器"""
        json_indicators = [
            "json", "JSON", 
            "输出格式：{", "输出格式: {",
            '"', "'", 
            "结构化数据", "数据格式"
        ]
        return any(indicator in command for indicator in json_indicators)
    
    def _extract_topic_from_command(self, command: str) -> str:
        """从命令中提取主题"""
        # 通用的主题提取逻辑
        if "生成" in command:
            # 提取"生成...相关"或"生成...内容"
            import re
            patterns = [
                r'生成([^的]*?)相关',
                r'生成([^的]*?)内容',
                r'为.*生成(.*?)(?:相关|内容|信息)',
            ]
            for pattern in patterns:
                match = re.search(pattern, command)
                if match:
                    return match.group(1).strip()
        
        return "角色相关内容"
    
    def _extract_requirements_from_command(self, command: str) -> list:
        """从命令中提取具体要求"""
        requirements = []
        
        # 通用的要求提取模式
        requirement_patterns = [
            r'要求[：:](.+?)(?=\n|$)',
            r'需要(.+?)(?=\n|$)',
            r'必须(.+?)(?=\n|$)',
            r'应当(.+?)(?=\n|$)',
        ]
        
        import re
        for pattern in requirement_patterns:
            matches = re.findall(pattern, command, re.MULTILINE)
            requirements.extend([req.strip() for req in matches])
        
        return requirements
    
    def _build_json_prompt(self, role: Role, parsed_command: Dict[str, Any]) -> str:
        """构建JSON格式提示词"""
        output_format = parsed_command.get("output_format", {})
        structure = output_format.get("structure")
        topic = parsed_command.get("content_requirements", {}).get("topic", "数据")
        
        if structure:
            structure_str = json.dumps(structure, ensure_ascii=False, indent=2)
        else:
            structure_str = '{\n  "请根据需求定义结构": ""\n}'
        
        return f"""请为角色"{role.name}"生成{topic}的JSON数据。

输出格式：
{structure_str}

请直接输出JSON，不需要其他说明。"""
    
    def _build_structured_prompt(self, role: Role, parsed_command: Dict[str, Any]) -> str:
        """构建结构化数据提示词"""
        requirements = parsed_command.get("content_requirements", {})
        topic = requirements.get("topic", "相关内容")
        style = requirements.get("style", "详细准确")
        specific_reqs = requirements.get("specific_requirements", [])
        
        prompt = f"""请为角色"{role.name}"生成{topic}。

生成要求：
- 风格：{style}
"""
        
        if specific_reqs:
            prompt += "- 具体要求：\n"
            for req in specific_reqs:
                prompt += f"  * {req}\n"
        
        prompt += "\n请直接生成内容，不需要额外说明。"
        return prompt
    
    def _build_content_prompt(self, role: Role, parsed_command: Dict[str, Any]) -> str:
        """构建内容生成提示词"""
        requirements = parsed_command.get("content_requirements", {})
        topic = requirements.get("topic", "相关内容")
        style = requirements.get("style", "详细生动")
        specific_reqs = requirements.get("specific_requirements", [])
        
        prompt = f"""请为角色"{role.name}"生成{topic}。

角色信息：
- 角色名称：{role.name}
- 所属世界观：{getattr(role, 'create_from', '') or '未指定'}

生成风格：{style}
"""
        
        if specific_reqs:
            prompt += "\n具体要求：\n"
            for req in specific_reqs:
                prompt += f"- {req}\n"
        
        prompt += "\n请直接生成内容，不需要额外的解释说明。"
        return prompt
    
    def _build_fallback_prompt(self, role: Role, task_command: str) -> str:
        """构建降级处理提示词"""
        return f"""请为角色"{role.name}"生成相关内容。

任务要求：{task_command}

请直接生成内容，不需要额外的解释说明。"""
    
    def _process_ai_result(self, result: str) -> Any:
        """智能处理AI返回结果，避免双重序列化"""
        try:
            # 尝试解析为JSON对象
            parsed_json = json.loads(result.strip())
            # 如果解析成功，返回JSON对象而不是字符串
            logger.info("AI返回结果为JSON格式，直接存储为对象")
            return parsed_json
        except json.JSONDecodeError:
            # 如果不是有效JSON，返回原始字符串
            logger.info("AI返回结果为文本格式，存储为字符串")
            return result.strip()
        except Exception as e:
            # 出现其他错误时，返回原始结果
            logger.warning(f"处理AI结果时发生错误: {e}，返回原始结果")
            return result
    
    def _extract_json_structure_from_command(self, task_command: str) -> str:
        """从任务命令中提取JSON结构"""
        try:
            import re
            
            # 查找JSON结构的几种可能模式
            patterns = [
                # 模式1: 输出格式：后面包含数组的JSON结构
                r'输出格式[：:]\s*(\{[^{}]*"[^"]*"\s*:\s*\[[^\[\]]*(?:\{[^{}]*\}[^\[\]]*)*\][^{}]*\})',
                # 模式2: 输出格式：后面的简单JSON结构
                r'输出格式[：:]\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})',
                # 模式3: 任何包含数组的JSON结构
                r'(\{[^{}]*"[^"]*"\s*:\s*\[[^\[\]]*(?:\{[^{}]*\}[^\[\]]*)*\][^{}]*\})',
                # 模式4: { ... } 直到"生成要求"或其他关键词
                r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})(?=.*?(?:生成要求|输入为|输出为|请直接))',
                # 模式5: 完整的多层嵌套JSON结构
                r'(\{(?:[^{}]|(?:\{[^{}]*\}))*\})',
                # 模式6: 查找basic_info结构
                r'(\{[^{}]*"basic_info"[^{}]*\{[^{}]*\}[^{}]*\})'
            ]
            
            for pattern in patterns:
                matches = re.findall(pattern, task_command, re.DOTALL)
                if matches:
                    # 取第一个匹配的JSON结构
                    json_str = matches[0].strip()
                    
                    # 清理转义符和多余的换行符
                    json_str = (json_str
                               .replace('\\n', '\n')
                               .replace('\\"', '"')
                               .replace('\\\\', '\\')
                               .replace('\\t', '  '))
                    
                    # 验证是否是有效的JSON结构
                    try:
                        import json
                        # 尝试解析以验证JSON格式
                        parsed = json.loads(json_str)
                        # 重新格式化为美观的JSON
                        return json.dumps(parsed, ensure_ascii=False, indent=2)
                    except json.JSONDecodeError:
                        # 如果解析失败，尝试修复常见问题
                        # 例如缺少引号的键名
                        fixed_json = re.sub(r'(\w+):', r'"\1":', json_str)
                        try:
                            parsed = json.loads(fixed_json)
                            return json.dumps(parsed, ensure_ascii=False, indent=2)
                        except:
                            continue
            
            # 如果所有模式都匹配失败，返回None
            logger.warning("无法从任务命令中提取有效的JSON结构")
            return None
            
        except Exception as e:
            logger.error(f"提取JSON结构时发生错误: {str(e)}")
            return None
    
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
                # 返回一个简洁的错误提示，不包含模板内容
                return f"API调用失败，无法生成内容。请稍后重试。"
                
        except Exception as e:
            logger.error(f"调用AI API时发生错误: {str(e)}")
            # 返回一个简洁的错误提示，不包含模板内容
            return f"系统错误，无法生成内容：{str(e)[:100]}"
    
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