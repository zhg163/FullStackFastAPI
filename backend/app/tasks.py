import asyncio
import json
import time
from datetime import datetime
from typing import Dict, Any

from sqlmodel import Session, select
from app.core.config import settings
from app.core.db import engine
from app.models import TaskCreatRolePrompt
from app.services.external_api_client import ExternalApiClient
from app.services.batch_manager import TaskStatus


async def execute_ai_task(task_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    RQ执行的AI任务函数
    
    Args:
        task_data: 任务数据，包含task_id, batch_id, task_cmd等
    
    Returns:
        执行结果字典
    """
    
    task_id = task_data['task_id']
    batch_id = task_data['batch_id']
    start_time = time.time()
    
    try:
        # 1. 更新任务状态为执行中
        async with get_db_session() as db:
            await _update_task_status(
                db, task_id, TaskStatus.RUNNING, 
                {'started_at': datetime.now().isoformat()}
            )
        
        # 2. 初始化API客户端
        api_client = ExternalApiClient(settings)
        
        # 3. 执行AI API调用
        api_response = await api_client.call_generate_api(
            task_id=task_id,
            command=task_data['task_cmd']
        )
        
        # 4. 处理执行结果
        if api_response.success:
            # 成功结果
            result_data = {
                'success': True,
                'generated_content': api_response.data.get('generated_content'),
                'confidence': api_response.data.get('confidence', 0.0),
                'tokens_used': api_response.data.get('tokens_used', 0),
                'api_version': api_response.data.get('api_version'),
                'execution_duration': time.time() - start_time,
                'completed_at': datetime.now().isoformat()
            }
            
            # 构建角色条目提示词
            role_item_prompt = {
                'generated_content': result_data['generated_content'],
                'confidence': result_data['confidence'],
                'tokens_used': result_data['tokens_used'],
                'generated_at': result_data['completed_at'],
                'api_version': result_data['api_version'],
                'execution_metadata': {
                    'task_id': task_id,
                    'batch_id': batch_id,
                    'duration': result_data['execution_duration']
                }
            }
            
            # 更新任务状态为完成
            async with get_db_session() as db:
                await _update_task_result(
                    db, task_id, TaskStatus.COMPLETED,
                    role_item_prompt, result_data
                )
            
            # 通知批次管理器
            await _notify_batch_manager(batch_id, task_id, 'completed')
            
            return result_data
            
        else:
            # API调用失败
            error_data = {
                'success': False,
                'error': api_response.error,
                'error_code': api_response.error_code,
                'execution_duration': time.time() - start_time,
                'failed_at': datetime.now().isoformat()
            }
            
            # 更新任务状态为失败
            async with get_db_session() as db:
                await _update_task_status(
                    db, task_id, TaskStatus.FAILED, error_data
                )
            
            # 通知批次管理器
            await _notify_batch_manager(batch_id, task_id, 'failed')
            
            return error_data
            
    except Exception as e:
        # 执行异常
        error_data = {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__,
            'execution_duration': time.time() - start_time,
            'failed_at': datetime.now().isoformat()
        }
        
        # 更新任务状态为失败
        try:
            async with get_db_session() as db:
                await _update_task_status(
                    db, task_id, TaskStatus.FAILED, error_data
                )
            
            await _notify_batch_manager(batch_id, task_id, 'failed')
        except Exception as update_error:
            print(f"更新任务状态失败: {update_error}")
        
        return error_data


async def get_db_session():
    """获取数据库会话"""
    from sqlmodel import Session
    
    class AsyncSessionWrapper:
        def __init__(self):
            self.session = None
        
        async def __aenter__(self):
            self.session = Session(engine)
            return self.session
        
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            if self.session:
                if exc_type is None:
                    await asyncio.get_event_loop().run_in_executor(
                        None, self.session.commit
                    )
                else:
                    await asyncio.get_event_loop().run_in_executor(
                        None, self.session.rollback
                    )
                await asyncio.get_event_loop().run_in_executor(
                    None, self.session.close
                )
    
    return AsyncSessionWrapper()


async def _update_task_status(
    db: Session, task_id: int, status: TaskStatus, metadata: Dict[str, Any]
):
    """更新任务状态"""
    
    # 获取任务
    query = select(TaskCreatRolePrompt).where(TaskCreatRolePrompt.id == task_id)
    
    def _execute_query():
        result = db.execute(query)
        return result.scalar_one_or_none()
    
    task = await asyncio.get_event_loop().run_in_executor(None, _execute_query)
    
    if task:
        task.task_state = status
        task.updated_at = datetime.now()
        
        # 更新元数据
        if hasattr(task, 'execution_metadata'):
            current_meta = task.execution_metadata or {}
            current_meta.update(metadata)
            task.execution_metadata = current_meta


async def _update_task_result(
    db: Session, task_id: int, status: TaskStatus, 
    role_item_prompt: Dict, execution_metadata: Dict
):
    """更新任务结果"""
    
    query = select(TaskCreatRolePrompt).where(TaskCreatRolePrompt.id == task_id)
    
    def _execute_query():
        result = db.execute(query)
        return result.scalar_one_or_none()
    
    task = await asyncio.get_event_loop().run_in_executor(None, _execute_query)
    
    if task:
        task.task_state = status
        task.role_item_prompt = role_item_prompt
        task.updated_at = datetime.now()
        
        # 更新执行元数据
        if hasattr(task, 'execution_metadata'):
            task.execution_metadata = execution_metadata


async def _notify_batch_manager(batch_id: str, task_id: int, event: str):
    """通知批次管理器任务状态变化"""
    try:
        # 这里可以通过Redis发布消息，或者直接调用批次管理器
        import redis.asyncio as redis
        r = redis.from_url(settings.REDIS_URL)
        
        message = {
            'batch_id': batch_id,
            'task_id': task_id,
            'event': event,
            'timestamp': datetime.now().isoformat()
        }
        
        await r.publish(f'batch_events:{batch_id}', json.dumps(message))
        await r.close()
        
    except Exception as e:
        print(f"通知批次管理器失败: {e}")


# RQ包装函数 (同步版本)
def execute_ai_task_sync(task_data: Dict[str, Any]) -> Dict[str, Any]:
    """RQ执行的同步包装函数"""
    return asyncio.run(execute_ai_task(task_data))


# 其他辅助任务函数

async def cleanup_expired_batches() -> int:
    """清理过期的批次数据"""
    try:
        import redis.asyncio as redis
        r = redis.from_url(settings.REDIS_URL)
        
        # 获取所有批次键
        batch_keys = await r.keys("batch:*")
        cleaned_count = 0
        
        for key in batch_keys:
            # 检查批次数据
            batch_data_str = await r.get(key)
            if batch_data_str:
                try:
                    batch_data = json.loads(batch_data_str)
                    created_at = datetime.fromisoformat(batch_data['created_at'])
                    
                    # 删除7天前的批次数据
                    if (datetime.now() - created_at).days > 7:
                        await r.delete(key)
                        cleaned_count += 1
                except Exception:
                    # 删除无效数据
                    await r.delete(key)
                    cleaned_count += 1
        
        await r.close()
        return cleaned_count
        
    except Exception as e:
        print(f"清理过期批次失败: {e}")
        return 0


def cleanup_expired_batches_sync() -> int:
    """同步版本的清理过期批次"""
    return asyncio.run(cleanup_expired_batches())


async def get_task_execution_statistics() -> Dict[str, Any]:
    """获取任务执行统计"""
    try:
        async with get_db_session() as db:
            # 统计不同状态的任务数量
            def _get_stats():
                from sqlmodel import func
                
                result = db.execute(
                    select(
                        TaskCreatRolePrompt.task_state,
                        func.count(TaskCreatRolePrompt.id).label('count')
                    ).group_by(TaskCreatRolePrompt.task_state)
                )
                return result.all()
            
            stats = await asyncio.get_event_loop().run_in_executor(None, _get_stats)
            
            stats_dict = {}
            total_tasks = 0
            
            for stat in stats:
                status, count = stat
                stats_dict[status] = count
                total_tasks += count
            
            # 计算成功率
            completed = stats_dict.get('C', 0)
            failed = stats_dict.get('F', 0)
            success_rate = (completed / (completed + failed)) * 100 if (completed + failed) > 0 else 0
            
            return {
                'total_tasks': total_tasks,
                'pending': stats_dict.get('P', 0),
                'queued': stats_dict.get('Q', 0),
                'running': stats_dict.get('R', 0),
                'completed': stats_dict.get('C', 0),
                'failed': stats_dict.get('F', 0),
                'cancelled': stats_dict.get('X', 0),
                'success_rate': success_rate,
                'timestamp': datetime.now().isoformat()
            }
            
    except Exception as e:
        return {
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }


def get_task_execution_statistics_sync() -> Dict[str, Any]:
    """同步版本的获取任务执行统计"""
    return asyncio.run(get_task_execution_statistics())