from typing import List, Dict, Any
import asyncio
from datetime import datetime
import json

from app.models import TaskCreatRolePrompt
from .batch_manager import TaskStatus


class TaskDispatcher:
    """任务分发器 - 负责将任务分发到RQ队列"""
    
    def __init__(self, redis_client, config_manager):
        self.redis = redis_client
        self.config = config_manager
        
        # 配置队列参数
        self.queue_name = getattr(config_manager, 'RQ_QUEUE_NAME', 'ai_tasks')
        self.default_timeout = 120  # 2分钟超时
        self.default_ttl = 3600     # 1小时TTL
        self.retry_attempts = 3
    
    async def dispatch_tasks(
        self, 
        tasks: List[TaskCreatRolePrompt], 
        batch_id: str,
        max_concurrent: int = 5,
        timeout: int = None
    ) -> List[str]:
        """分发任务到RQ队列"""
        
        if not tasks:
            return []
        
        job_ids = []
        timeout = timeout or self.default_timeout
        
        try:
            # 延迟导入RQ以避免循环导入
            from rq import Queue
            queue = Queue(connection=self.redis, name=self.queue_name)
            
            # 批量提交任务
            for task in tasks:
                # 准备任务数据
                task_data = self._prepare_task_data(task, batch_id)
                
                # 提交到RQ队列
                job = queue.enqueue(
                    'app.tasks.execute_ai_task',  # 任务函数路径
                    task_data,
                    job_timeout=timeout,
                    job_id=f"task_{task.id}_{batch_id}",
                    retry=self.retry_attempts,
                    meta={
                        'batch_id': batch_id,
                        'task_id': task.id,
                        'role_id': task.role_id,
                        'created_at': task.created_at.isoformat() if task.created_at else None
                    }
                )
                
                job_ids.append(job.id)
                
                # 更新任务状态为已入队
                await self._update_task_status(task.id, TaskStatus.QUEUED, {
                    'rq_job_id': job.id,
                    'queued_at': datetime.now().isoformat()
                })
            
            return job_ids
            
        except Exception as e:
            # 分发失败，清理已创建的作业
            await self._cleanup_failed_dispatch(job_ids)
            raise RuntimeError(f"任务分发失败: {e}")
    
    def _prepare_task_data(self, task: TaskCreatRolePrompt, batch_id: str) -> Dict[str, Any]:
        """准备任务数据"""
        return {
            'task_id': task.id,
            'batch_id': batch_id,
            'role_id': task.role_id,
            'task_name': task.task_name,
            'task_cmd': task.task_cmd,
            'retry_count': 0,
            'created_at': task.created_at.isoformat() if task.created_at else None,
            'task_state': task.task_state
        }
    
    async def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """获取RQ作业状态"""
        try:
            from rq.job import Job
            job = Job.fetch(job_id, connection=self.redis)
            
            return {
                'job_id': job_id,
                'status': job.get_status(),
                'created_at': job.created_at,
                'started_at': job.started_at,
                'ended_at': job.ended_at,
                'result': job.result,
                'exc_info': job.exc_info,
                'meta': job.meta
            }
        except Exception as e:
            return {
                'job_id': job_id,
                'status': 'not_found',
                'error': str(e)
            }
    
    async def cancel_job(self, job_id: str) -> bool:
        """取消RQ作业"""
        try:
            from rq.job import Job
            job = Job.fetch(job_id, connection=self.redis)
            job.cancel()
            return True
        except Exception:
            return False
    
    async def _update_task_status(self, task_id: int, status: TaskStatus, metadata: Dict = None):
        """更新任务状态"""
        # 这里应该调用数据库更新逻辑
        # 暂时使用Redis存储状态变化
        status_data = {
            'task_id': task_id,
            'status': status,
            'updated_at': datetime.now().isoformat(),
            'metadata': metadata or {}
        }
        
        await self.redis.setex(
            f"task_status:{task_id}",
            3600,  # 1小时过期
            json.dumps(status_data, ensure_ascii=False)
        )
    
    async def _cleanup_failed_dispatch(self, job_ids: List[str]):
        """清理失败分发的作业"""
        try:
            from rq import Queue
            queue = Queue(connection=self.redis, name=self.queue_name)
            
            for job_id in job_ids:
                try:
                    job = queue.get_job(job_id)
                    if job:
                        job.cancel()
                except Exception:
                    pass  # 忽略清理失败
        except Exception:
            pass  # 忽略清理失败
    
    async def get_queue_info(self) -> Dict[str, Any]:
        """获取队列信息"""
        try:
            from rq import Queue, Worker
            queue = Queue(connection=self.redis, name=self.queue_name)
            workers = Worker.all(connection=self.redis)
            
            return {
                'queue_name': self.queue_name,
                'queued_jobs': len(queue),
                'failed_jobs': len(queue.failed_job_registry),
                'total_workers': len(workers),
                'active_workers': len([w for w in workers if w.state == 'busy']),
                'idle_workers': len([w for w in workers if w.state == 'idle'])
            }
        except Exception as e:
            return {
                'error': str(e)
            }
    
    async def clear_failed_jobs(self) -> int:
        """清理失败的作业"""
        try:
            from rq import Queue
            queue = Queue(connection=self.redis, name=self.queue_name)
            
            failed_count = len(queue.failed_job_registry)
            queue.failed_job_registry.clear()
            
            return failed_count
        except Exception:
            return 0