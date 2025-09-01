import aiohttp
import asyncio
import json
import time
import hashlib
import re
import aiohttp
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

# 获取日志器
logger = logging.getLogger(__name__)


class ApiProvider(str, Enum):
    """API提供商枚举"""
    QWEN = "qwen"
    DEEPSEEK = "deepseek"
    CUSTOM = "custom"


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
    def error_response(cls, error: str, error_code: Optional[str] = None, duration: float = 0.0):
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
        self.last_failure_time: Optional[float] = None
        self.state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
        self.lock = asyncio.Lock()
    
    async def is_open(self) -> bool:
        """检查熔断器是否开启"""
        async with self.lock:
            if self.state == 'OPEN':
                if self.last_failure_time and time.time() - self.last_failure_time > self.timeout:
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
        
        # 初始化配置常量
        self._init_config()
        
        # 组件初始化
        self.rate_limiter = RateLimiter(getattr(config, 'API_RATE_LIMIT', self.DEFAULT_CONFIG['rate_limit']))
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=getattr(config, 'API_FAILURE_THRESHOLD', self.DEFAULT_CONFIG['failure_threshold']),
            timeout=getattr(config, 'API_CIRCUIT_TIMEOUT', self.DEFAULT_CONFIG['circuit_timeout'])
        )
        
        # API提供商配置
        self.api_configs = {
            ApiProvider.QWEN: {
                'base_url': getattr(config, 'QWEN_BASE_URL', ''),
                'api_key': getattr(config, 'QWEN_API_KEY', ''),
                'model': getattr(config, 'QIANWEN_MODEL_NAME', self.DEFAULT_CONFIG['qwen_model']),
                'max_tokens': getattr(config, 'QWEN_MAX_TOKENS', self.DEFAULT_CONFIG['default_max_tokens']),
                'temperature': getattr(config, 'QWEN_TEMPERATURE', self.DEFAULT_CONFIG['default_temperature'])
            },
            ApiProvider.DEEPSEEK: {
                'base_url': getattr(config, 'DEEPSEEK_BASE_URL', ''),
                'api_key': getattr(config, 'DEEPSEEK_API_KEY', ''),
                'model': getattr(config, 'DEEPSEEK_MODEL_NAME', self.DEFAULT_CONFIG['deepseek_model']),
                'max_tokens': getattr(config, 'DEEPSEEK_MAX_TOKENS', self.DEFAULT_CONFIG['default_max_tokens']),
                'temperature': getattr(config, 'DEEPSEEK_TEMPERATURE', self.DEFAULT_CONFIG['default_temperature'])
            }
        }
        
        self.current_provider = ApiProvider(getattr(config, 'DEFAULT_API_PROVIDER', self.DEFAULT_CONFIG['default_provider']))
        
        # 初始化缓存（如果有Redis客户端）
        self.cache = None
        if hasattr(config, 'redis_client'):
            self.cache = RequestCache(
                redis_client=config.redis_client,
                ttl=getattr(config, 'API_CACHE_TTL', self.DEFAULT_CONFIG['cache_ttl'])
            )
    
    def _init_config(self):
        """初始化配置常量"""
        # 默认配置
        self.DEFAULT_CONFIG = {
            'rate_limit': 60,
            'failure_threshold': 5,
            'circuit_timeout': 60,
            'cache_ttl': 3600,
            'qwen_model': 'qwen-max',
            'deepseek_model': 'deepseek-chat',
            'default_max_tokens': 1000,
            'default_temperature': 0.7,
            'default_provider': 'qwen',
            'default_confidence': 0.9,
            'api_timeout': 120,
            'connect_timeout': 30,
            'tcp_limit': 10,
            'tcp_limit_per_host': 5,
            'dns_cache_ttl': 300
        }
        
        # API路径配置
        self.API_PATHS = {
            'chat_completions': '/chat/completions'
        }
        
        # HTTP头信息配置
        self.HTTP_HEADERS = {
            'content_type': 'application/json',
            'authorization_prefix': 'Bearer '
        }
        
        # 响应字段配置
        self.RESPONSE_FIELDS = {
            'choices': 'choices',
            'message': 'message',
            'content': 'content',
            'usage': 'usage',
            'total_tokens': 'total_tokens',
            'error': 'error',
            'error_message': 'message'
        }
        
        # API版本配置
        self.API_VERSIONS = {
            'qwen': 'qwen-v1',
            'deepseek': 'deepseek-v1',
            'hybrid': 'hybrid-v1'
        }
        
        # 错误代码配置
        self.ERROR_CODES = {
            'circuit_breaker_open': 'CIRCUIT_BREAKER_OPEN',
            'api_exception': 'API_EXCEPTION',
            'unsupported_provider': 'UNSUPPORTED_PROVIDER',
            'timeout': 'TIMEOUT',
            'network_error': 'NETWORK_ERROR'
        }
        
        # 错误消息配置
        self.ERROR_MESSAGES = {
            'circuit_breaker': 'API服务熔断中，请稍后重试',
            'api_exception': 'API调用异常',
            'unsupported_provider': '不支持的API提供商',
            'api_timeout': 'API调用超时',
            'network_error': '网络错误',
            'session_create_error': '无法创建HTTP会话',
            'unknown_error': 'Unknown error'
        }
        
        # 系统提示词配置
        self.SYSTEM_PROMPTS = {
            'default': '你是一个专业的角色提示词生成助手，请根据要求生成高质量的角色内容。',
            'json_generator': '你是一个专业的JSON数据生成器。'
        }
    
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
                    self.ERROR_MESSAGES['circuit_breaker'],
                    self.ERROR_CODES['circuit_breaker_open'],
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
            
            # 特别处理取消异常
            if isinstance(e, asyncio.CancelledError):
                return ApiResponse.error_response(
                    "任务被取消",
                    "CANCELLED",
                    time.time() - start_time
                )
            
            return ApiResponse.error_response(
                f"{self.ERROR_MESSAGES['api_exception']}: {str(e)}",
                self.ERROR_CODES['api_exception'],
                time.time() - start_time
            )
    
    async def _make_api_call(self, task_id: int, command: Dict[str, Any]) -> ApiResponse:
        """实际的API调用"""
        try:
            if self.current_provider == ApiProvider.QWEN:
                provider_config = self.api_configs[ApiProvider.QWEN]
                return await self._call_qwen(task_id, command, provider_config)
            elif self.current_provider == ApiProvider.DEEPSEEK:
                provider_config = self.api_configs[ApiProvider.DEEPSEEK]
                return await self._call_deepseek(task_id, command, provider_config)

            else:
                return ApiResponse.error_response(
                    f"{self.ERROR_MESSAGES['unsupported_provider']}: {self.current_provider}",
                    self.ERROR_CODES['unsupported_provider']
                )
        except Exception as e:
            # 如果API调用出现异常，确保清理会话
            if self.session and not self.session.closed:
                try:
                    await self.session.close()
                    self.session = None
                except:
                    pass
            raise
    
    async def _call_qwen(
        self, task_id: int, command: Dict[str, Any], config: Dict[str, Any]
    ) -> ApiResponse:
        """调用千问API"""
        
        # 直接使用调用方传入的prompt，确保是字符串格式
        prompt_value = command.get('prompt') or command.get('description') or command.get('content')
        if isinstance(prompt_value, dict):
            prompt = json.dumps(prompt_value, ensure_ascii=False, indent=2)
        elif isinstance(prompt_value, str):
            prompt = prompt_value
        else:
            prompt = json.dumps(command, ensure_ascii=False, indent=2)
        
        payload = {
            "model": config['model'],
            "messages": [
                {
                    "role": "system", 
                    "content": self.SYSTEM_PROMPTS['default']
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
            "Authorization": f"{self.HTTP_HEADERS['authorization_prefix']}{config['api_key']}",
            "Content-Type": self.HTTP_HEADERS['content_type']
        }
        
        session = await self._get_session()
        # 为每个请求单独创建超时对象，避免在session级别设置
        try:
            timeout = aiohttp.ClientTimeout(
                total=self.DEFAULT_CONFIG['api_timeout'],
                connect=self.DEFAULT_CONFIG['connect_timeout']
            )
        except Exception as timeout_error:
            logger.error(f"任务 {task_id} 创建超时对象失败: {str(timeout_error)}")
            return ApiResponse.error_response(f"超时设置失败: {str(timeout_error)}", "TIMEOUT_CONFIG_ERROR")
        try:
            async with session.post(
                    f"{config['base_url']}{self.API_PATHS['chat_completions']}",
                    json=payload,
                    headers=headers,
                    timeout=timeout
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        # 提取生成内容
                        generated_content = data[self.RESPONSE_FIELDS['choices']][0][self.RESPONSE_FIELDS['message']][self.RESPONSE_FIELDS['content']]
                        tokens_used = data.get(self.RESPONSE_FIELDS['usage'], {}).get(self.RESPONSE_FIELDS['total_tokens'], 0)
                        
                        return ApiResponse.success_response({
                            'generated_content': generated_content,
                            'confidence': self.DEFAULT_CONFIG['default_confidence'],
                            'tokens_used': tokens_used,
                            'api_version': self.API_VERSIONS['qwen'],
                            'provider': ApiProvider.QWEN.value
                        })
                    
                    else:
                        error_data = await response.json()
                        return ApiResponse.error_response(
                            error_data.get(self.RESPONSE_FIELDS['error'], {}).get(self.RESPONSE_FIELDS['error_message'], self.ERROR_MESSAGES['unknown_error']),
                            str(response.status)
                        )
                        
        except asyncio.TimeoutError:
            return ApiResponse.error_response(self.ERROR_MESSAGES['api_timeout'], self.ERROR_CODES['timeout'])
        except asyncio.CancelledError:
            logger.warning(f"任务 {task_id} 的API调用被取消")
            return ApiResponse.error_response("任务被取消", "CANCELLED")
        except (aiohttp.ClientError, aiohttp.ServerTimeoutError) as e:
            return ApiResponse.error_response(f"{self.ERROR_MESSAGES['network_error']}: {str(e)}", self.ERROR_CODES['network_error'])
        except Exception as e:
            # 捕获所有其他异常，包括超时管理器异常
            logger.error(f"任务 {task_id} API调用异常: {str(e)}")
            return ApiResponse.error_response(f"API调用异常: {str(e)}", "API_EXCEPTION")
    
    async def _call_deepseek(
        self, task_id: int, command: Dict[str, Any], config: Dict[str, Any]
    ) -> ApiResponse:
        """调用DeepSeek API"""
        
        # 直接使用调用方传入的prompt，确保是字符串格式
        prompt_value = command.get('prompt') or command.get('description') or command.get('content')
        if isinstance(prompt_value, dict):
            prompt = json.dumps(prompt_value, ensure_ascii=False, indent=2)
        elif isinstance(prompt_value, str):
            prompt = prompt_value
        else:
            prompt = json.dumps(command, ensure_ascii=False, indent=2)
        
        payload = {
            "model": config['model'],
            "messages": [
                {
                    "role": "system", 
                    "content": self.SYSTEM_PROMPTS['default']
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
            "Authorization": f"{self.HTTP_HEADERS['authorization_prefix']}{config['api_key']}",
            "Content-Type": self.HTTP_HEADERS['content_type']
        }
        
        session = await self._get_session()
        # 为每个请求单独创建超时对象，避免在session级别设置
        try:
            timeout = aiohttp.ClientTimeout(
                total=self.DEFAULT_CONFIG['api_timeout'],
                connect=self.DEFAULT_CONFIG['connect_timeout']
            )
        except Exception as timeout_error:
            logger.error(f"任务 {task_id} 创建超时对象失败: {str(timeout_error)}")
            return ApiResponse.error_response(f"超时设置失败: {str(timeout_error)}", "TIMEOUT_CONFIG_ERROR")
        try:
            async with session.post(
                    f"{config['base_url']}{self.API_PATHS['chat_completions']}",
                    json=payload,
                    headers=headers,
                    timeout=timeout
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        # 提取生成内容
                        generated_content = data[self.RESPONSE_FIELDS['choices']][0][self.RESPONSE_FIELDS['message']][self.RESPONSE_FIELDS['content']]
                        tokens_used = data.get(self.RESPONSE_FIELDS['usage'], {}).get(self.RESPONSE_FIELDS['total_tokens'], 0)
                        
                        return ApiResponse.success_response({
                            'generated_content': generated_content,
                            'confidence': self.DEFAULT_CONFIG['default_confidence'],
                            'tokens_used': tokens_used,
                            'api_version': self.API_VERSIONS['deepseek'],
                            'provider': ApiProvider.DEEPSEEK.value
                        })
                    
                    else:
                        error_data = await response.json()
                        return ApiResponse.error_response(
                            error_data.get(self.RESPONSE_FIELDS['error'], {}).get(self.RESPONSE_FIELDS['error_message'], self.ERROR_MESSAGES['unknown_error']),
                            str(response.status)
                        )
                        
        except asyncio.TimeoutError:
            return ApiResponse.error_response(self.ERROR_MESSAGES['api_timeout'], self.ERROR_CODES['timeout'])
        except asyncio.CancelledError:
            logger.warning(f"任务 {task_id} 的API调用被取消")
            return ApiResponse.error_response("任务被取消", "CANCELLED")
        except (aiohttp.ClientError, aiohttp.ServerTimeoutError) as e:
            return ApiResponse.error_response(f"{self.ERROR_MESSAGES['network_error']}: {str(e)}", self.ERROR_CODES['network_error'])
        except Exception as e:
            # 捕获所有其他异常，包括超时管理器异常
            logger.error(f"任务 {task_id} API调用异常: {str(e)}")
            return ApiResponse.error_response(f"API调用异常: {str(e)}", "API_EXCEPTION")

    async def _get_session(self) -> aiohttp.ClientSession:
        """获取HTTP会话 - 改进版，解决多线程环境下的冲突问题"""
        try:
            # 检查会话是否存在且未关闭
            if self.session is None or self.session.closed:
                # 创建新的会话，完全避免session级别的超时设置
                connector = aiohttp.TCPConnector(
                    limit=self.DEFAULT_CONFIG['tcp_limit'],
                    limit_per_host=self.DEFAULT_CONFIG['tcp_limit_per_host'],
                    ttl_dns_cache=self.DEFAULT_CONFIG['dns_cache_ttl'],
                    use_dns_cache=True,
                    enable_cleanup_closed=True,  # 启用连接清理
                    # 移除force_close和keepalive_timeout的冲突配置
                    # 使用默认的连接复用策略
                )
                
                # 创建session时不设置任何超时参数
                self.session = aiohttp.ClientSession(
                    connector=connector,
                    # 移除timeout参数，完全在请求级别处理超时
                    trust_env=True,  # 信任环境变量
                    cookie_jar=aiohttp.CookieJar()  # 使用独立的cookie jar
                )
                
                logger.debug(f"为线程创建了新的HTTP会话")
            return self.session
        except Exception as e:
            # 如果创建会话失败，确保清理状态
            if hasattr(self, 'session'):
                self.session = None
            error_msg = f"{self.ERROR_MESSAGES['session_create_error']}: {str(e)}"
            logger.error(error_msg)
            raise RuntimeError(error_msg)
    
    async def close(self):
        """关闭客户端"""
        if self.session and not self.session.closed:
            try:
                await self.session.close()
                # 等待底层连接关闭
                await asyncio.sleep(0.1)
            except Exception as e:
                # 记录警告但不抛出异常，避免影响主流程
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"关闭HTTP会话时发生错误: {str(e)}")
            finally:
                self.session = None
    
    def set_provider(self, provider: ApiProvider):
        """设置API提供商"""
        self.current_provider = provider
    
    def get_provider_config(self, provider: Optional[ApiProvider] = None) -> Dict[str, Any]:
        """获取提供商配置"""
        provider = provider or self.current_provider
        return self.api_configs.get(provider, {})