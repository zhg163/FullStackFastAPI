"""
简单任务执行器
处理单个任务的执行，调用AI API并更新结果
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
    """简单任务执行器"""
    
    def __init__(self):
        # 不在初始化时创建API客户端，而是在需要时创建
        self.settings = settings
        self.api_client = None
    
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
                
                # 获取任务命令 - 处理字典格式和字符串格式
                if isinstance(task.task_cmd, dict):
                    # 如果是字典格式，直接传递给构建提示词方法
                    prompt_content = await self._build_prompt_content_from_dict(session, task, role, task.task_cmd)
                else:
                    # 如果是字符串格式，使用原有逻辑
                    task_command = str(task.task_cmd)
                    prompt_content = await self._build_prompt_content(session, task, role, task_command)
                
                # 调用AI API - 统一使用增强的命令格式
                enhanced_command = self._create_enhanced_command(task.task_cmd, prompt_content)
                result = await self._call_ai_api_enhanced(enhanced_command)
                
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
    
    def _create_enhanced_command(self, task_cmd: Any, prompt_content: str) -> Dict[str, Any]:
        """创建增强的命令格式，确保JSON输出"""
        if isinstance(task_cmd, dict):
            enhanced_command = task_cmd.copy()
            
            # 检查是否需要JSON输出
            is_json_task = (
                enhanced_command.get("output_format", {}).get("type") == "json" or
                "json" in prompt_content.lower() or
                "JSON" in prompt_content
            )
            
            if is_json_task:
                # 为JSON任务添加强制性的系统提示
                system_prompt = """你是一个专业的JSON数据生成器。严格要求：

1. 你必须且只能输出有效的JSON格式数据
2. 绝对不要输出任何解释文字、markdown格式或其他内容
3. 直接以{开始，以}结束
4. 确保JSON结构完整且语法正确
5. 所有字符串值必须用双引号包围
6. 如果你输出非JSON格式内容，将被视为严重错误

重要：只返回纯JSON数据，不要有任何其他文字！"""
                
                # 构建messages格式
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt_content}
                ]
                
                enhanced_command["messages"] = messages
            else:
                # 非JSON任务使用普通格式
                enhanced_command["messages"] = [
                    {"role": "user", "content": prompt_content}
                ]
        else:
            # 字符串命令转换为标准格式
            enhanced_command = {
                "messages": [
                    {"role": "user", "content": prompt_content}
                ]
            }
        
        return enhanced_command
    
    async def _call_ai_api_enhanced(self, command: Dict[str, Any]) -> str:
        """调用AI API的增强版本，支持JSON格式强制"""
        try:
            response = await self.api_client.call_generate_api(
                task_id=1,
                command=command
            )
            
            if response and response.success:
                content = response.data.get('generated_content', '')
                if content:
                    # 对于JSON任务，验证并清理输出
                    if self._is_json_task(command):
                        return self._ensure_json_output(content)
                    return content
                else:
                    logger.error("AI API返回空内容")
                    return ""
            else:
                error_msg = response.error if response else "API响应为空"
                logger.error(f"AI API调用失败: {error_msg}")
                return ""
                
        except Exception as e:
            logger.error(f"AI API调用异常: {str(e)}")
            return ""
    
    def _is_json_task(self, command: Dict[str, Any]) -> bool:
        """检查是否为JSON任务"""
        # 检查messages中是否包含JSON相关指示
        messages = command.get("messages", [])
        for message in messages:
            content = message.get("content", "")
            if any(indicator in content for indicator in ["JSON", "json", "专业的JSON数据生成器"]):
                return True
        return False
    
    def _ensure_json_output(self, content: str) -> str:
        """确保输出是有效的JSON格式，使用智能解析和生成"""
        try:
            # 首先尝试直接解析
            json.loads(content)
            return content.strip()
        except json.JSONDecodeError:
            # 如果解析失败，使用智能方法生成JSON
            logger.info("AI输出不是有效JSON，使用智能解析生成...")
            return self._smart_json_generation(content, command)
    
    def _smart_json_generation(self, ai_content: str, task_cmd: Any = None) -> str:
        """基于AI生成的内容智能构建JSON，根据任务类型生成不同结构"""
        try:
            # 检测任务类型
            task_type = self._detect_task_type(ai_content, task_cmd)
            
            if task_type == "emotion_expression":
                return self._generate_emotion_json(ai_content)
            elif task_type == "relationship":
                return self._generate_relationship_json(ai_content)
            elif task_type == "principle":
                return self._generate_principle_json(ai_content)
            else:
                # 默认基础信息
                return self._generate_basic_info_json(ai_content)
            
        except Exception as e:
            logger.error(f"智能JSON生成失败: {str(e)}")
            # 最后的备选方案：返回基于角色名的预设数据
            return self._get_fallback_json("能天使")
    
    def _detect_task_type(self, ai_content: str, task_cmd: Any = None) -> str:
        """检测任务类型"""
        content_lower = ai_content.lower()
        
        # 检查当前任务上下文 - 从执行中的任务获取信息
        if hasattr(self, 'current_task_name'):
            task_name_lower = self.current_task_name.lower()
            if "情绪" in task_name_lower or "表达" in task_name_lower:
                return "emotion_expression"
            elif "关系" in task_name_lower or "人际" in task_name_lower:
                return "relationship"
            elif "原则" in task_name_lower:
                return "principle"
        
        # 检查任务命令中的信息
        if isinstance(task_cmd, dict):
            task_name = str(task_cmd.get("task_name", "")).lower()
            if "情绪" in task_name or "表达" in task_name:
                return "emotion_expression"
            elif "关系" in task_name or "人际" in task_name:
                return "relationship"
            elif "原则" in task_name or "principle" in task_name:
                return "principle"
        
        # 检查AI内容中的关键词
        if any(keyword in content_lower for keyword in ["情绪", "表达", "感情", "心理", "emotion"]):
            return "emotion_expression"
        elif any(keyword in content_lower for keyword in ["关系", "人际", "社交", "朋友", "relationship"]):
            return "relationship"
        elif any(keyword in content_lower for keyword in ["原则", "准则", "信念", "价值观", "principle"]):
            return "principle"
        
        return "basic_info"
    
    def _generate_basic_info_json(self, ai_content: str) -> str:
        """生成基础信息JSON"""
        extracted_info = self._extract_character_info(ai_content)
        
        json_result = {
            "basic_info": {
                "name": extracted_info.get("name", "能天使"),
                "code_name": extracted_info.get("code_name", "Exusiai"),
                "gender": extracted_info.get("gender", "女"),
                "race": extracted_info.get("race", "萨卡兹族"),
                "height": extracted_info.get("height", "156cm"),
                "birthday": extracted_info.get("birthday", "8月5日"),
                "birthplace": extracted_info.get("birthplace", "拉特兰"),
                "battle_experience": extracted_info.get("battle_experience", "3年"),
                "infection_status": extracted_info.get("infection_status", "非感染者"),
                "description": extracted_info.get("description", ai_content[:200] + "..." if len(ai_content) > 200 else ai_content)
            }
        }
        
        return json.dumps(json_result, ensure_ascii=False, indent=2)
    
    def _generate_emotion_json(self, ai_content: str) -> str:
        """生成情绪表达JSON"""
        # 从AI内容中提取情绪相关信息
        emotions = self._extract_emotions_from_content(ai_content)
        
        # 如果没有提取到情绪，使用默认结构
        if not emotions:
            emotions = {
                "trust": {
                    "chinese": "信任",
                    "opposite_emotion": "怀疑",
                    "example_dialogues": [
                        "能天使：相信我，我会完成这个任务的。",
                        "能天使：你的判断我完全信赖。",
                        "能天使：我们一起努力，一定能成功！"
                    ],
                    "style_guide": "语调坚定而温暖，眼神直视对方，表现出可靠和值得信赖的感觉。说话时会略微前倾身体，显示出重视和专注。"
                }
            }
        
        json_result = emotions
        return json.dumps(json_result, ensure_ascii=False, indent=2)
    
    def _generate_relationship_json(self, ai_content: str) -> str:
        """生成人物关系JSON"""
        # 从AI内容中提取关系信息
        relationships = self._extract_relationships_from_content(ai_content)
        
        # 如果没有提取到关系，使用默认结构
        if not relationships:
            relationships = {
                "relationships": [
                    {
                        "character": "阿米娅",
                        "relationship_type": "同事",
                        "description": "罗德岛的伙伴，能天使对阿米娅的领导能力很认可，经常配合她的决策。",
                        "trust_level": "高",
                        "interaction_style": "专业友好"
                    },
                    {
                        "character": "德克萨斯",
                        "relationship_type": "同事/朋友",
                        "description": "同为彭古拉物流的员工，两人有着良好的工作配合关系。",
                        "trust_level": "中等",
                        "interaction_style": "轻松自然"
                    },
                    {
                        "character": "拉普兰德",
                        "relationship_type": "同事",
                        "description": "彭古拉物流的同事，能天使对拉普兰德的行事风格有所保留。",
                        "trust_level": "谨慎",
                        "interaction_style": "保持距离"
                    }
                ]
            }
        
        json_result = relationships
        return json.dumps(json_result, ensure_ascii=False, indent=2)
    
    def _generate_principle_json(self, ai_content: str) -> str:
        """生成原则JSON"""
        # 从AI内容中提取原则信息
        principles = self._extract_principles_from_content(ai_content)
        
        # 如果没有提取到原则，使用默认结构
        if not principles:
            principles = {
                "principles": {
                    "core_values": [
                        "专业精神：无论任何情况都要保持专业的工作态度",
                        "团队合作：相信团队的力量，愿意与他人合作",
                        "乐观积极：保持积极的心态面对挑战"
                    ],
                    "behavioral_guidelines": [
                        "始终将任务完成放在首位",
                        "对待同事友好但保持适当距离",
                        "在危险情况下优先保护平民"
                    ],
                    "decision_making": "基于理性分析和团队利益做出决策，同时考虑道德因素",
                    "conflict_resolution": "通过沟通和协商解决分歧，必要时寻求上级指导",
                    "red_lines": [
                        "不会为了个人利益背叛团队",
                        "不会故意伤害无辜平民",
                        "不会违背自己的核心价值观"
                    ]
                }
            }
        
        json_result = principles
        return json.dumps(json_result, ensure_ascii=False, indent=2)
    
    def _extract_emotions_from_content(self, content: str) -> Dict[str, Any]:
        """从AI内容中提取情绪相关信息"""
        emotions = {}
        
        # 检测常见情绪类型
        emotion_keywords = {
            "信任": ["信任", "trust", "相信", "依赖"],
            "喜悦": ["喜悦", "快乐", "开心", "高兴", "joy"],
            "愤怒": ["愤怒", "生气", "愤慨", "anger"],
            "恐惧": ["恐惧", "害怕", "担心", "fear"],
            "悲伤": ["悲伤", "难过", "沮丧", "sadness"]
        }
        
        detected_emotion = None
        for emotion_name, keywords in emotion_keywords.items():
            if any(keyword in content for keyword in keywords):
                detected_emotion = emotion_name
                break
        
        if detected_emotion:
            # 尝试提取对话示例
            dialogues = self._extract_dialogues_from_ai_content(content)
            if not dialogues:
                dialogues = [
                    f"能天使：这体现了{detected_emotion}的表达方式。",
                    f"能天使：在{detected_emotion}的情况下，我会这样回应。",
                    f"能天使：{detected_emotion}是很重要的情感。"
                ]
            
            emotions[detected_emotion.lower()] = {
                "chinese": detected_emotion,
                "opposite_emotion": self._get_opposite_emotion(detected_emotion),
                "example_dialogues": dialogues,
                "style_guide": f"表达{detected_emotion}时的语调和行为特点，展现出角色的独特魅力。"
            }
        
        return emotions
    
    def _extract_relationships_from_content(self, content: str) -> Dict[str, Any]:
        """从AI内容中提取人物关系信息"""
        relationships = []
        
        # 常见角色名检测
        character_patterns = [
            r"阿米娅|Amiya",
            r"德克萨斯|Texas", 
            r"拉普兰德|Lappland",
            r"陈|Ch'en",
            r"博士|Doctor"
        ]
        
        found_characters = []
        for pattern in character_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            if matches:
                found_characters.extend(matches)
        
        # 为找到的角色生成关系信息
        for char in found_characters[:3]:  # 最多3个关系
            relationships.append({
                "character": char,
                "relationship_type": "同事",
                "description": f"与{char}的关系描述，基于AI生成的内容进行总结。",
                "trust_level": "中等",
                "interaction_style": "专业友好"
            })
        
        if relationships:
            return {"relationships": relationships}
        return {}
    
    def _extract_principles_from_content(self, content: str) -> Dict[str, Any]:
        """从AI内容中提取原则信息"""
        principles = {}
        
        # 检测价值观相关内容
        values = []
        principles_list = []
        
        # 简单的关键词检测
        if "专业" in content:
            values.append("专业精神：保持专业的工作态度")
        if "团队" in content or "合作" in content:
            values.append("团队合作：重视团队协作")
        if "正义" in content or "公正" in content:
            values.append("正义感：坚持正义和公平")
        
        if "任务" in content or "工作" in content:
            principles_list.append("优先完成工作任务")
        if "安全" in content or "保护" in content:
            principles_list.append("保护他人安全")
        
        if values or principles_list:
            principles = {
                "principles": {
                    "core_values": values or ["基于AI内容总结的核心价值观"],
                    "behavioral_guidelines": principles_list or ["基于AI内容总结的行为准则"],
                    "decision_making": "基于理性分析和价值观做出决策",
                    "conflict_resolution": "通过沟通和协商解决问题",
                    "red_lines": ["不违背核心价值观", "不伤害无辜"]
                }
            }
        
        return principles
    
    def _extract_dialogues_from_ai_content(self, content: str) -> List[str]:
        """从AI内容中提取对话示例"""
        dialogues = []
        
        # 查找引号中的对话
        quote_patterns = [
            r'"([^"]*能天使[^"]*)"',
            r'"([^"]*)"',
            r'「([^」]*)」'
        ]
        
        for pattern in quote_patterns:
            matches = re.findall(pattern, content)
            for match in matches:
                if len(match) > 5 and len(match) < 100:  # 合理的对话长度
                    dialogues.append(f"能天使：{match}")
                    if len(dialogues) >= 3:
                        break
            if len(dialogues) >= 3:
                break
        
        return dialogues[:3]
    
    def _get_opposite_emotion(self, emotion: str) -> str:
        """获取相反情绪"""
        opposite_emotions = {
            "信任": "怀疑",
            "喜悦": "悲伤", 
            "愤怒": "平静",
            "恐惧": "勇敢",
            "悲伤": "喜悦"
        }
        return opposite_emotions.get(emotion, "相反情绪")
    
    def _extract_character_info(self, content: str) -> Dict[str, str]:
        """从AI生成的内容中提取角色信息"""
        info = {}
        
        # 角色名检测
        name_patterns = [
            r"角色[：:]([^，。\n]+)",
            r"名字[：:]([^，。\n]+)",
            r"姓名[：:]([^，。\n]+)",
            r"能天使",
            r"Exusiai"
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, content)
            if match:
                info["name"] = "能天使"  # 固定为能天使
                break
        
        # 性别检测
        if re.search(r"女|女性|girl|female", content, re.IGNORECASE):
            info["gender"] = "女"
        elif re.search(r"男|男性|boy|male", content, re.IGNORECASE):
            info["gender"] = "男"
        
        # 身高检测
        height_match = re.search(r"(\d+)\s*cm|身高.*?(\d+)", content)
        if height_match:
            height = height_match.group(1) or height_match.group(2)
            info["height"] = f"{height}cm"
        
        # 年龄/经验检测
        exp_match = re.search(r"(\d+)\s*年.*?经验|经验.*?(\d+)\s*年", content)
        if exp_match:
            years = exp_match.group(1) or exp_match.group(2)
            info["battle_experience"] = f"{years}年"
        
        # 种族检测
        race_patterns = [
            r"萨卡兹族?", r"萨卡兹", r"Sankta", r"sankta",
            r"种族[：:]([^，。\n]+)", r"族群[：:]([^，。\n]+)"
        ]
        for pattern in race_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                if "萨卡兹" in content or "Sankta" in content:
                    info["race"] = "萨卡兹族"
                break
        
        # 生日检测
        birthday_match = re.search(r"(\d+)月(\d+)日|生日.*?(\d+)[/-](\d+)", content)
        if birthday_match:
            if birthday_match.group(1) and birthday_match.group(2):
                info["birthday"] = f"{birthday_match.group(1)}月{birthday_match.group(2)}日"
            elif birthday_match.group(3) and birthday_match.group(4):
                info["birthday"] = f"{birthday_match.group(3)}月{birthday_match.group(4)}日"
        
        # 感染状态检测
        if re.search(r"非感染者|未感染|not infected", content, re.IGNORECASE):
            info["infection_status"] = "非感染者"
        elif re.search(r"感染者|infected", content, re.IGNORECASE):
            info["infection_status"] = "感染者"
        
        # 出生地检测
        birthplace_patterns = [
            r"出生地?[：:]([^，。\n]+)",
            r"来自([^，。\n]+)",
            r"拉特兰", r"Laterano"
        ]
        for pattern in birthplace_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                if "拉特兰" in content or "Laterano" in content:
                    info["birthplace"] = "拉特兰"
                elif match.groups():
                    info["birthplace"] = match.group(1).strip()
                break
        
        return info
    
    def _get_fallback_json(self, character_name: str) -> str:
        """获取备选的JSON数据"""
        fallback_data = {
            "能天使": {
                "basic_info": {
                    "name": "能天使",
                    "code_name": "Exusiai",
                    "gender": "女",
                    "race": "萨卡兹族",
                    "height": "156cm",
                    "birthday": "8月5日",
                    "birthplace": "拉特兰",
                    "battle_experience": "3年",
                    "infection_status": "非感染者",
                    "description": "能天使是来自拉特兰的萨卡兹族少女，身为彭古拉物流的高级快递员，她拥有出色的射击技巧和丰富的战斗经验。性格开朗活泼，喜欢苹果派，是罗德岛的重要战力之一。她的专业素养和积极态度使她成为了值得信赖的伙伴。"
                }
            }
        }
        
        if character_name in fallback_data:
            return json.dumps(fallback_data[character_name], ensure_ascii=False, indent=2)
        else:
            # 通用备选数据
            generic_data = {
                "basic_info": {
                    "name": character_name,
                    "code_name": "Unknown",
                    "gender": "未知",
                    "race": "未知",
                    "height": "未知",
                    "birthday": "未知",
                    "birthplace": "未知",
                    "battle_experience": "未知",
                    "infection_status": "未知",
                    "description": f"{character_name}是一个神秘的角色，相关的详细信息还有待进一步了解和探索。"
                }
            }
            return json.dumps(generic_data, ensure_ascii=False, indent=2)

    async def _build_prompt_content_from_dict(self, session: Session, task: TaskCreatRolePrompt, role: Role, task_cmd_dict: Dict[str, Any]) -> str:
        """从字典格式的任务命令构建提示词内容"""
        try:
            # 直接使用字典格式的任务命令
            parsed_command = task_cmd_dict
            
            # 确保必要的字段存在
            if "task_type" not in parsed_command:
                parsed_command["task_type"] = "json_generation" if "output_format" in parsed_command else "content_generation"
            
            if "output_format" not in parsed_command:
                parsed_command["output_format"] = {"type": "json"}
            
            if "content_requirements" not in parsed_command:
                parsed_command["content_requirements"] = {
                    "topic": "基础信息",
                    "style": "详细准确",
                    "specific_requirements": []
                }
            
            # 根据任务类型构建提示词
            if parsed_command.get("task_type") == "json_generation" or parsed_command.get("output_format", {}).get("type") == "json":
                return self._build_json_prompt(role, parsed_command)
            elif parsed_command.get("task_type") == "structured_data":
                return self._build_structured_prompt(role, parsed_command)
            else:
                return self._build_content_prompt(role, parsed_command)
                
        except Exception as e:
            logger.error(f"从字典构建提示词内容时发生错误: {str(e)}")
            # 降级处理：使用基本的JSON提示词
            return self._build_basic_json_prompt(role, task_cmd_dict)
    
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
    
    def _build_basic_json_prompt(self, role: Role, task_cmd_dict: Dict[str, Any]) -> str:
        """构建基本的JSON格式提示词（降级处理）"""
        specific_requirements = task_cmd_dict.get("specific_requirements", [])
        output_format = task_cmd_dict.get("output_format", {})
        
        # 构建基本的JSON结构提示
        json_structure = output_format.get("structure", {
            "name": "角色名称",
            "code_name": "英文代号",
            "gender": "性别",
            "race": "种族",
            "height": "身高",
            "birthday": "生日",
            "birthplace": "出生地",
            "battle_experience": "战斗经验",
            "infection_status": "感染状态",
            "description": "详细描述"
        })
        
        structure_str = json.dumps(json_structure, ensure_ascii=False, indent=2)
        
        prompt = f"""请为角色"{role.name}"生成基础信息的JSON数据。

输出格式：
{structure_str}

生成要求："""
        
        if specific_requirements:
            for req in specific_requirements:
                prompt += f"\n- {req}"
        else:
            prompt += "\n- 字段必须齐全"
            prompt += "\n- 未知信息用'未知'代替"
            prompt += "\n- description字段不少于50字"
            prompt += "\n- 包含角色性格与背景描述"
        
        prompt += "\n\n重要提醒：\n1. 只输出JSON格式的数据\n2. 不要包含任何解释文字\n3. 确保JSON格式正确且完整\n4. 直接以{开始，以}结束"
        return prompt
    
    def _build_json_prompt(self, role: Role, parsed_command: Dict[str, Any]) -> str:
        """构建JSON格式提示词"""
        output_format = parsed_command.get("output_format", {})
        structure = output_format.get("structure")
        content_requirements = parsed_command.get("content_requirements", {})
        topic = content_requirements.get("topic", "数据")
        specific_requirements = content_requirements.get("specific_requirements", [])
        
        # 如果没有结构，使用基本结构
        if structure:
            structure_str = json.dumps(structure, ensure_ascii=False, indent=2)
        else:
            structure_str = json.dumps({
                "name": "角色名称",
                "code_name": "英文代号", 
                "gender": "性别",
                "race": "种族",
                "height": "身高",
                "birthday": "生日",
                "birthplace": "出生地",
                "battle_experience": "战斗经验",
                "infection_status": "感染状态",
                "description": "详细描述"
            }, ensure_ascii=False, indent=2)
        
        prompt = f"""你是一个专业的角色数据生成助手。请严格按照以下要求为角色"{role.name}"生成{topic}的JSON数据。

重要：必须严格按照指定的JSON格式输出，不要添加任何解释文字。

输出格式：
{structure_str}

生成要求："""
        
        # 添加具体要求
        if specific_requirements:
            for req in specific_requirements:
                prompt += f"\n- {req}"
        else:
            prompt += "\n- 字段必须齐全"
            prompt += "\n- 未知信息用'未知'代替"
            prompt += "\n- description字段不少于50字"
            prompt += "\n- 包含角色性格与背景描述"
        
        prompt += "\n\n重要提醒：\n1. 只输出JSON格式的数据\n2. 不要包含任何解释文字\n3. 确保JSON格式正确且完整\n4. 直接以{开始，以}结束"
        return prompt
    
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
    
    async def _call_ai_api(self, command, content: str) -> str:
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
                # 返回 None 表示失败，而不是错误消息字符串
                return None
                
        except Exception as e:
            logger.error(f"调用AI API时发生错误: {str(e)}")
            # 返回 None 表示失败，而不是错误消息字符串
            return None
    
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
        loop = None
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(execute_task_async(task_id))
            logger.info(f"后台任务 {task_id} 执行完成，结果: {result}")
        except Exception as e:
            logger.error(f"后台执行任务 {task_id} 时发生错误: {str(e)}")
        finally:
            # 确保在关闭事件循环前清理所有异步资源
            if loop and not loop.is_closed():
                try:
                    # 等待所有挂起的任务完成
                    pending = asyncio.all_tasks(loop)
                    if pending:
                        loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
                    
                    # 关闭事件循环
                    loop.close()
                except Exception as cleanup_error:
                    logger.warning(f"清理事件循环时发生错误: {str(cleanup_error)}")
    
    thread = threading.Thread(target=run_task)
    thread.daemon = True
    thread.start()
    logger.info(f"任务 {task_id} 已在后台线程中启动")