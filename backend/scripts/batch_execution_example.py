#!/usr/bin/env python3
"""
批量任务执行系统使用示例

这个脚本演示了如何使用批量任务调度系统的API接口来：
1. 创建批次
2. 启动执行
3. 监控进度
4. 获取结果

使用前请确保：
1. FastAPI服务正在运行 (python -m uvicorn app.main:app --reload)
2. Redis服务正在运行
3. RQ Workers正在运行 (bash scripts/start_rq_workers.sh)
"""

import asyncio
import aiohttp
import json
import time
from typing import Dict, Any, Optional


class BatchExecutionClient:
    """批量执行系统客户端"""
    
    def __init__(self, base_url: str = "http://localhost:8000", token: Optional[str] = None):
        self.base_url = base_url
        self.token = token
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers
    
    async def create_batch(self, filter_params: Dict[str, Any], batch_config: Optional[Dict] = None) -> Dict:
        """创建新的执行批次"""
        url = f"{self.base_url}/api/v1/batch-execution/batches"
        
        payload = {
            "filter_params": filter_params,
            "batch_config": batch_config or {}
        }
        
        async with self.session.post(url, json=payload, headers=self._get_headers()) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"创建批次失败: {response.status} - {error_text}")
    
    async def start_batch(self, batch_id: str) -> Dict:
        """启动批次执行"""
        url = f"{self.base_url}/api/v1/batch-execution/batches/{batch_id}/actions"
        
        payload = {"action": "start"}
        
        async with self.session.post(url, json=payload, headers=self._get_headers()) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"启动批次失败: {response.status} - {error_text}")
    
    async def get_batch_status(self, batch_id: str) -> Dict:
        """获取批次状态"""
        url = f"{self.base_url}/api/v1/batch-execution/batches/{batch_id}"
        
        async with self.session.get(url, headers=self._get_headers()) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"获取批次状态失败: {response.status} - {error_text}")
    
    async def pause_batch(self, batch_id: str) -> Dict:
        """暂停批次执行"""
        url = f"{self.base_url}/api/v1/batch-execution/batches/{batch_id}/actions"
        
        payload = {"action": "pause"}
        
        async with self.session.post(url, json=payload, headers=self._get_headers()) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"暂停批次失败: {response.status} - {error_text}")
    
    async def resume_batch(self, batch_id: str) -> Dict:
        """恢复批次执行"""
        url = f"{self.base_url}/api/v1/batch-execution/batches/{batch_id}/actions"
        
        payload = {"action": "resume"}
        
        async with self.session.post(url, json=payload, headers=self._get_headers()) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"恢复批次失败: {response.status} - {error_text}")
    
    async def cancel_batch(self, batch_id: str) -> Dict:
        """取消批次执行"""
        url = f"{self.base_url}/api/v1/batch-execution/batches/{batch_id}/actions"
        
        payload = {"action": "cancel"}
        
        async with self.session.post(url, json=payload, headers=self._get_headers()) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"取消批次失败: {response.status} - {error_text}")
    
    async def get_queue_info(self) -> Dict:
        """获取队列信息"""
        url = f"{self.base_url}/api/v1/batch-execution/queue/info"
        
        async with self.session.get(url, headers=self._get_headers()) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"获取队列信息失败: {response.status} - {error_text}")
    
    async def get_statistics(self) -> Dict:
        """获取执行统计"""
        url = f"{self.base_url}/api/v1/batch-execution/statistics"
        
        async with self.session.get(url, headers=self._get_headers()) as response:
            if response.status == 200:
                return await response.json()
            else:
                error_text = await response.text()
                raise Exception(f"获取统计信息失败: {response.status} - {error_text}")


def print_info(message: str):
    """打印信息"""
    print(f"📌 {message}")


def print_success(message: str):
    """打印成功信息"""
    print(f"✅ {message}")


def print_error(message: str):
    """打印错误信息"""
    print(f"❌ {message}")


def print_progress(current: int, total: int, status: str):
    """打印进度"""
    percentage = (current / total) * 100 if total > 0 else 0
    bar_length = 30
    filled_length = int(bar_length * current // total) if total > 0 else 0
    bar = '█' * filled_length + '-' * (bar_length - filled_length)
    print(f"📊 进度: |{bar}| {current}/{total} ({percentage:.1f}%) - {status}")


async def monitor_batch_execution(client: BatchExecutionClient, batch_id: str):
    """监控批次执行"""
    print_info(f"开始监控批次: {batch_id}")
    
    while True:
        try:
            status = await client.get_batch_status(batch_id)
            
            batch_status = status.get('status', 'unknown')
            progress = status.get('progress', 0)
            total_tasks = status.get('total_tasks', 0)
            completed_tasks = status.get('completed_tasks', 0)
            failed_tasks = status.get('failed_tasks', 0)
            running_tasks = status.get('running_tasks', 0)
            success_rate = status.get('success_rate', 0)
            eta = status.get('eta')
            
            print_progress(completed_tasks + failed_tasks, total_tasks, batch_status)
            
            if batch_status in ['completed', 'failed', 'cancelled']:
                if batch_status == 'completed':
                    print_success(f"批次执行完成！成功率: {success_rate:.1f}%")
                elif batch_status == 'failed':
                    print_error("批次执行失败")
                else:
                    print_info("批次已取消")
                break
            
            if eta:
                print_info(f"预计完成时间: {eta}")
            
            await asyncio.sleep(5)  # 每5秒检查一次
            
        except Exception as e:
            print_error(f"监控出错: {e}")
            await asyncio.sleep(5)


async def example_basic_usage():
    """基础使用示例"""
    print("🚀 批量任务执行系统 - 基础使用示例")
    print("=" * 50)
    
    async with BatchExecutionClient() as client:
        try:
            # 1. 获取系统状态
            print_info("获取系统状态...")
            
            try:
                queue_info = await client.get_queue_info()
                print(f"📋 队列状态:")
                print(f"   - 活跃Worker: {queue_info.get('active_workers', 0)}")
                print(f"   - 队列任务: {queue_info.get('queued_jobs', 0)}")
                print(f"   - 失败任务: {queue_info.get('failed_jobs', 0)}")
            except Exception as e:
                print_error(f"获取队列信息失败: {e}")
                return
            
            # 2. 创建批次
            print_info("创建批次...")
            
            filter_params = {
                "role_ids": [1, 2, 3],  # 指定角色ID
                "limit": 10             # 限制任务数量
            }
            
            batch_config = {
                "max_concurrent": 3,    # 最大并发数
                "timeout_minutes": 60,  # 超时时间(分钟)
                "retry_attempts": 2     # 重试次数
            }
            
            try:
                batch_result = await client.create_batch(filter_params, batch_config)
                batch_id = batch_result['batch_id']
                print_success(f"批次创建成功: {batch_id}")
                print(f"   - 任务数量: {batch_result.get('statistics', {}).get('total_tasks', 0)}")
            except Exception as e:
                print_error(f"创建批次失败: {e}")
                return
            
            # 3. 启动批次
            print_info("启动批次执行...")
            
            try:
                start_result = await client.start_batch(batch_id)
                print_success(start_result['message'])
            except Exception as e:
                print_error(f"启动批次失败: {e}")
                return
            
            # 4. 监控执行
            await monitor_batch_execution(client, batch_id)
            
            # 5. 获取最终统计
            print_info("获取最终统计...")
            
            try:
                final_stats = await client.get_batch_status(batch_id)
                print("📈 最终统计:")
                print(f"   - 总任务数: {final_stats.get('total_tasks', 0)}")
                print(f"   - 完成任务: {final_stats.get('completed_tasks', 0)}")
                print(f"   - 失败任务: {final_stats.get('failed_tasks', 0)}")
                print(f"   - 成功率: {final_stats.get('success_rate', 0):.1f}%")
                print(f"   - 平均耗时: {final_stats.get('average_duration', 0):.2f}秒")
            except Exception as e:
                print_error(f"获取统计失败: {e}")
                
        except Exception as e:
            print_error(f"示例执行失败: {e}")


async def example_advanced_control():
    """高级控制示例"""
    print("\n🎛️ 批量任务执行系统 - 高级控制示例")
    print("=" * 50)
    
    async with BatchExecutionClient() as client:
        try:
            # 创建批次
            filter_params = {"role_ids": [1, 2, 3, 4, 5], "limit": 20}
            batch_result = await client.create_batch(filter_params)
            batch_id = batch_result['batch_id']
            
            print_success(f"批次创建成功: {batch_id}")
            
            # 启动批次
            await client.start_batch(batch_id)
            print_success("批次已启动")
            
            # 等待一段时间
            await asyncio.sleep(10)
            
            # 暂停批次
            print_info("暂停批次执行...")
            await client.pause_batch(batch_id)
            print_success("批次已暂停")
            
            # 检查状态
            status = await client.get_batch_status(batch_id)
            print(f"📊 当前状态: {status.get('status')}")
            print(f"📊 完成进度: {status.get('progress', 0):.1f}%")
            
            # 等待一段时间
            await asyncio.sleep(5)
            
            # 恢复批次
            print_info("恢复批次执行...")
            await client.resume_batch(batch_id)
            print_success("批次已恢复")
            
            # 继续监控
            await monitor_batch_execution(client, batch_id)
            
        except Exception as e:
            print_error(f"高级控制示例失败: {e}")


async def main():
    """主函数"""
    print("🤖 批量任务执行系统演示")
    print("=" * 60)
    
    # 基础使用示例
    await example_basic_usage()
    
    # 等待一段时间
    await asyncio.sleep(3)
    
    # 高级控制示例
    await example_advanced_control()
    
    print("\n🎉 演示完成！")
    print("\n📚 API文档地址: http://localhost:8000/docs")
    print("📊 RQ监控面板: http://localhost:9181 (如果启用)")


if __name__ == "__main__":
    print("使用说明:")
    print("1. 确保FastAPI服务运行: python -m uvicorn app.main:app --reload")
    print("2. 确保Redis服务运行")
    print("3. 确保RQ Workers运行: bash scripts/start_rq_workers.sh")
    print("4. 需要有有效的用户认证token (或在开发环境中关闭认证)")
    print()
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 用户中断，退出程序")
    except Exception as e:
        print_error(f"程序执行失败: {e}")