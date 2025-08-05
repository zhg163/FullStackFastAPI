import aiohttp
import asyncio
import json
import time
import hashlib
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
from datetime import datetime


class ApiProvider(str, Enum):
    """API提供商枚举"""
    QWEN = "qwen"
    DEEPSEEK = "deepseek"
    CUSTOM = "custom"
    MOCK = "mock"


@dataclass
class ApiResponse:
    """API响应数据结构"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    duration: float = 0.0
    tokens_used: int = 0
    api_version: Optional[str] = None
    
    @classmethod
    def success_response(cls, data: Dict[str, Any], duration: float = 0.0):
        return cls(
            success=True,
            data=data,
            duration=duration,
            tokens_used=data.get('tokens_used', 0),
            api_version=data.get('api_version')
        )
    
    @classmethod
    def error_response(cls, error: str, error_code: str = None, duration: float = 0.0):
        return cls(
            success=False,
            error=error,
            error_code=error_code,
            duration=duration
        )


class RateLimiter:
    """智能限流器"""
    
    def __init__(self, max_requests_per_minute: int = 60):
        self.max_requests = max_requests_per_minute
        self.requests = []
        self.lock = asyncio.Lock()
    
    async def acquire(self):
        """获取请求许可"""
        async with self.lock:
            now = time.time()
            # 清理60秒前的请求记录
            self.requests = [req_time for req_time in self.requests if now - req_time < 60]
            
            if len(self.requests) >= self.max_requests:
                # 计算需要等待的时间
                oldest_request = min(self.requests)
                wait_time = 60 - (now - oldest_request) + 1
                await asyncio.sleep(wait_time)
                
                # 重新检查
                now = time.time()
                self.requests = [req_time for req_time in self.requests if now - req_time < 60]
            
            self.requests.append(now)


class CircuitBreaker:
    """熔断器"""
    
    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
        self.lock = asyncio.Lock()
    
    async def is_open(self) -> bool:
        """检查熔断器是否开启"""
        async with self.lock:
            if self.state == 'OPEN':
                if time.time() - self.last_failure_time > self.timeout:
                    self.state = 'HALF_OPEN'
                    return False
                return True
            return False
    
    async def record_success(self):
        """记录成功请求"""
        async with self.lock:
            self.failure_count = 0
            self.state = 'CLOSED'
    
    async def record_failure(self):
        """记录失败请求"""
        async with self.lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.failure_count >= self.failure_threshold:
                self.state = 'OPEN'


class RequestCache:
    """请求缓存"""
    
    def __init__(self, redis_client, ttl: int = 3600):
        self.redis = redis_client
        self.ttl = ttl
    
    def _generate_cache_key(self, task_id: int, command: Dict[str, Any]) -> str:
        """生成缓存键"""
        content = json.dumps(command, sort_keys=True)
        hash_key = hashlib.md5(content.encode()).hexdigest()
        return f"api_cache:task_{task_id}:{hash_key}"
    
    async def get(self, task_id: int, command: Dict[str, Any]) -> Optional[ApiResponse]:
        """获取缓存的响应"""
        cache_key = self._generate_cache_key(task_id, command)
        
        try:
            cached_data = await self.redis.get(cache_key)
            if cached_data:
                data = json.loads(cached_data)
                return ApiResponse(**data)
        except Exception:
            pass
        
        return None
    
    async def set(self, task_id: int, command: Dict[str, Any], response: ApiResponse):
        """缓存响应"""
        if not response.success:
            return  # 只缓存成功的响应
        
        cache_key = self._generate_cache_key(task_id, command)
        
        try:
            cache_data = {
                'success': response.success,
                'data': response.data,
                'duration': response.duration,
                'tokens_used': response.tokens_used,
                'api_version': response.api_version
            }
            
            await self.redis.setex(
                cache_key, 
                self.ttl, 
                json.dumps(cache_data)
            )
        except Exception:
            pass


class ExternalApiClient:
    """增强版外部API客户端"""
    
    def __init__(self, config):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        
        # 组件初始化
        self.rate_limiter = RateLimiter(getattr(config, 'API_RATE_LIMIT', 60))
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=getattr(config, 'API_FAILURE_THRESHOLD', 5),
            timeout=getattr(config, 'API_CIRCUIT_TIMEOUT', 60)
        )
        
        # API提供商配置
        self.api_configs = {
            ApiProvider.QWEN: {
                'base_url': getattr(config, 'QWEN_BASE_URL', ''),
                'api_key': getattr(config, 'QWEN_API_KEY', ''),
                'model': getattr(config, 'QIANWEN_MODEL_NAME', 'qwen-max'),
                'max_tokens': getattr(config, 'QWEN_MAX_TOKENS', 1000),
                'temperature': getattr(config, 'QWEN_TEMPERATURE', 0.7)
            },
            ApiProvider.DEEPSEEK: {
                'base_url': getattr(config, 'DEEPSEEK_BASE_URL', ''),
                'api_key': getattr(config, 'DEEPSEEK_API_KEY', ''),
                'model': getattr(config, 'DEEPSEEK_MODEL_NAME', 'deepseek-chat'),
                'max_tokens': getattr(config, 'DEEPSEEK_MAX_TOKENS', 1000),
                'temperature': getattr(config, 'DEEPSEEK_TEMPERATURE', 0.7)
            }
        }
        
        self.current_provider = ApiProvider(getattr(config, 'DEFAULT_API_PROVIDER', 'mock'))
        
        # 初始化缓存（如果有Redis客户端）
        self.cache = None
        if hasattr(config, 'redis_client'):
            self.cache = RequestCache(
                redis_client=config.redis_client,
                ttl=getattr(config, 'API_CACHE_TTL', 3600)
            )
    
    async def call_generate_api(
        self, 
        task_id: int, 
        command: Dict[str, Any]
    ) -> ApiResponse:
        """调用生成API"""
        start_time = time.time()
        
        try:
            # 1. 检查缓存
            if self.cache:
                cached_response = await self.cache.get(task_id, command)
                if cached_response:
                    cached_response.duration = time.time() - start_time
                    return cached_response
            
            # 2. 熔断器检查
            if await self.circuit_breaker.is_open():
                return ApiResponse.error_response(
                    "API服务熔断中，请稍后重试",
                    "CIRCUIT_BREAKER_OPEN",
                    time.time() - start_time
                )
            
            # 3. 限流控制
            await self.rate_limiter.acquire()
            
            # 4. 调用API
            response = await self._make_api_call(task_id, command)
            response.duration = time.time() - start_time
            
            # 5. 记录结果
            if response.success:
                await self.circuit_breaker.record_success()
                if self.cache:
                    await self.cache.set(task_id, command, response)
            else:
                await self.circuit_breaker.record_failure()
            
            return response
            
        except Exception as e:
            await self.circuit_breaker.record_failure()
            return ApiResponse.error_response(
                f"API调用异常: {str(e)}",
                "API_EXCEPTION",
                time.time() - start_time
            )
    
    async def _make_api_call(self, task_id: int, command: Dict[str, Any]) -> ApiResponse:
        """实际的API调用"""
        if self.current_provider == ApiProvider.QWEN:
            provider_config = self.api_configs[ApiProvider.QWEN]
            return await self._call_qwen(task_id, command, provider_config)
        elif self.current_provider == ApiProvider.DEEPSEEK:
            provider_config = self.api_configs[ApiProvider.DEEPSEEK]
            return await self._call_deepseek(task_id, command, provider_config)
        elif self.current_provider == ApiProvider.MOCK:
            return await self._call_mock_api(task_id, command)
        else:
            return ApiResponse.error_response(
                f"不支持的API提供商: {self.current_provider}",
                "UNSUPPORTED_PROVIDER"
            )
    
    async def _call_qwen(
        self, task_id: int, command: Dict[str, Any], config: Dict[str, Any]
    ) -> ApiResponse:
        """调用千问API"""
        
        # 构建提示词
        prompt = self._build_prompt(command)
        
        payload = {
            "model": config['model'],
            "messages": [
                {
                    "role": "system", 
                    "content": "你是一个专业的角色提示词生成助手，请根据要求生成高质量的角色内容。"
                },
                {
                    "role": "user", 
                    "content": prompt
                }
            ],
            "max_tokens": config['max_tokens'],
            "temperature": config['temperature']
        }
        
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json"
        }
        
        async with self._get_session() as session:
            try:
                async with session.post(
                    f"{config['base_url']}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=120)
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        # 提取生成内容
                        generated_content = data['choices'][0]['message']['content']
                        tokens_used = data.get('usage', {}).get('total_tokens', 0)
                        
                        return ApiResponse.success_response({
                            'generated_content': generated_content,
                            'confidence': 0.9,  # 千问暂无置信度
                            'tokens_used': tokens_used,
                            'api_version': 'qwen-v1',
                            'provider': 'qwen'
                        })
                    
                    else:
                        error_data = await response.json()
                        return ApiResponse.error_response(
                            error_data.get('error', {}).get('message', 'Unknown error'),
                            str(response.status)
                        )
                        
            except asyncio.TimeoutError:
                return ApiResponse.error_response("API调用超时", "TIMEOUT")
            except aiohttp.ClientError as e:
                return ApiResponse.error_response(f"网络错误: {str(e)}", "NETWORK_ERROR")
    
    async def _call_deepseek(
        self, task_id: int, command: Dict[str, Any], config: Dict[str, Any]
    ) -> ApiResponse:
        """调用DeepSeek API"""
        
        # 构建提示词
        prompt = self._build_prompt(command)
        
        payload = {
            "model": config['model'],
            "messages": [
                {
                    "role": "system", 
                    "content": "你是一个专业的角色提示词生成助手，请根据要求生成高质量的角色内容。"
                },
                {
                    "role": "user", 
                    "content": prompt
                }
            ],
            "max_tokens": config['max_tokens'],
            "temperature": config['temperature'],
            "stream": False
        }
        
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json"
        }
        
        async with self._get_session() as session:
            try:
                async with session.post(
                    f"{config['base_url']}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=120)
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        # 提取生成内容
                        generated_content = data['choices'][0]['message']['content']
                        tokens_used = data.get('usage', {}).get('total_tokens', 0)
                        
                        return ApiResponse.success_response({
                            'generated_content': generated_content,
                            'confidence': 0.9,  # DeepSeek暂无置信度
                            'tokens_used': tokens_used,
                            'api_version': 'deepseek-v1',
                            'provider': 'deepseek'
                        })
                    
                    else:
                        error_data = await response.json()
                        return ApiResponse.error_response(
                            error_data.get('error', {}).get('message', 'Unknown error'),
                            str(response.status)
                        )
                        
            except asyncio.TimeoutError:
                return ApiResponse.error_response("API调用超时", "TIMEOUT")
            except aiohttp.ClientError as e:
                return ApiResponse.error_response(f"网络错误: {str(e)}", "NETWORK_ERROR")
    
    async def _call_mock_api(self, task_id: int, command: Dict[str, Any]) -> ApiResponse:
        """模拟API调用 - 用于测试"""
        await asyncio.sleep(0.5)  # 模拟网络延迟
        
        # 从命令中提取角色信息
        role_name = command.get('context', {}).get('role_name', '神秘角色')
        template_item = command.get('context', {}).get('template_item', '基本信息')
        
        # 生成模拟内容
        mock_content = f"""
{role_name}的{template_item}：

这是为角色"{role_name}"生成的{template_item}内容。这是一个模拟的AI生成结果，
用于测试批量任务执行系统的功能。内容包含了详细的角色设定、背景故事和特征描述。

生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
任务ID：{task_id}
        """.strip()
        
        return ApiResponse.success_response({
            'generated_content': mock_content,
            'confidence': 0.95,
            'tokens_used': 150,
            'api_version': 'mock-v1',
            'provider': 'mock'
        })
    
    def _build_prompt(self, command: Dict[str, Any]) -> str:
        """构建AI提示词"""
        context = command.get('context', {})
        role_name = context.get('role_name', '角色')
        template_item = context.get('template_item', '信息')
        role_background = context.get('role_background', '')
        
        prompt = f"""
请为角色"{role_name}"生成{template_item}相关的详细内容。

角色背景：{role_background if role_background else '无特殊背景'}
生成类型：{template_item}

要求：
1. 内容要详细具体，符合角色设定
2. 语言要生动有趣，有代入感  
3. 字数控制在200-500字之间
4. 确保内容的原创性和合理性
5. 如果是技能描述，要包含技能效果和使用场景
6. 如果是人物关系，要说明关系的具体细节和影响

请直接生成内容，不需要额外的解释说明。
        """.strip()
        
        return prompt
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """获取HTTP会话"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def close(self):
        """关闭客户端"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    def set_provider(self, provider: ApiProvider):
        """设置API提供商"""
        self.current_provider = provider
    
    def get_provider_config(self, provider: ApiProvider = None) -> Dict[str, Any]:
        """获取提供商配置"""
        provider = provider or self.current_provider
        return self.api_configs.get(provider, {})