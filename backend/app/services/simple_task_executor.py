"""
简单任务执行器 - 重构版本
去除所有硬编码内容，严格按照提示词格式要求json.md规范
"""
import asyncio
import json
import logging
import re
import threading
from datetime import datetime
from typing import Dict, Any, List
from sqlmodel import Session, select

from app.core.db import engine
from app.models import TaskCreatRolePrompt, RolePrompt, Role, RoleTemplateItem
from app.services.external_api_client import ExternalApiClient, ApiProvider
from app.core.config import settings

logger = logging.getLogger(__name__)


class SimpleTaskExecutor:
    """简单任务执行器 - 动态结构版本，从任务命令中提取JSON结构"""
    
    def __init__(self):
        # 不在初始化时创建API客户端，而是在需要时创建
        self.settings = settings
        self.api_client = None
        
        # 配置常量
        self._init_config()
    
    def _init_config(self):
        """初始化配置常量"""
        # 默认值配置
        self.DEFAULT_VALUES = {
            "UNKNOWN": "未知",
            "DEFAULT_BIRTHPLACE": "龙门",
            "DEFAULT_BATTLE_EXPERIENCE": "三年",
            "DEFAULT_INFECTION_STATUS": "非感染者",
            "DEFAULT_FEMALE_HEIGHT": "165cm",
            "DEFAULT_MALE_HEIGHT": "175cm",
            "DEFAULT_HEIGHT": "170cm"
        }
        
        # 基础信息字段配置
        self.BASIC_INFO_FIELDS = {
            "name": self.DEFAULT_VALUES["UNKNOWN"],
            "code_name": self.DEFAULT_VALUES["UNKNOWN"],
            "gender": self.DEFAULT_VALUES["UNKNOWN"],
            "race": self.DEFAULT_VALUES["UNKNOWN"],
            "height": self.DEFAULT_VALUES["UNKNOWN"],
            "birthday": self.DEFAULT_VALUES["UNKNOWN"],
            "birthplace": self.DEFAULT_VALUES["UNKNOWN"],
            "battle_experience": self.DEFAULT_VALUES["UNKNOWN"],
            "infection_status": self.DEFAULT_VALUES["UNKNOWN"],
            "description": self.DEFAULT_VALUES["UNKNOWN"]
        }
        
        # 文本清理模式配置
        self.TEXT_CLEANUP_PATTERNS = {
            "role_prefix": r'^角色名：'
        }
        
        # 字段解析模式配置
        self.FIELD_PATTERNS = {
            "name": [
                r"^\s*([\u4e00-\u9fff·]+)\s*",  # 文本开头的中文名称
                r"角色名?：?\s*([\u4e00-\u9fff·]+)",
                r"名称：\s*([\u4e00-\u9fff·]+)",
                r"姓名：\s*([\u4e00-\u9fff·]+)"
            ],
            "gender": [r"性别：?\s*(男|女)"],
            "age": [r"年龄：?\s*(\d+)"],
            "race": [r"种族：?\s*([\u4e00-\u9fff]+)"],
            "job": [r"职业：?\s*([\u4e00-\u9fff]+)"]
        }
        
        # 性格特点解析模式
        self.PERSONALITY_PATTERNS = [
            r"性格特点：?\s*([^\n。！]{10,200})",
            r"性格：\s*([^\n。！]{10,200})",
            r"特点：\s*([^\n。！]{10,200})"
        ]
        
        # 性别对应身高配置
        self.GENDER_HEIGHT_MAPPING = {
            "女": self.DEFAULT_VALUES["DEFAULT_FEMALE_HEIGHT"],
            "男": self.DEFAULT_VALUES["DEFAULT_MALE_HEIGHT"]
        }
        
        # JSON结构提取模式
        self.JSON_EXTRACTION_PATTERNS = [
            r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}',
            r'结构[：:]?\s*(\{.*?\})',
            r'格式[：:]?\s*(\{.*?\})'
        ]
        
        # 描述模板配置
        self.DESCRIPTION_TEMPLATES = {
            "default": "一位专业的{job}，{race}族，具有独特的能力和魅力。",
            "fallback_note": "使用备选结构生成",
            "template_note": "基于模板条目{template_id}生成"
        }
        
        # 字符长度限制配置
        self.LENGTH_LIMITS = {
            "content_preview": 100,
            "fallback_content": 200,
            "min_description_length": 10,
            "max_description_length": 200
        }
    
    async def execute_task(self, task_id: int) -> bool:
        """
        执行单个任务
        
        Args:
            task_id: 任务ID
            
        Returns:
            bool: 执行是否成功
        """
        # 为每个任务创建新的API客户端实例，避免会话冲突
        self.api_client = ExternalApiClient(self.settings)
        
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
                
                # 设置当前任务上下文，用于任务类型检测
                self.current_task_name = task.task_name
                
                # 获取相关数据
                role = session.get(Role, task.role_id)
                if not role:
                    logger.error(f"Role {task.role_id} not found for task {task_id}")
                    await self._mark_task_failed(session, task, "未找到关联的角色")
                    return False
                
                # 直接使用完整的任务命令内容，并进行角色名称替换
                enhanced_command = self._prepare_task_command_with_role_replacement(task.task_cmd, role)
                
                # 打印调用AI的命令日志
                logger.info(f"任务 {task_id} 调用AI API参数:")
                logger.info(f"Task Command: {json.dumps(enhanced_command, ensure_ascii=False, indent=2)}")
                
                result = await self._call_ai_api_enhanced(enhanced_command)
                
                if result:
                    # 保存结果到role_item_prompt字段，智能处理JSON格式
                    processed_result = self._process_ai_result(result)
                    
                    # 检查是否为JSON任务且返回的是合法JSON
                    if self._is_json_task_result(task.task_cmd, processed_result):
                        # 对于JSON任务，直接保存AI返回的JSON结果
                        task.role_item_prompt = processed_result
                    else:
                        # 对于非JSON任务，使用原有的包装格式
                        task.role_item_prompt = {"content": processed_result, "generated_at": datetime.now().isoformat()}
                    
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
                        processed_result = self._process_ai_result(result)
                        if self._is_json_task_result(task.task_cmd, processed_result):
                            task.role_item_prompt = processed_result
                        else:
                            task.role_item_prompt = {"content": processed_result, "generated_at": datetime.now().isoformat()}
                        session.add(task)
                        session.commit()
                        logger.info(f"任务 {task_id} 状态重试更新成功")
                    return True
                else:
                    await self._mark_task_failed(session, task, "AI API调用失败，未能获取有效响应")
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
        finally:
            # 确保在任务完成后清理API客户端资源
            if self.api_client:
                try:
                    await self.api_client.close()
                except Exception as cleanup_error:
                    logger.warning(f"清理API客户端资源时发生错误: {str(cleanup_error)}")
                finally:
                    self.api_client = None
    
    def _prepare_task_command_with_role_replacement(self, task_cmd: Any, role: Any) -> Dict[str, Any]:
        """准备任务命令，进行角色名称的动态替换"""
        if not isinstance(task_cmd, dict):
            return {"content": str(task_cmd)}
        
        # 深度复制任务命令，避免修改原始数据
        enhanced_command = self._deep_copy_dict(task_cmd)
        
        # 处理description字段的JSON字符串解析
        enhanced_command = self._parse_description_field(enhanced_command)
        
        # 如果有角色信息，进行动态替换
        if role and role.name:
            enhanced_command = self._replace_role_placeholders(enhanced_command, role.name)
        
        return enhanced_command
    
    def _parse_description_field(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """解析description字段中的JSON字符串"""
        if "description" in command:
            description = command["description"]
            
            # 如果description是字符串，尝试解析为JSON
            if isinstance(description, str) and description.strip():
                try:
                    # 尝试解析JSON字符串
                    parsed_description = json.loads(description)
                    if isinstance(parsed_description, dict):
                        # 成功解析，替换原来的字符串
                        command["description"] = parsed_description
                        logger.info("成功解析description字段的JSON字符串")
                except json.JSONDecodeError:
                    # 解析失败，保持原始字符串
                    logger.debug("description字段不是有效的JSON字符串，保持原始格式")
                    pass
        
        return command
    
    def _deep_copy_dict(self, obj: Any) -> Any:
        """深度复制字典或其他对象"""
        if isinstance(obj, dict):
            return {key: self._deep_copy_dict(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._deep_copy_dict(item) for item in obj]
        else:
            return obj
    
    def _replace_role_placeholders(self, obj: Any, role_name: str) -> Any:
        """递归替换对象中的角色名称占位符"""
        if isinstance(obj, dict):
            result = {}
            for key, value in obj.items():
                result[key] = self._replace_role_placeholders(value, role_name)
            return result
        elif isinstance(obj, list):
            return [self._replace_role_placeholders(item, role_name) for item in obj]
        elif isinstance(obj, str):
            # 替换各种可能的角色名称占位符
            replacements = [
                ("角色名称输入", role_name),
                ("所属角色", role_name),
                ("{{role_name}}", role_name),
                ("{{role}}", role_name),
                ("{role_name}", role_name),
                ("{role}", role_name)
            ]
            
            result = obj
            for placeholder, replacement in replacements:
                result = result.replace(placeholder, replacement)
            
            return result
        else:
            return obj

    async def _call_ai_api_enhanced(self, command: Dict[str, Any]) -> str:
        """调用AI API的增强版本，支持JSON格式强制"""
        try:
            if not self.api_client:
                logger.error("API客户端未初始化")
                return ""
                
            response = await self.api_client.call_generate_api(
                task_id=1,
                command=command
            )
            
            if response and response.success and hasattr(response, 'data') and response.data:
                content = response.data.get('generated_content', '')
                if content:
                    logger.info(f"AI返回内容: {content}")
                    # 对于JSON任务，验证并清理输出
                    if self._is_json_task(command):
                        return self._ensure_json_output(content, command)
                    return content
                else:
                    logger.error("AI API返回空内容")
                    return ""
            else:
                error_msg = response.error if response else "API响应为空"
                logger.error(f"AI API调用失败: {error_msg}")
                return ""
                
        except asyncio.CancelledError:
            logger.warning("任务被取消，AI API调用中断")
            raise  # 重新抛出CancelledError以便上层处理
        except asyncio.TimeoutError:
            logger.error("AI API调用超时")
            return ""
        except Exception as e:
            logger.error(f"AI API调用异常: {str(e)}")
            return ""
    
    def _is_json_task(self, command: Dict[str, Any]) -> bool:
        """检查是否为JSON任务"""
        # 检查description字段是否包含JSON任务结构
        if "description" in command:
            description = command["description"]
            
            # 处理字典格式的description
            if isinstance(description, dict):
                output_format = description.get("output_format", {})
                if output_format.get("type") == "json":
                    return True
            
            # 处理字符串格式的description
            elif isinstance(description, str):
                try:
                    desc_json = json.loads(description)
                    if isinstance(desc_json, dict):
                        output_format = desc_json.get("output_format", {})
                        if output_format.get("type") == "json":
                            return True
                except json.JSONDecodeError:
                    pass
        
        # 检查messages中是否包含JSON相关指示
        messages = command.get("messages", [])
        for message in messages:
            content = message.get("content", "")
            if any(indicator in content for indicator in ["JSON", "json", "专业的JSON数据生成器", "输出格式：json", "输出结构"]):
                return True
        return False
    
    def _ensure_json_output(self, content: str, command: Dict[str, Any] | None = None) -> str:
        """确保输出是有效的JSON格式，使用智能解析和生成"""
        try:
            # 首先尝试直接解析
            json.loads(content)
            return content.strip()
        except json.JSONDecodeError:
            # 如果解析失败，使用智能方法生成JSON
            return self._smart_json_generation(content, command)
    
    def _smart_json_generation(self, ai_content: str, command: Dict[str, Any] | None = None) -> str:
        """基于AI生成的内容智能构建JSON，从任务命令中提取结构"""
        try:
            # 从任务命令中提取结构
            structure = self._extract_structure_from_command(command)
            
            if not structure:
                logger.warning("无法从任务命令中提取结构，使用默认结构")
                structure = {"content": ""}
            
            # 检查AI内容是否为所有字段相同的长文本情况
            if self._is_duplicated_long_text(ai_content, structure):
                filled_structure = self._extract_fields_from_long_text(structure, ai_content)
            else:
                # 尝试从AI内容中提取信息并填充到结构中
                filled_structure = self._fill_structure_from_content(structure, ai_content)
            
            generated_json = json.dumps(filled_structure, ensure_ascii=False, indent=2)
            
            return generated_json
            
        except Exception as e:
            logger.error(f"智能JSON生成失败: {str(e)}")
            # 最后的备选方案：返回简单的JSON结构
            return self._get_fallback_json(ai_content)
    
    def _extract_structure_from_command(self, command: Dict[str, Any] | None = None) -> Dict[str, Any] | None:
        """从任务命令中提取JSON结构"""
        if not command:
            return None
            
        # 检查 output_format.structure
        output_format = command.get("output_format", {})
        structure = output_format.get("structure")
        
        if structure:
            return structure
            
        # 检查是否直接在command中有结构定义
        if "structure" in command:
            return command["structure"]
            
        # 检查是否有description字段包含JSON结构
        description = command.get("description", "")
        
        # 处理字典格式的description
        if isinstance(description, dict):
            output_format = description.get("output_format", {})
            structure = output_format.get("structure")
            if structure:
                return structure
        
        # 处理字符串格式的description        
        elif isinstance(description, str) and description.strip():
            try:
                desc_json = json.loads(description)
                if isinstance(desc_json, dict):
                    output_format = desc_json.get("output_format", {})
                    structure = output_format.get("structure")
                    if structure:
                        return structure
            except json.JSONDecodeError:
                pass
            
            # 尝试从description中提取JSON结构
            extracted_structure = self._extract_json_structure_from_description(description)
            if extracted_structure:
                return extracted_structure
        
        # 根据templateItemId推断结构
        template_item_id = command.get("templateItemId")
        if template_item_id:
            return self._create_default_structure_for_template(template_item_id)
            
        # 如果没有找到结构，返回None
        return None

    def _fill_structure_from_content(self, structure: Dict[str, Any], content: str) -> Dict[str, Any]:
        """从AI内容中提取信息填充到任意结构中，完全动态"""
        filled_structure = self._deep_copy_and_fill(structure, content)
        return filled_structure
    
    def _deep_copy_and_fill(self, obj: Any, content: str) -> Any:
        """深度复制结构并智能填充内容"""
        if isinstance(obj, dict):
            result = {}
            for key, value in obj.items():
                result[key] = self._deep_copy_and_fill(value, content)
            return result
        elif isinstance(obj, list):
            if not obj:
                # 空数组填充一些默认内容
                return ["未知"]
            else:
                # 如果是数组，复制第一个元素的结构
                result = []
                for item in obj:
                    result.append(self._deep_copy_and_fill(item, content))
                return result
        elif isinstance(obj, str):
            if obj == "":
                # 空字符串尝试从内容中提取相关信息
                return self._extract_relevant_info(content) or "未知"
            else:
                # 非空字符串保持原值
                return obj
        else:
            # 其他类型保持原值
            return obj
    
    def _is_duplicated_long_text(self, ai_content: str, structure: Dict[str, Any]) -> bool:
        """检查AI内容是否为重复的长文本格式"""
        # 检查内容是否包含角色名前缀且较长
        if "角色名：" in ai_content and len(ai_content) > 200:
            return True
        
        # 检查是否包含多个字段信息但格式不正确
        field_indicators = ["性别：", "年龄：", "种族：", "职业：", "性格特点："]
        found_indicators = sum(1 for indicator in field_indicators if indicator in ai_content)
        
        return found_indicators >= 3
    
    def _extract_fields_from_long_text(self, structure: Dict[str, Any], ai_content: str) -> Dict[str, Any]:
        """从长文本中提取对应的字段信息"""
        filled_structure = {}
        
        # 如果是 basic_info 结构，使用专门的解析方法
        if "basic_info" in structure:
            filled_structure["basic_info"] = self._parse_basic_info_from_text(ai_content)
        else:
            # 其他结构使用通用方法
            for key, value in structure.items():
                if isinstance(value, dict):
                    filled_structure[key] = self._extract_fields_from_long_text(value, ai_content)
                else:
                    filled_structure[key] = self._extract_single_field_from_text(key, ai_content)
        
        return filled_structure
    
    def _parse_basic_info_from_text(self, text: str) -> Dict[str, str]:
        """从文本中解析 basic_info 字段"""
        # 初始化基础信息结构
        basic_info = self.BASIC_INFO_FIELDS.copy()
        
        # 清理文本，移除角色名前缀
        cleaned_text = re.sub(self.TEXT_CLEANUP_PATTERNS["role_prefix"], '', text)
        
        # 解析角色名称
        for pattern in self.FIELD_PATTERNS["name"]:
            match = re.search(pattern, cleaned_text)
            if match:
                name = match.group(1).strip()
                if name and name != "角色名":
                    basic_info["name"] = name
                    break
        
        # 解析性别
        gender_match = re.search(self.FIELD_PATTERNS["gender"][0], text)
        if gender_match:
            basic_info["gender"] = gender_match.group(1)
        
        # 解析年龄（转换为生日）
        age_match = re.search(self.FIELD_PATTERNS["age"][0], text)
        if age_match:
            age = int(age_match.group(1))
            basic_info["birthday"] = self._generate_birthday_from_age(age)
        
        # 解析种族
        race_match = re.search(self.FIELD_PATTERNS["race"][0], text)
        if race_match:
            basic_info["race"] = race_match.group(1)
        
        # 解析职业（作为 code_name）
        job_match = re.search(self.FIELD_PATTERNS["job"][0], text)
        if job_match:
            basic_info["code_name"] = job_match.group(1)
        
        # 基于性别生成合理的身高
        basic_info["height"] = self._get_height_by_gender(basic_info["gender"])
        
        # 设置默认值
        basic_info["birthplace"] = self.DEFAULT_VALUES["DEFAULT_BIRTHPLACE"]
        basic_info["battle_experience"] = self.DEFAULT_VALUES["DEFAULT_BATTLE_EXPERIENCE"]
        basic_info["infection_status"] = self.DEFAULT_VALUES["DEFAULT_INFECTION_STATUS"]
        
        # 提取性格特点作为描述
        description = self._extract_personality_description(text)
        if description:
            basic_info["description"] = description
        else:
            # 生成默认描述
            basic_info["description"] = self._generate_default_description(basic_info)
        
        return basic_info
    
    def _generate_birthday_from_age(self, age: int) -> str:
        """基于年龄生成合理的生日"""
        month = (age % 12) + 1
        day = (age % 28) + 1
        return f"{month}月{day}日"
    
    def _get_height_by_gender(self, gender: str) -> str:
        """根据性别获取身高"""
        return self.GENDER_HEIGHT_MAPPING.get(gender, self.DEFAULT_VALUES["DEFAULT_HEIGHT"])
    
    def _extract_personality_description(self, text: str) -> str:
        """提取性格特点描述"""
        for pattern in self.PERSONALITY_PATTERNS:
            match = re.search(pattern, text)
            if match:
                description = match.group(1).strip()
                # 移除可能的截断标记
                description = re.sub(r'\.\.\.$', '', description)
                if description and len(description) >= self.LENGTH_LIMITS["min_description_length"]:
                    return description
        return ""
    
    def _generate_default_description(self, basic_info: Dict[str, str]) -> str:
        """生成默认描述"""
        race = basic_info.get('race', '角色')
        job = basic_info.get('code_name', '专业人士')
        return self.DESCRIPTION_TEMPLATES["default"].format(job=job, race=race)
    
    def _extract_single_field_from_text(self, field_name: str, text: str) -> str:
        """从文本中提取单个字段的值"""
        patterns = self.FIELD_PATTERNS.get(field_name, [])
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()
        
        return self.DEFAULT_VALUES["UNKNOWN"]

    def _extract_relevant_info(self, content: str) -> str:
        """从内容中提取相关信息的通用方法"""
        max_length = self.LENGTH_LIMITS["content_preview"]
        if len(content) > max_length:
            return content[:max_length] + "..."
        return content

    def _extract_json_structure_from_description(self, description: str) -> Dict[str, Any] | None:
        """从描述中提取JSON结构"""
        if not description:
            return None
            
        for pattern in self.JSON_EXTRACTION_PATTERNS:
            matches = re.findall(pattern, description, re.DOTALL)
            for match in matches:
                try:
                    structure = json.loads(match)
                    if isinstance(structure, dict) and structure:
                        return structure
                except json.JSONDecodeError:
                    continue
        
        return {}
    
    def _create_default_structure_for_template(self, template_item_id: int) -> Dict[str, Any]:
        """为模板条目创建默认结构"""
        return {
            "content": "",
            "description": "",
            "examples": [],
            "note": self.DESCRIPTION_TEMPLATES["template_note"].format(template_id=template_item_id)
        }

    def _get_fallback_json(self, content: str) -> str:
        """获取备选的简单JSON结构"""
        max_content_length = self.LENGTH_LIMITS["fallback_content"]
        fallback_structure = {
            "content": content[:max_content_length] + "..." if len(content) > max_content_length else content,
            "generated_at": datetime.now().isoformat(),
            "note": self.DESCRIPTION_TEMPLATES["fallback_note"]
        }
        return json.dumps(fallback_structure, ensure_ascii=False, indent=2)

    def _is_json_task_result(self, task_cmd: Any, result: Any) -> bool:
        """检查任务是否为JSON任务且结果是合法的JSON"""
        try:
            # 检查任务命令是否要求JSON输出
            if isinstance(task_cmd, dict):
                # 检查description中是否包含json_generation
                description = task_cmd.get("description", "")
                if isinstance(description, str):
                    try:
                        desc_json = json.loads(description)
                        if desc_json.get("task_type") == "json_generation":
                            # 检查result是否为字典类型（已解析的JSON）
                            return isinstance(result, dict)
                    except json.JSONDecodeError:
                        pass
                
                # 检查直接的output_format字段
                output_format = task_cmd.get("output_format", {})
                if output_format.get("type") == "json":
                    return isinstance(result, dict)
            
            return False
        except Exception as e:
            logger.warning(f"检查JSON任务结果时发生错误: {e}")
            return False
    
    def _process_ai_result(self, result: str) -> Any:
        """智能处理AI返回结果，避免双重序列化"""
        try:
            # 尝试解析为JSON对象
            parsed_json = json.loads(result.strip())
            # 如果解析成功，返回JSON对象而不是字符串
            return parsed_json
        except json.JSONDecodeError:
            # 如果不是有效JSON，返回原始字符串
            return result.strip()
        except Exception as e:
            # 出现其他错误时，返回原始结果
            logger.warning(f"处理AI结果时发生错误: {e}，返回原始结果")
            return result
    
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
    """在后台执行任务。每个任务在独立的线程和事件循环中执行。"""
    import threading
    import time
    
    def run_task():
        loop = None
        task_executor = None
        
        # 添加线程间隔，避免同时创建太多连接
        time.sleep(0.1 * (task_id % 10))  # 根据task_id错开启动时间
        
        try:
            # 为每个线程创建独立的事件循环
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # 为每个任务创建独立的执行器实例，避免共享状态
            task_executor = SimpleTaskExecutor()
            
            # 设置合理的超时时间，并增加重试机制
            async def execute_with_retry():
                max_retries = 2
                for attempt in range(max_retries + 1):
                    try:
                        # 增加启动延迟，避免批量任务冲突
                        if attempt > 0:
                            await asyncio.sleep(1 + attempt * 2)  # 递增延迟
                        
                        result = await asyncio.wait_for(
                            task_executor.execute_task(task_id),
                            timeout=300  # 5分钟超时
                        )
                        return result
                    except asyncio.TimeoutError:
                        if attempt < max_retries:
                            logger.warning(f"任务 {task_id} 第{attempt+1}次执行超时，将进行重试")
                            await asyncio.sleep(3)  # 等待3秒再重试
                        else:
                            logger.error(f"任务 {task_id} 所有重试均超时")
                            raise
                    except asyncio.CancelledError:
                        logger.warning(f"任务 {task_id} 被取消")
                        return False
                    except Exception as e:
                        error_msg = str(e)
                        logger.error(f"任务 {task_id} 第{attempt+1}次执行异常: {error_msg}")
                        
                        # 对于超时管理器错误，直接失败，不重试
                        if "Timeout context manager" in error_msg:
                            logger.error(f"任务 {task_id} 遇到超时管理器错误，停止重试")
                            return False
                            
                        if attempt < max_retries:
                            logger.warning(f"任务 {task_id} 将在3秒后进行第{attempt+2}次重试")
                            await asyncio.sleep(3)
                        else:
                            raise
            
            result = loop.run_until_complete(execute_with_retry())
            logger.info(f"后台任务 {task_id} 执行完成，结果: {result}")
            return result
            
        except asyncio.TimeoutError:
            logger.error(f"后台任务 {task_id} 执行超时")
            return False
        except asyncio.CancelledError:
            logger.warning(f"后台任务 {task_id} 被取消")
            return False
        except Exception as e:
            logger.error(f"后台执行任务 {task_id} 时发生错误: {str(e)}")
            return False
        finally:
            # 改进的资源清理逻辑
            cleanup_success = True
            
            # 先清理API客户端
            if task_executor and hasattr(task_executor, 'api_client') and task_executor.api_client:
                try:
                    if loop and not loop.is_closed():
                        # 设置清理超时，避免无限等待
                        cleanup_task = loop.create_task(task_executor.api_client.close())
                        loop.run_until_complete(asyncio.wait_for(cleanup_task, timeout=5))
                except Exception as cleanup_error:
                    cleanup_success = False
                    logger.warning(f"清理任务 {task_id} 的API客户端时发生错误: {str(cleanup_error)}")
                    
            # 再清理事件循环
            if loop and not loop.is_closed():
                try:
                    # 取消所有挂起的任务
                    pending = asyncio.all_tasks(loop)
                    if pending:
                        for task in pending:
                            if not task.done():
                                task.cancel()
                        # 限时等待任务取消完成
                        try:
                            loop.run_until_complete(
                                asyncio.wait_for(
                                    asyncio.gather(*pending, return_exceptions=True),
                                    timeout=3
                                )
                            )
                        except asyncio.TimeoutError:
                            logger.warning(f"任务 {task_id} 的异步任务取消超时")
                        except Exception:
                            pass  # 忽略取消过程中的其他异常
                    
                    # 关闭事件循环
                    loop.close()
                except Exception as cleanup_error:
                    cleanup_success = False
                    logger.warning(f"清理事件循环时发生错误: {str(cleanup_error)}")
            
            if not cleanup_success:
                logger.warning(f"任务 {task_id} 资源清理不完整，但不影响任务执行结果")
    
    # 为每个任务创建独立的线程
    thread = threading.Thread(target=run_task, name=f"Task-{task_id}")
    thread.daemon = True
    thread.start()
    logger.info(f"任务 {task_id} 已在后台线程中启动")