from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import uuid
import json
from sqlmodel import Session, select, func

from app.models import TaskCreatRolePrompt
from app.core.config import settings


class BatchStatus(str, Enum):
    """批次状态枚举"""
    PENDING = "pending"          # 待开始
    RUNNING = "running"          # 执行中
    PAUSED = "paused"           # 已暂停
    COMPLETED = "completed"      # 已完成
    FAILED = "failed"           # 执行失败
    CANCELLED = "cancelled"      # 已取消


class TaskStatus(str, Enum):
    """任务状态枚举"""
    PENDING = "P"               # 待启动
    QUEUED = "Q"               # 已入队
    RUNNING = "R"              # 执行中
    COMPLETED = "C"            # 已完成
    FAILED = "F"               # 执行失败
    RETRYING = "T"             # 重试中
    CANCELLED = "X"            # 已取消


@dataclass
class BatchExecution:
    """批次执行信息"""
    batch_id: str
    created_at: datetime
    created_by: int
    filter_params: Dict[str, Any]
    
    # 配置信息
    max_concurrent: int = 5
    timeout_minutes: int = 120
    retry_attempts: int = 3
    
    # 状态信息
    status: BatchStatus = BatchStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    # 统计信息
    total_tasks: int = 0
    queued_tasks: int = 0
    running_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    cancelled_tasks: int = 0
    
    # 性能指标
    average_duration: float = 0.0
    success_rate: float = 0.0
    throughput: float = 0.0  # 任务/分钟
    
    # 关联信息
    task_ids: List[int] = field(default_factory=list)
    rq_job_ids: List[str] = field(default_factory=list)
    
    def get_progress(self) -> float:
        """获取执行进度百分比"""
        if self.total_tasks == 0:
            return 0.0
        finished = self.completed_tasks + self.failed_tasks + self.cancelled_tasks
        return (finished / self.total_tasks) * 100
    
    def get_active_tasks(self) -> int:
        """获取活跃任务数"""
        return self.queued_tasks + self.running_tasks
    
    def is_finished(self) -> bool:
        """检查批次是否已结束"""
        return self.status in [BatchStatus.COMPLETED, BatchStatus.FAILED, BatchStatus.CANCELLED]
    
    def calculate_eta(self) -> Optional[datetime]:
        """计算预计完成时间"""
        if self.throughput <= 0 or self.get_active_tasks() == 0:
            return None
        
        remaining_tasks = self.total_tasks - self.completed_tasks - self.failed_tasks
        if remaining_tasks <= 0:
            return datetime.now()
        
        eta_minutes = remaining_tasks / self.throughput
        return datetime.now() + timedelta(minutes=eta_minutes)


class BatchManager:
    """批次管理器 - 核心业务逻辑"""
    
    def __init__(self, db_session: Session, redis_client, config_manager):
        self.db = db_session
        self.redis = redis_client
        self.config = config_manager
        self.active_batches: Dict[str, BatchExecution] = {}
        self.batch_lock = asyncio.Lock()
        
    async def create_batch(
        self, 
        filter_params: Dict[str, Any], 
        user_id: int,
        batch_config: Optional[Dict] = None
    ) -> BatchExecution:
        """创建新的执行批次"""
        
        # 1. 生成批次ID
        batch_id = f"batch_{uuid.uuid4().hex[:8]}_{int(datetime.now().timestamp())}"
        
        # 2. 发现待执行任务
        tasks = await self._discover_tasks(filter_params)
        if not tasks:
            raise ValueError("未找到符合条件的待执行任务")
        
        # 3. 应用批次配置
        config = self._prepare_batch_config(batch_config)
        
        # 4. 创建批次对象
        batch = BatchExecution(
            batch_id=batch_id,
            created_at=datetime.now(),
            created_by=user_id,
            filter_params=filter_params,
            max_concurrent=config.get("max_concurrent", 5),
            timeout_minutes=config.get("timeout_minutes", 120),
            retry_attempts=config.get("retry_attempts", 3),
            total_tasks=len(tasks),
            task_ids=[task.id for task in tasks]
        )
        
        # 5. 保存批次信息到数据库
        await self._save_batch_to_db(batch, tasks)
        
        # 6. 注册到内存管理
        async with self.batch_lock:
            self.active_batches[batch_id] = batch
        
        return batch
    
    async def start_batch(self, batch_id: str) -> bool:
        """启动批次执行"""
        batch = await self.get_batch(batch_id)
        if not batch:
            raise ValueError(f"批次 {batch_id} 不存在")
        
        if batch.status != BatchStatus.PENDING:
            raise ValueError(f"批次 {batch_id} 状态不允许启动: {batch.status}")
        
        try:
            # 1. 更新批次状态
            batch.status = BatchStatus.RUNNING
            batch.started_at = datetime.now()
            await self._update_batch_status(batch)
            
            # 2. 获取待执行任务
            tasks = await self._get_batch_tasks(batch_id)
            
            # 3. 分发任务到RQ队列
            from .task_dispatcher import TaskDispatcher
            dispatcher = TaskDispatcher(self.redis, self.config)
            
            job_ids = await dispatcher.dispatch_tasks(
                tasks=tasks,
                batch_id=batch_id,
                max_concurrent=batch.max_concurrent,
                timeout=batch.timeout_minutes * 60
            )
            
            # 4. 记录RQ作业ID
            batch.rq_job_ids = job_ids
            batch.queued_tasks = len(job_ids)
            await self._update_batch_statistics(batch)
            
            # 5. 启动监控任务
            asyncio.create_task(self._monitor_batch_execution(batch_id))
            
            return True
            
        except Exception as e:
            # 启动失败，回滚状态
            batch.status = BatchStatus.FAILED
            batch.error_message = str(e)
            await self._update_batch_status(batch)
            raise
    
    async def pause_batch(self, batch_id: str) -> bool:
        """暂停批次执行"""
        batch = await self.get_batch(batch_id)
        if not batch or batch.status != BatchStatus.RUNNING:
            return False
        
        # 1. 暂停RQ作业
        from rq import Queue
        queue = Queue(connection=self.redis)
        
        paused_count = 0
        for job_id in batch.rq_job_ids:
            job = queue.get_job(job_id)
            if job and job.is_queued:
                job.cancel()
                paused_count += 1
        
        # 2. 更新批次状态
        batch.status = BatchStatus.PAUSED
        await self._update_batch_status(batch)
        
        return paused_count > 0
    
    async def resume_batch(self, batch_id: str) -> bool:
        """恢复批次执行"""
        batch = await self.get_batch(batch_id)
        if not batch or batch.status != BatchStatus.PAUSED:
            return False
        
        # 1. 获取未完成任务
        pending_tasks = await self._get_pending_tasks(batch_id)
        
        if not pending_tasks:
            # 没有待执行任务，直接标记完成
            batch.status = BatchStatus.COMPLETED
            batch.completed_at = datetime.now()
            await self._update_batch_status(batch)
            return True
        
        # 2. 重新分发任务
        from .task_dispatcher import TaskDispatcher
        dispatcher = TaskDispatcher(self.redis, self.config)
        
        new_job_ids = await dispatcher.dispatch_tasks(
            tasks=pending_tasks,
            batch_id=batch_id,
            max_concurrent=batch.max_concurrent
        )
        
        # 3. 更新批次信息
        batch.status = BatchStatus.RUNNING
        batch.rq_job_ids.extend(new_job_ids)
        batch.queued_tasks += len(new_job_ids)
        await self._update_batch_statistics(batch)
        
        return True
    
    async def cancel_batch(self, batch_id: str) -> bool:
        """取消批次执行"""
        batch = await self.get_batch(batch_id)
        if not batch or batch.is_finished():
            return False
        
        # 1. 取消所有RQ作业
        from rq import Queue
        queue = Queue(connection=self.redis)
        
        cancelled_count = 0
        for job_id in batch.rq_job_ids:
            job = queue.get_job(job_id)
            if job and not job.is_finished:
                job.cancel()
                cancelled_count += 1
        
        # 2. 更新任务状态
        await self._update_batch_tasks_status(batch_id, TaskStatus.CANCELLED)
        
        # 3. 更新批次状态
        batch.status = BatchStatus.CANCELLED
        batch.completed_at = datetime.now()
        batch.cancelled_tasks = cancelled_count
        await self._update_batch_status(batch)
        
        return True
    
    async def get_batch(self, batch_id: str) -> Optional[BatchExecution]:
        """获取批次信息"""
        # 优先从内存获取
        async with self.batch_lock:
            if batch_id in self.active_batches:
                return self.active_batches[batch_id]
        
        # 从数据库获取
        return await self._load_batch_from_db(batch_id)
    
    async def get_batch_statistics(self, batch_id: str) -> Dict[str, Any]:
        """获取批次统计信息"""
        batch = await self.get_batch(batch_id)
        if not batch:
            return {}
        
        # 实时更新统计数据
        await self._refresh_batch_statistics(batch)
        
        return {
            "batch_id": batch.batch_id,
            "status": batch.status,
            "progress": batch.get_progress(),
            "total_tasks": batch.total_tasks,
            "completed_tasks": batch.completed_tasks,
            "failed_tasks": batch.failed_tasks,
            "running_tasks": batch.running_tasks,
            "success_rate": batch.success_rate,
            "average_duration": batch.average_duration,
            "throughput": batch.throughput,
            "eta": batch.calculate_eta(),
            "created_at": batch.created_at,
            "started_at": batch.started_at,
            "duration": self._calculate_duration(batch)
        }
    
    async def list_active_batches(self) -> List[Dict[str, Any]]:
        """获取活跃批次列表"""
        active_batches = []
        
        async with self.batch_lock:
            for batch_id, batch in self.active_batches.items():
                if not batch.is_finished():
                    stats = await self.get_batch_statistics(batch_id)
                    active_batches.append(stats)
        
        return active_batches
    
    # 私有方法
    async def _discover_tasks(self, filter_params: Dict[str, Any]) -> List[TaskCreatRolePrompt]:
        """发现待执行任务"""
        query = select(TaskCreatRolePrompt).where(
            TaskCreatRolePrompt.task_state == TaskStatus.PENDING
        )
        
        # 应用过滤条件
        if filter_params.get("role_ids"):
            query = query.where(TaskCreatRolePrompt.role_id.in_(filter_params["role_ids"]))
        
        if filter_params.get("limit"):
            query = query.limit(filter_params["limit"])
        
        # 按创建时间排序
        query = query.order_by(TaskCreatRolePrompt.created_at)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    def _prepare_batch_config(self, batch_config: Optional[Dict]) -> Dict[str, Any]:
        """准备批次配置"""
        default_config = {
            "max_concurrent": settings.BATCH_MAX_CONCURRENT,
            "timeout_minutes": settings.BATCH_TIMEOUT_MINUTES,
            "retry_attempts": settings.BATCH_RETRY_ATTEMPTS
        }
        
        if batch_config:
            default_config.update(batch_config)
        
        return default_config
    
    async def _save_batch_to_db(self, batch: BatchExecution, tasks: List[TaskCreatRolePrompt]):
        """保存批次信息到数据库"""
        # 这里可以实现批次信息的持久化存储
        # 暂时使用Redis存储批次信息
        batch_data = {
            "batch_id": batch.batch_id,
            "created_at": batch.created_at.isoformat(),
            "created_by": batch.created_by,
            "filter_params": batch.filter_params,
            "config": {
                "max_concurrent": batch.max_concurrent,
                "timeout_minutes": batch.timeout_minutes,
                "retry_attempts": batch.retry_attempts
            },
            "status": batch.status,
            "total_tasks": batch.total_tasks,
            "task_ids": batch.task_ids
        }
        
        await self.redis.setex(
            f"batch:{batch.batch_id}",
            3600 * 24,  # 24小时过期
            json.dumps(batch_data, ensure_ascii=False)
        )
    
    async def _load_batch_from_db(self, batch_id: str) -> Optional[BatchExecution]:
        """从数据库加载批次信息"""
        try:
            batch_data_str = await self.redis.get(f"batch:{batch_id}")
            if not batch_data_str:
                return None
            
            batch_data = json.loads(batch_data_str)
            
            batch = BatchExecution(
                batch_id=batch_data["batch_id"],
                created_at=datetime.fromisoformat(batch_data["created_at"]),
                created_by=batch_data["created_by"],
                filter_params=batch_data["filter_params"],
                max_concurrent=batch_data["config"]["max_concurrent"],
                timeout_minutes=batch_data["config"]["timeout_minutes"],
                retry_attempts=batch_data["config"]["retry_attempts"],
                status=BatchStatus(batch_data["status"]),
                total_tasks=batch_data["total_tasks"],
                task_ids=batch_data["task_ids"]
            )
            
            # 刷新统计数据
            await self._refresh_batch_statistics(batch)
            
            return batch
            
        except Exception as e:
            print(f"加载批次失败: {e}")
            return None
    
    async def _update_batch_status(self, batch: BatchExecution):
        """更新批次状态"""
        # 更新内存中的批次信息
        async with self.batch_lock:
            self.active_batches[batch.batch_id] = batch
        
        # 更新Redis中的批次信息
        await self._save_batch_to_db(batch, [])
    
    async def _update_batch_statistics(self, batch: BatchExecution):
        """更新批次统计信息"""
        await self._update_batch_status(batch)
    
    async def _get_batch_tasks(self, batch_id: str) -> List[TaskCreatRolePrompt]:
        """获取批次任务"""
        batch = await self.get_batch(batch_id)
        if not batch:
            return []
        
        query = select(TaskCreatRolePrompt).where(
            TaskCreatRolePrompt.id.in_(batch.task_ids)
        )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def _get_pending_tasks(self, batch_id: str) -> List[TaskCreatRolePrompt]:
        """获取未完成任务"""
        batch = await self.get_batch(batch_id)
        if not batch:
            return []
        
        query = select(TaskCreatRolePrompt).where(
            TaskCreatRolePrompt.id.in_(batch.task_ids),
            TaskCreatRolePrompt.task_state == TaskStatus.PENDING
        )
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def _update_batch_tasks_status(self, batch_id: str, status: TaskStatus):
        """更新批次任务状态"""
        batch = await self.get_batch(batch_id)
        if not batch:
            return
        
        # 更新任务状态
        update_stmt = (
            TaskCreatRolePrompt.__table__.update()
            .where(TaskCreatRolePrompt.id.in_(batch.task_ids))
            .values(task_state=status, updated_at=datetime.now())
        )
        
        await self.db.execute(update_stmt)
        await self.db.commit()
    
    async def _monitor_batch_execution(self, batch_id: str):
        """监控批次执行进度"""
        monitor_interval = 10  # 10秒检查一次
        
        while True:
            try:
                batch = await self.get_batch(batch_id)
                if not batch or batch.is_finished():
                    break
                
                # 刷新统计数据
                await self._refresh_batch_statistics(batch)
                
                # 检查是否需要触发聚合
                await self._check_and_trigger_aggregation(batch_id)
                
                # 检查超时
                if self._is_batch_timeout(batch):
                    await self._handle_batch_timeout(batch_id)
                    break
                
                await asyncio.sleep(monitor_interval)
                
            except Exception as e:
                print(f"批次监控异常: {e}")
                await asyncio.sleep(monitor_interval)
    
    async def _refresh_batch_statistics(self, batch: BatchExecution):
        """刷新批次统计数据"""
        # 从数据库获取最新任务状态统计
        stats_query = select(
            TaskCreatRolePrompt.task_state,
            func.count(TaskCreatRolePrompt.id).label('count'),
            func.avg(
                func.extract('epoch', TaskCreatRolePrompt.updated_at - TaskCreatRolePrompt.created_at)
            ).label('avg_duration')
        ).where(
            TaskCreatRolePrompt.id.in_(batch.task_ids)
        ).group_by(TaskCreatRolePrompt.task_state)
        
        result = await self.db.execute(stats_query)
        stats = result.all()
        
        # 重置统计
        batch.queued_tasks = 0
        batch.running_tasks = 0
        batch.completed_tasks = 0
        batch.failed_tasks = 0
        batch.cancelled_tasks = 0
        
        total_duration = 0
        completed_count = 0
        
        # 更新统计数据
        for stat in stats:
            status, count, avg_dur = stat
            
            if status == TaskStatus.QUEUED:
                batch.queued_tasks = count
            elif status == TaskStatus.RUNNING:
                batch.running_tasks = count
            elif status == TaskStatus.COMPLETED:
                batch.completed_tasks = count
                if avg_dur:
                    total_duration += avg_dur * count
                    completed_count += count
            elif status == TaskStatus.FAILED:
                batch.failed_tasks = count
            elif status == TaskStatus.CANCELLED:
                batch.cancelled_tasks = count
        
        # 计算平均时长
        if completed_count > 0:
            batch.average_duration = total_duration / completed_count
        
        # 计算成功率
        finished_tasks = batch.completed_tasks + batch.failed_tasks
        if finished_tasks > 0:
            batch.success_rate = (batch.completed_tasks / finished_tasks) * 100
        
        # 计算吞吐量 (任务/分钟)
        if batch.started_at:
            elapsed_minutes = (datetime.now() - batch.started_at).total_seconds() / 60
            if elapsed_minutes > 0:
                batch.throughput = batch.completed_tasks / elapsed_minutes
        
        # 检查批次是否完成
        if batch.get_active_tasks() == 0 and batch.status == BatchStatus.RUNNING:
            batch.status = BatchStatus.COMPLETED
            batch.completed_at = datetime.now()
        
        # 更新数据库
        await self._update_batch_statistics(batch)
    
    async def _check_and_trigger_aggregation(self, batch_id: str):
        """检查并触发结果聚合"""
        # 获取批次中涉及的角色ID
        role_ids = await self._get_batch_role_ids(batch_id)
        
        # 检查每个角色是否完成
        for role_id in role_ids:
            if await self._is_role_tasks_completed(role_id):
                # 触发角色结果聚合
                from .result_aggregator import ResultAggregator
                aggregator = ResultAggregator(self.db, self.config)
                
                asyncio.create_task(
                    aggregator.aggregate_role_results(role_id)
                )
    
    async def _get_batch_role_ids(self, batch_id: str) -> List[int]:
        """获取批次中涉及的角色ID"""
        batch = await self.get_batch(batch_id)
        if not batch:
            return []
        
        query = select(TaskCreatRolePrompt.role_id).where(
            TaskCreatRolePrompt.id.in_(batch.task_ids)
        ).distinct()
        
        result = await self.db.execute(query)
        return [row[0] for row in result.all()]
    
    async def _is_role_tasks_completed(self, role_id: int) -> bool:
        """检查角色任务是否全部完成"""
        query = select(func.count(TaskCreatRolePrompt.id)).where(
            TaskCreatRolePrompt.role_id == role_id,
            TaskCreatRolePrompt.task_state.in_([TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.RUNNING])
        )
        
        result = await self.db.execute(query)
        pending_count = result.scalar()
        
        return pending_count == 0
    
    def _is_batch_timeout(self, batch: BatchExecution) -> bool:
        """检查批次是否超时"""
        if not batch.started_at:
            return False
        
        elapsed_minutes = (datetime.now() - batch.started_at).total_seconds() / 60
        return elapsed_minutes > batch.timeout_minutes
    
    async def _handle_batch_timeout(self, batch_id: str):
        """处理批次超时"""
        batch = await self.get_batch(batch_id)
        if not batch:
            return
        
        batch.status = BatchStatus.FAILED
        batch.error_message = "批次执行超时"
        batch.completed_at = datetime.now()
        
        await self._update_batch_status(batch)
    
    def _calculate_duration(self, batch: BatchExecution) -> Optional[float]:
        """计算批次执行时长（秒）"""
        if not batch.started_at:
            return None
        
        end_time = batch.completed_at or datetime.now()
        return (end_time - batch.started_at).total_seconds()