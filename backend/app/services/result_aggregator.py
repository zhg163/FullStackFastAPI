from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
import json
import re
import hashlib

from sqlmodel import Session, select, func
from app.models import TaskCreatRolePrompt, RolePrompt, Role
from app.services.batch_manager import TaskStatus


class AggregationStrategy(str, Enum):
    """聚合策略枚举"""
    TEMPLATE_BASED = "template_based"
    AI_ENHANCED = "ai_enhanced"
    SIMPLE_CONCAT = "simple_concat"


@dataclass
class AggregationResult:
    """聚合结果"""
    success: bool
    role_id: int
    role_prompt_id: Optional[int] = None
    aggregated_content: Optional[str] = None
    quality_score: float = 0.0
    task_count: int = 0
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    
    @classmethod
    def success_result(cls, role_id: int, role_prompt_id: int, content: str, quality_score: float, task_count: int):
        return cls(
            success=True,
            role_id=role_id,
            role_prompt_id=role_prompt_id,
            aggregated_content=content,
            quality_score=quality_score,
            task_count=task_count,
            created_at=datetime.now()
        )
    
    @classmethod
    def error_result(cls, role_id: int, error: str):
        return cls(
            success=False,
            role_id=role_id,
            error=error
        )


class ContentProcessor:
    """内容处理器"""
    
    @staticmethod
    def remove_duplicates(content: str) -> str:
        """移除重复内容"""
        sentences = ContentProcessor._split_sentences(content)
        unique_sentences = []
        seen_fingerprints = set()
        
        for sentence in sentences:
            fingerprint = ContentProcessor._generate_sentence_fingerprint(sentence)
            
            if fingerprint not in seen_fingerprints:
                unique_sentences.append(sentence)
                seen_fingerprints.add(fingerprint)
        
        return ' '.join(unique_sentences)
    
    @staticmethod
    def _split_sentences(content: str) -> List[str]:
        """分割句子"""
        # 简单的句子分割，可以根据需要优化
        sentences = re.split(r'[。！？.]', content)
        return [s.strip() for s in sentences if s.strip()]
    
    @staticmethod
    def _generate_sentence_fingerprint(sentence: str) -> str:
        """生成句子指纹"""
        # 标准化句子（去除标点、统一大小写等）
        normalized = re.sub(r'[^\w\s]', '', sentence.lower())
        words = normalized.split()
        
        # 生成词汇指纹
        word_set = set(words)
        return hashlib.md5(''.join(sorted(word_set)).encode()).hexdigest()
    
    @staticmethod
    def validate_quality(content: str) -> float:
        """验证内容质量"""
        quality_score = 1.0
        
        # 长度检查
        if len(content) < 100:
            quality_score -= 0.3
        elif len(content) > 2000:
            quality_score -= 0.2
        
        # 重复率检查（简单实现）
        sentences = ContentProcessor._split_sentences(content)
        if len(sentences) > 0:
            unique_sentences = set(sentences)
            repetition_rate = 1 - (len(unique_sentences) / len(sentences))
            quality_score -= repetition_rate * 0.3
        
        # 内容完整性检查
        if not ContentProcessor._has_complete_structure(content):
            quality_score -= 0.2
        
        return max(0.0, quality_score)
    
    @staticmethod
    def _has_complete_structure(content: str) -> bool:
        """检查内容结构完整性"""
        # 简单检查：至少包含50个字符且有标点符号
        return len(content) >= 50 and any(char in content for char in '。！？.,!?')


class ResultAggregator:
    """结果聚合器"""
    
    def __init__(self, db_session: Session, config_manager):
        self.db = db_session
        self.config = config_manager
        self.content_processor = ContentProcessor()
        
        # 默认聚合策略
        self.default_strategy = AggregationStrategy.TEMPLATE_BASED
    
    async def aggregate_role_results(self, role_id: int) -> AggregationResult:
        """聚合角色结果"""
        
        try:
            # 1. 检查角色完成状态
            completion_status = await self._check_role_completion(role_id)
            if not completion_status['is_complete']:
                return AggregationResult.error_result(
                    role_id, 
                    f"角色任务未完成，剩余任务: {completion_status['pending_count']}"
                )
            
            # 2. 获取所有完成的任务
            completed_tasks = await self._get_completed_tasks(role_id)
            if not completed_tasks:
                return AggregationResult.error_result(role_id, "未找到已完成的任务")
            
            # 3. 执行聚合
            aggregated_content = await self._aggregate_content(completed_tasks)
            
            # 4. 内容后处理
            processed_content = self.content_processor.remove_duplicates(aggregated_content)
            
            # 5. 质量检查
            quality_score = self.content_processor.validate_quality(processed_content)
            if quality_score < 0.5:
                return AggregationResult.error_result(
                    role_id, 
                    f"内容质量过低: {quality_score:.2f}"
                )
            
            # 6. 创建角色提示词
            role_prompt = await self._create_role_prompt(role_id, processed_content, completed_tasks, quality_score)
            
            return AggregationResult.success_result(
                role_id=role_id,
                role_prompt_id=role_prompt.id,
                content=processed_content,
                quality_score=quality_score,
                task_count=len(completed_tasks)
            )
            
        except Exception as e:
            return AggregationResult.error_result(role_id, f"聚合失败: {str(e)}")
    
    async def _check_role_completion(self, role_id: int) -> Dict[str, Any]:
        """检查角色完成状态"""
        pending_query = select(func.count(TaskCreatRolePrompt.id)).where(
            TaskCreatRolePrompt.role_id == role_id,
            TaskCreatRolePrompt.task_state.in_([
                TaskStatus.PENDING, 
                TaskStatus.QUEUED, 
                TaskStatus.RUNNING
            ])
        )
        
        result = await self.db.execute(pending_query)
        pending_count = result.scalar() or 0
        
        return {
            'is_complete': pending_count == 0,
            'pending_count': pending_count
        }
    
    async def _get_completed_tasks(self, role_id: int) -> List[TaskCreatRolePrompt]:
        """获取已完成的任务"""
        query = select(TaskCreatRolePrompt).where(
            TaskCreatRolePrompt.role_id == role_id,
            TaskCreatRolePrompt.task_state == TaskStatus.COMPLETED,
            TaskCreatRolePrompt.role_item_prompt.isnot(None)
        ).order_by(TaskCreatRolePrompt.created_at)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def _aggregate_content(self, tasks: List[TaskCreatRolePrompt]) -> str:
        """聚合内容"""
        if not tasks:
            return ""
        
        if len(tasks) == 1:
            # 只有一个任务，直接返回内容
            return tasks[0].role_item_prompt.get('generated_content', '')
        
        # 多个任务，执行聚合
        return await self._template_based_aggregation(tasks)
    
    async def _template_based_aggregation(self, tasks: List[TaskCreatRolePrompt]) -> str:
        """基于模板的聚合"""
        
        # 1. 按模板条目分类
        categorized_content = self._categorize_by_template_item(tasks)
        
        # 2. 合并每个类别的内容
        aggregated_sections = {}
        
        for category, items in categorized_content.items():
            if len(items) == 1:
                aggregated_sections[category] = items[0]['content']
            else:
                # 多个内容合并
                merged_content = await self._merge_category_content(category, items)
                aggregated_sections[category] = merged_content
        
        # 3. 构建最终内容
        final_content = self._build_final_content(aggregated_sections)
        
        return final_content
    
    def _categorize_by_template_item(self, tasks: List[TaskCreatRolePrompt]) -> Dict[str, List[Dict]]:
        """按模板条目分类"""
        categories = {}
        
        for task in tasks:
            if not task.role_item_prompt or not task.role_item_prompt.get('generated_content'):
                continue
            
            # 从任务命令中提取模板条目信息
            template_item_id = task.task_cmd.get('templateItemId') if task.task_cmd else None
            template_item_name = self._get_template_item_name(template_item_id) or "其他内容"
            
            if template_item_name not in categories:
                categories[template_item_name] = []
            
            categories[template_item_name].append({
                'task_id': task.id,
                'task_name': task.task_name,
                'content': task.role_item_prompt['generated_content'],
                'confidence': task.role_item_prompt.get('confidence', 0.0),
                'tokens_used': task.role_item_prompt.get('tokens_used', 0)
            })
        
        return categories
    
    def _get_template_item_name(self, template_item_id: Optional[int]) -> Optional[str]:
        """获取模板条目名称"""
        if not template_item_id:
            return None
        
        # 这里应该查询数据库获取模板条目名称
        # 暂时返回一个默认名称
        return f"模板条目_{template_item_id}"
    
    async def _merge_category_content(self, category: str, items: List[Dict]) -> str:
        """合并同类别内容"""
        if len(items) == 1:
            return items[0]['content']
        
        # 按置信度排序
        sorted_items = sorted(items, key=lambda x: x['confidence'], reverse=True)
        
        # 智能合并策略
        if category in ['基本资料', '角色背景', '基础信息']:
            # 对于基础信息，选择置信度最高的
            return sorted_items[0]['content']
        
        elif category in ['技能描述', '人物关系', '详细描述']:
            # 对于描述性内容，合并多个
            return await self._smart_merge_descriptions(sorted_items)
        
        else:
            # 默认策略：合并所有内容
            return await self._combine_all_content(sorted_items)
    
    async def _smart_merge_descriptions(self, items: List[Dict]) -> str:
        """智能合并描述性内容"""
        # 简单实现：将内容用段落分隔符连接
        contents = []
        
        for item in items:
            content = item['content'].strip()
            if content and content not in contents:
                contents.append(content)
        
        return '\n\n'.join(contents)
    
    async def _combine_all_content(self, items: List[Dict]) -> str:
        """合并所有内容"""
        contents = []
        
        for item in items:
            content = item['content'].strip()
            if content:
                contents.append(content)
        
        return '\n\n'.join(contents)
    
    def _build_final_content(self, sections: Dict[str, str]) -> str:
        """构建最终内容"""
        if not sections:
            return ""
        
        # 定义内容结构顺序
        section_order = [
            '基本资料', '基础信息', '角色背景', 
            '技能描述', '能力描述', '特殊技能',
            '人物关系', '关系网络', '社交关系',
            '详细描述', '其他内容'
        ]
        
        final_parts = []
        
        # 按顺序添加各个部分
        for section_name in section_order:
            if section_name in sections:
                content = sections[section_name]
                if content.strip():
                    final_parts.append(f"## {section_name}\n\n{content}")
                del sections[section_name]
        
        # 添加剩余部分
        for section_name, content in sections.items():
            if content.strip():
                final_parts.append(f"## {section_name}\n\n{content}")
        
        return '\n\n'.join(final_parts)
    
    async def _create_role_prompt(
        self, 
        role_id: int, 
        content: str, 
        source_tasks: List[TaskCreatRolePrompt],
        quality_score: float
    ) -> RolePrompt:
        """创建角色提示词"""
        
        # 1. 获取当前最新版本
        latest_version = await self._get_latest_version(role_id)
        new_version = (latest_version or 0) + 1
        
        # 2. 构建用户提示词结构
        user_prompt = {
            "version": new_version,
            "generated_at": datetime.now().isoformat(),
            "aggregation_info": {
                "strategy": self.default_strategy,
                "source_task_count": len(source_tasks),
                "source_task_ids": [task.id for task in source_tasks],
                "quality_score": quality_score
            },
            "content": {
                "formatted": content,
                "raw_sections": self._extract_sections(content),
                "metadata": {
                    "total_tokens": sum(
                        task.role_item_prompt.get('tokens_used', 0) 
                        for task in source_tasks 
                        if task.role_item_prompt
                    ),
                    "avg_confidence": sum(
                        task.role_item_prompt.get('confidence', 0.0) 
                        for task in source_tasks 
                        if task.role_item_prompt
                    ) / len(source_tasks)
                }
            }
        }
        
        # 3. 创建新记录
        role_prompt = RolePrompt(
            role_id=role_id,
            version=new_version,
            user_prompt=user_prompt,
            is_active="Y"
        )
        
        # 4. 保存并更新状态
        self.db.add(role_prompt)
        await self.db.commit()
        await self.db.refresh(role_prompt)
        
        # 5. 停用旧版本
        await self._deactivate_old_versions(role_id, new_version)
        
        return role_prompt
    
    async def _get_latest_version(self, role_id: int) -> Optional[int]:
        """获取最新版本号"""
        query = select(func.max(RolePrompt.version)).where(
            RolePrompt.role_id == role_id
        )
        
        result = await self.db.execute(query)
        return result.scalar()
    
    def _extract_sections(self, content: str) -> Dict[str, str]:
        """提取内容章节"""
        sections = {}
        current_section = None
        current_content = []
        
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('## '):
                # 保存前一个章节
                if current_section and current_content:
                    sections[current_section] = '\n'.join(current_content).strip()
                
                # 开始新章节
                current_section = line[3:].strip()
                current_content = []
            elif current_section:
                current_content.append(line)
        
        # 保存最后一个章节
        if current_section and current_content:
            sections[current_section] = '\n'.join(current_content).strip()
        
        return sections
    
    async def _deactivate_old_versions(self, role_id: int, current_version: int):
        """停用旧版本"""
        update_stmt = (
            RolePrompt.__table__.update()
            .where(
                RolePrompt.role_id == role_id,
                RolePrompt.version != current_version
            )
            .values(is_active="N")
        )
        
        await self.db.execute(update_stmt)
        await self.db.commit()
    
    async def get_aggregation_statistics(self, role_id: Optional[int] = None) -> Dict[str, Any]:
        """获取聚合统计信息"""
        try:
            # 基础查询
            base_query = select(RolePrompt)
            if role_id:
                base_query = base_query.where(RolePrompt.role_id == role_id)
            
            result = await self.db.execute(base_query)
            role_prompts = result.scalars().all()
            
            if not role_prompts:
                return {"message": "未找到聚合结果"}
            
            # 统计信息
            total_prompts = len(role_prompts)
            active_prompts = len([rp for rp in role_prompts if rp.is_active == "Y"])
            
            # 质量分析
            quality_scores = []
            for rp in role_prompts:
                if rp.user_prompt and 'aggregation_info' in rp.user_prompt:
                    score = rp.user_prompt['aggregation_info'].get('quality_score', 0.0)
                    quality_scores.append(score)
            
            avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0.0
            
            return {
                "total_prompts": total_prompts,
                "active_prompts": active_prompts,
                "avg_quality_score": avg_quality,
                "quality_distribution": {
                    "high": len([s for s in quality_scores if s >= 0.8]),
                    "medium": len([s for s in quality_scores if 0.5 <= s < 0.8]),
                    "low": len([s for s in quality_scores if s < 0.5])
                },
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {"error": str(e)}