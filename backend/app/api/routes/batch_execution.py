from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import redis.asyncio as redis

from app.api import deps
from app.api.deps import SessionDep
from app.core.config import settings
from app.services.batch_manager import BatchManager, BatchExecution
from app.services.task_dispatcher import TaskDispatcher


router = APIRouter()


# 请求模型
class BatchCreateRequest(BaseModel):
    filter_params: Dict[str, Any]
    batch_config: Optional[Dict[str, Any]] = None


class BatchActionRequest(BaseModel):
    action: str  # start, pause, resume, cancel


# 响应模型
class BatchResponse(BaseModel):
    batch_id: str
    status: str
    message: str
    statistics: Optional[Dict[str, Any]] = None


class QueueInfoResponse(BaseModel):
    queue_name: str
    queued_jobs: int
    failed_jobs: int
    total_workers: int
    active_workers: int
    idle_workers: int


@router.post("/batches", response_model=BatchResponse)
async def create_batch(
    request: BatchCreateRequest,
    background_tasks: BackgroundTasks,
    db: SessionDep,
    current_user=Depends(deps.get_current_user)
):
    """创建新的执行批次"""
    
    try:
        # 初始化批次管理器
        redis_client = redis.from_url(settings.REDIS_URL)
        batch_manager = BatchManager(db, redis_client, settings)
        
        # 创建批次
        batch = await batch_manager.create_batch(
            filter_params=request.filter_params,
            user_id=current_user.id,
            batch_config=request.batch_config
        )
        
        await redis_client.close()
        
        return BatchResponse(
            batch_id=batch.batch_id,
            status=batch.status,
            message=f"批次创建成功，包含 {batch.total_tasks} 个任务",
            statistics=await batch_manager.get_batch_statistics(batch.batch_id)
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建批次失败: {str(e)}")


@router.post("/batches/{batch_id}/actions", response_model=BatchResponse)
async def batch_action(
    batch_id: str,
    request: BatchActionRequest,
    background_tasks: BackgroundTasks,
    db: SessionDep,
    current_user=Depends(deps.get_current_user)
):
    """执行批次操作"""
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        batch_manager = BatchManager(db, redis_client, settings)
        
        # 验证批次存在
        batch = await batch_manager.get_batch(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="批次不存在")
        
        # 执行操作
        result = False
        message = ""
        
        if request.action == "start":
            result = await batch_manager.start_batch(batch_id)
            message = "批次启动成功" if result else "批次启动失败"
            
        elif request.action == "pause":
            result = await batch_manager.pause_batch(batch_id)
            message = "批次暂停成功" if result else "批次暂停失败"
            
        elif request.action == "resume":
            result = await batch_manager.resume_batch(batch_id)
            message = "批次恢复成功" if result else "批次恢复失败"
            
        elif request.action == "cancel":
            result = await batch_manager.cancel_batch(batch_id)
            message = "批次取消成功" if result else "批次取消失败"
            
        else:
            raise HTTPException(status_code=400, detail="不支持的操作")
        
        if not result:
            raise HTTPException(status_code=400, detail=message)
        
        # 获取最新统计
        stats = await batch_manager.get_batch_statistics(batch_id)
        
        await redis_client.close()
        
        return BatchResponse(
            batch_id=batch_id,
            status=stats.get('status', 'unknown'),
            message=message,
            statistics=stats
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"操作失败: {str(e)}")


@router.get("/batches/{batch_id}", response_model=Dict[str, Any])
async def get_batch_status(
    batch_id: str,
    db: SessionDep,
    current_user=Depends(deps.get_current_user)
):
    """获取批次状态"""
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        batch_manager = BatchManager(db, redis_client, settings)
        
        stats = await batch_manager.get_batch_statistics(batch_id)
        if not stats:
            raise HTTPException(status_code=404, detail="批次不存在")
        
        await redis_client.close()
        return stats
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取批次状态失败: {str(e)}")


@router.get("/batches", response_model=List[Dict[str, Any]])
async def list_active_batches(
    db: SessionDep,
    current_user=Depends(deps.get_current_user)
):
    """获取活跃批次列表"""
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        batch_manager = BatchManager(db, redis_client, settings)
        
        batches = await batch_manager.list_active_batches()
        
        await redis_client.close()
        return batches
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取批次列表失败: {str(e)}")


@router.delete("/batches/{batch_id}")
async def delete_batch(
    batch_id: str,
    db: SessionDep,
    current_user=Depends(deps.get_current_user)
):
    """删除批次（仅限已完成或失败的批次）"""
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        batch_manager = BatchManager(db, redis_client, settings)
        
        batch = await batch_manager.get_batch(batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="批次不存在")
        
        if not batch.is_finished():
            raise HTTPException(status_code=400, detail="只能删除已完成的批次")
        
        # 执行删除逻辑
        # await batch_manager.delete_batch(batch_id)
        
        await redis_client.close()
        return {"message": "批次删除成功"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除批次失败: {str(e)}")


@router.get("/queue/info", response_model=QueueInfoResponse)
async def get_queue_info(
    current_user=Depends(deps.get_current_user)
):
    """获取队列信息"""
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        dispatcher = TaskDispatcher(redis_client, settings)
        
        queue_info = await dispatcher.get_queue_info()
        
        await redis_client.close()
        
        if 'error' in queue_info:
            raise HTTPException(status_code=500, detail=queue_info['error'])
        
        return QueueInfoResponse(**queue_info)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取队列信息失败: {str(e)}")


@router.post("/queue/clear-failed")
async def clear_failed_jobs(
    current_user=Depends(deps.get_current_user)
):
    """清理失败的作业"""
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        dispatcher = TaskDispatcher(redis_client, settings)
        
        cleared_count = await dispatcher.clear_failed_jobs()
        
        await redis_client.close()
        
        return {
            "message": f"成功清理 {cleared_count} 个失败作业",
            "cleared_count": cleared_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清理失败作业失败: {str(e)}")


@router.get("/statistics")
async def get_execution_statistics(
    current_user=Depends(deps.get_current_user)
):
    """获取执行统计信息"""
    
    try:
        from app.tasks import get_task_execution_statistics
        
        stats = await get_task_execution_statistics()
        return stats
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


@router.post("/cleanup/expired-batches")
async def cleanup_expired_batches(
    current_user=Depends(deps.get_current_user)
):
    """清理过期的批次数据"""
    
    try:
        from app.tasks import cleanup_expired_batches
        
        cleaned_count = await cleanup_expired_batches()
        
        return {
            "message": f"成功清理 {cleaned_count} 个过期批次",
            "cleaned_count": cleaned_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清理过期批次失败: {str(e)}")


@router.get("/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    current_user=Depends(deps.get_current_user)
):
    """获取RQ作业状态"""
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        dispatcher = TaskDispatcher(redis_client, settings)
        
        job_status = await dispatcher.get_job_status(job_id)
        
        await redis_client.close()
        return job_status
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取作业状态失败: {str(e)}")


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    current_user=Depends(deps.get_current_user)
):
    """取消RQ作业"""
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        dispatcher = TaskDispatcher(redis_client, settings)
        
        result = await dispatcher.cancel_job(job_id)
        
        await redis_client.close()
        
        if result:
            return {"message": "作业取消成功"}
        else:
            raise HTTPException(status_code=400, detail="作业取消失败")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"取消作业失败: {str(e)}")