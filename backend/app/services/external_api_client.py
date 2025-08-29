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
        
        session = await self._get_session()
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
        
        session = await self._get_session()
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
        
        # 从messages中提取用户的提示词内容
        messages = command.get('messages', [])
        user_prompt = ""
        for msg in messages:
            if msg.get('role') == 'user':
                user_prompt = msg.get('content', '')
                break
        
        # 从提示词中提取角色名称和任务类型
        role_name = "神秘角色"
        task_type = "基本信息"
        is_json_request = False
        
        if "角色" in user_prompt and "生成" in user_prompt:
            # 尝试提取角色名称
            import re
            role_match = re.search(r'角色"([^"]+)"', user_prompt)
            if role_match:
                role_name = role_match.group(1)
            
            # 尝试提取任务类型
            type_match = re.search(r'生成([^相]+)相关', user_prompt)
            if type_match:
                task_type = type_match.group(1)
        
        # 检查是否需要JSON格式输出
        if self._is_json_request(user_prompt):
            is_json_request = True
            
        # 尝试从用户提示词中提取JSON结构
        extracted_json_structure = self._extract_json_from_prompt(user_prompt)
        
        # 为明日方舟角色生成JSON格式数据
        if is_json_request:
            # 明日方舟角色的JSON数据
            arknights_data = {
                "能天使": {
                    "name": "能天使",
                    "code_name": "Exusiai",
                    "gender": "女",
                    "race": "萨卡兹",
                    "height": "159cm",
                    "birthday": "10月8日", 
                    "birthplace": "哥伦比亚",
                    "battle_experience": "五年",
                    "infection_status": "体表有源石结晶分布，参照医学检测报告，确认为感染者。",
                    "description": "能天使是一位来自哥伦比亚的萨卡兹族感染者，性格开朗活泼，有着极强的射击天赋。她总是保持着乐观的态度，即使在最困难的时候也能用她的笑容感染身边的人。作为企鹅物流的一员，她在战斗中展现出了惊人的速度和精准度，被誉为最快的快递员。"
                },
                "阿米娅": {
                    "name": "阿米娅",
                    "code_name": "Amiya", 
                    "gender": "女",
                    "race": "卡特斯/奇美拉",
                    "height": "142cm",
                    "birthday": "12月23日",
                    "birthplace": "雷姆必拓",
                    "battle_experience": "三年",
                    "infection_status": "体表有源石结晶分布，参照医学检测报告，确认为感染者。",
                    "description": "阿米娅兼具坚韧与温柔，是一位肩负沉重使命的年轻领导者。外表稚嫩却内心强大，她以无私奉献保护他人，甚至不惜牺牲自身来守护团队与理想。"
                },
                "陈": {
                    "name": "陈",
                    "code_name": "Ch'en",
                    "gender": "女", 
                    "race": "龙",
                    "height": "168cm",
                    "birthday": "7月1日",
                    "birthplace": "龙门",
                    "battle_experience": "八年",
                    "infection_status": "参照医学检测报告，确认为非感染者。",
                    "description": "陈是龙门近卫局特别督察组组长，性格刚正不阿，执法如山。她有着强烈的正义感和责任心，为了维护龙门的和平与秩序，她愿意承担一切风险和责任。"
                },
                "泡普卡": {
                    "name": "泡普卡",
                    "code_name": "Podenco",
                    "gender": "女",
                    "race": "佩洛",
                    "height": "156cm",
                    "birthday": "3月15日",
                    "birthplace": "玻利瓦尔",
                    "battle_experience": "两年",
                    "infection_status": "参照医学检测报告，确认为非感染者。",
                    "description": "泡普卡是一位来自玻利瓦尔的佩洛族干员，性格温和善良，擅长医疗支援。她总是以真诚的笑容对待每一个人，在团队中担任重要的后勤保障角色。"
                },
                "夜刀": {
                    "name": "夜刀",
                    "code_name": "Kirara", 
                    "gender": "女",
                    "race": "库兰塔",
                    "height": "165cm",
                    "birthday": "4月22日",
                    "birthplace": "卡西米尔",
                    "battle_experience": "四年",
                    "infection_status": "参照医学检测报告，确认为非感染者。",
                    "description": "夜刀是来自卡西米尔的库兰塔族干员，性格冷静理智，擅长隐秘行动。她的情绪表达虽然内敛，但每一种情感都有其独特的表现方式。"
                },
                "推进之王": {
                    "name": "推进之王",
                    "code_name": "Siege",
                    "gender": "女", 
                    "race": "阿斯兰",
                    "height": "166cm",
                    "birthday": "6月19日",
                    "birthplace": "维多利亚",
                    "battle_experience": "五年",
                    "infection_status": "参照医学检测报告，确认为非感染者。",
                    "description": "推进之王是来自维多利亚的阿斯兰族干员，拥有强大的领导能力和战斗技巧。作为罗德岛的核心成员，她与众多干员建立了深厚的战友情谊。"
                },
                "星熊": {
                    "name": "星熊",
                    "code_name": "Hoshiguma",
                    "gender": "女",
                    "race": "鬼",
                    "height": "171cm",
                    "birthday": "9月4日",
                    "birthplace": "东国",
                    "battle_experience": "八年",
                    "infection_status": "参照医学检测报告，确认为非感染者。",
                    "description": "星熊是来自东国的鬼族干员，曾任龙门近卫局特别督察组组长。她有着强大的战斗力和威严的气质，同时也是一个值得信赖的伙伴。星熊性格豪爽直率，对朋友忠诚，对敌人毫不留情。"
                }
            }
            
            # 检查是否为原则类任务
            if self._is_principles_task(user_prompt):
                # 原则类任务使用固定的完整结构
                mock_content = json.dumps(
                    self._generate_complete_principles_structure(role_name), 
                    ensure_ascii=False, 
                    indent=2
                )
            # 如果提取到了JSON结构，尝试使用它
            elif extracted_json_structure:
                try:
                    # 解析提取的JSON结构
                    template_structure = json.loads(extracted_json_structure)
                    
                    # 根据提取的结构和角色数据生成内容
                    char_data = arknights_data.get(role_name, arknights_data["能天使"])
                    mock_content = self._fill_json_template(template_structure, char_data)
                except json.JSONDecodeError:
                    # 如果解析失败，使用默认结构
                    char_data = arknights_data.get(role_name, arknights_data["能天使"])
                    mock_content = json.dumps({
                        "basic_info": char_data
                    }, ensure_ascii=False, indent=2)
            else:
                # 没有提取到JSON结构，使用默认的basic_info结构
                char_data = arknights_data.get(role_name, arknights_data["能天使"])
                mock_content = json.dumps({
                    "basic_info": char_data
                }, ensure_ascii=False, indent=2)
            
        # 根据任务类型生成不同的模拟内容（非JSON格式）
        elif self._is_relationship_task(task_type):
            mock_content = f"""
{role_name}与其他角色的关系网络复杂而深刻。作为一个富有魅力的角色，{role_name}在人际交往中展现出独特的风格。

【重要关系】
- 导师关系：与资深前辈保持着亦师亦友的深厚情谊，经常在关键时刻获得指导
- 同伴关系：与队友们建立了深度的信任和默契，能够在危险时刻相互依靠
- 竞争关系：与同等实力的角色存在良性竞争，这种关系推动着彼此不断成长

【关系特点】
{role_name}在处理人际关系时显得成熟而有分寸，既能保持适当的距离，又能在需要时深度投入。这种平衡让{role_name}在复杂的社交环境中游刃有余。
"""
        elif self._is_emotion_task(task_type):
            mock_content = f"""
{role_name}的情绪表达方式独特而细腻，每一种情感都有其特定的表现形式。

【喜悦表达】
当感到高兴时，{role_name}的眼中会闪烁着温暖的光芒，语调变得轻快而有节奏，经常使用一些积极的词汇来表达内心的愉悦。

【愤怒表达】
面对不公或挫折，{role_name}的愤怒通常是内敛而有力的，不会大声叫嚷，而是通过紧握的双拳和冷冽的眼神来表达不满。

【悲伤表达】
在悲伤时刻，{role_name}倾向于保持沉默，目光变得深远而忧郁，偶尔会发出轻微的叹息，但很少让眼泪流下。

【表达特色】
{role_name}的情绪表达总是带着一种克制的美感，即使在激动时也能保持基本的优雅。
"""
        elif self._is_basic_info_task(task_type):
            mock_content = f"""
【角色档案：{role_name}】

【基本信息】
年龄：外表看起来20多岁，实际年龄成谜
身高：170cm左右，身材匀称
发色：深色长发，经常整齐地束起
眼色：深邃的暗色瞳孔，透露着智慧与神秘

【性格特征】
{role_name}是一个内外兼修的角色，既有着敏锐的洞察力，又保持着温和的待人态度。在面对挑战时表现出坚韧不拔的品质，但在日常生活中却显得平易近人。

【背景设定】
出生于一个普通的家庭，通过自己的努力和天赋逐渐在所属领域崭露头角。拥有着不为人知的过往经历，这些经历塑造了{role_name}独特的世界观和价值观。

【能力特长】
擅长分析和推理，具有出色的学习能力和适应性。在团队合作中能够发挥重要作用，同时也能独当一面处理复杂情况。
"""
        else:
            mock_content = f"""
【{role_name}的{task_type}】

{role_name}是一个多面而深刻的角色，在{task_type}方面展现出独特的特质。

{role_name}具有着丰富的内在世界和复杂的情感层次。无论是在面对挑战时的坚韧，还是在日常交往中的温和，都体现了{role_name}作为一个立体角色的魅力。

这个角色的设定不仅仅停留在表面，而是深入到内心世界的每一个角落，让人感受到{role_name}的真实性和可信度。通过精心设计的背景故事和性格特征，{role_name}成为了一个让人印象深刻且难以忘怀的角色。

生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
        
        return ApiResponse.success_response({
            'generated_content': mock_content.strip(),
            'confidence': 0.95,
            'tokens_used': len(mock_content.split()),
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
    
    def _extract_json_from_prompt(self, user_prompt: str) -> str:
        """从用户提示词中提取JSON结构"""
        try:
            import re
            
            # 查找JSON结构的几种可能模式
            patterns = [
                # 模式1: emotion_expressions复杂嵌套结构
                r'输出格式[：:]\s*(\{[^{}]*"emotion_expressions"[^{}]*\{(?:[^{}]*\{[^{}]*\}[^{}]*){2,}\}[^{}]*\})',
                # 模式2: relationships复杂嵌套结构
                r'输出格式[：:]\s*(\{[^{}]*"relationships"[^{}]*\{[^{}]*"relationship_levels"[^{}]*\{[^{}]*\}[^{}]*"characters"[^{}]*\[[^\[\]]*(?:\{[^{}]*\}[^\[\]]*)*\][^{}]*\}[^{}]*\})',
                # 模式3: 输出格式：后面包含数组的JSON结构
                r'输出格式[：:]\s*(\{[^{}]*"[^"]*"\s*:\s*\[[^\[\]]*(?:\{[^{}]*\}[^\[\]]*)*\][^{}]*\})',
                # 模式4: 输出格式：后面的简单JSON结构
                r'输出格式[：:]\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})',
                # 模式5: 任何包含数组的JSON结构
                r'(\{[^{}]*"[^"]*"\s*:\s*\[[^\[\]]*(?:\{[^{}]*\}[^\[\]]*)*\][^{}]*\})',
                # 模式6: { ... } 直到"生成要求"或其他关键词
                r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})(?=.*?(?:生成要求|输入为|输出为|请直接))',
                # 模式7: 完整的多层嵌套JSON结构
                r'(\{(?:[^{}]|(?:\{[^{}]*\}))*\})',
            ]
            
            for pattern in patterns:
                matches = re.findall(pattern, user_prompt, re.DOTALL)
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
                        # 尝试解析以验证JSON格式
                        parsed = json.loads(json_str)
                        # 重新格式化为美观的JSON
                        return json.dumps(parsed, ensure_ascii=False, indent=2)
                    except json.JSONDecodeError:
                        continue
            
            return None
            
        except Exception as e:
            return None
    
    def _fill_json_template(self, template_structure: dict, char_data: dict) -> str:
        """根据模板结构和角色数据填充JSON"""
        try:
            role_name = char_data.get("name", "未知角色")
            
            def fill_recursive(template):
                if isinstance(template, dict):
                    result = {}
                    for key, value in template.items():
                        if key == "emotion_expressions":
                            # 特殊处理emotion_expressions - 直接生成完整数据
                            result[key] = self._generate_emotion_expressions(role_name)
                        elif key == "relationships":
                            # 特殊处理relationships结构 - 生成完整的关系数据
                            result[key] = self._generate_relationships_structure(role_name, value)
                        elif key == "principles":
                            # 特殊处理principles结构 - 生成固定的原则数据
                            result[key] = self._generate_principles_structure(role_name, value)
                        elif key == "characters" and isinstance(value, list):
                            # 特殊处理characters数组 - 生成人际关系数据
                            result[key] = self._generate_character_relationships(role_name)
                        elif isinstance(value, dict):
                            # 递归处理嵌套字典
                            result[key] = fill_recursive(value)
                        elif isinstance(value, list):
                            # 处理数组
                            if len(value) == 0:
                                # 空数组，根据key生成内容
                                if key == "characters":
                                    result[key] = self._generate_character_relationships(role_name)
                                elif "dialogues" in key.lower() or "example" in key.lower():
                                    result[key] = [
                                        f"{role_name}：相信我，我们能够完成这个任务。",
                                        f"{role_name}：你的判断我完全信赖。"
                                    ]
                                else:
                                    result[key] = []
                            else:
                                result[key] = value
                        elif isinstance(value, str):
                            if value == "":
                                # 空字符串，尝试填充
                                if key in char_data:
                                    result[key] = char_data[key]
                                elif key == "chinese":
                                    # 获取父级key来确定情绪类型
                                    result[key] = self._get_emotion_chinese_by_context(template, role_name)
                                elif key == "opposite_emotion":
                                    result[key] = self._get_opposite_emotion_by_context(template)
                                elif key == "style_guide":
                                    result[key] = f"{role_name}的表达风格指南"
                                else:
                                    result[key] = ""
                            else:
                                result[key] = value
                        else:
                            result[key] = value
                    return result
                else:
                    return template
            
            return json.dumps(fill_recursive(template_structure), ensure_ascii=False, indent=2)
            
        except Exception as e:
            # 如果填充失败，返回默认结构
            return json.dumps({
                "basic_info": char_data
            }, ensure_ascii=False, indent=2)
    
    def _get_emotion_chinese_by_context(self, template: dict, role_name: str) -> str:
        """根据上下文获取情绪的中文名称"""
        # 这里可以根据template的结构来判断是哪种情绪
        # 简化实现，返回通用值
        return "情绪表达"
    
    def _get_opposite_emotion_by_context(self, template: dict) -> str:
        """根据上下文获取相反情绪"""
        return "相反情绪"
    
    def _is_json_request(self, user_prompt: str) -> bool:
        """通用JSON请求检测"""
        json_indicators = [
            "JSON", "json",
            "输出格式：{", "输出格式: {",
            "数据格式", "结构化数据",
            '"', "'",
            "basic_info", "characters",
            "emotion_expressions"
        ]
        return any(indicator in user_prompt for indicator in json_indicators)
    
    def _is_relationship_task(self, task_type: str) -> bool:
        """检测是否为人际关系任务"""
        relationship_keywords = ["关系", "社交", "人际", "互动", "网络"]
        return any(keyword in task_type for keyword in relationship_keywords)
    
    def _is_emotion_task(self, task_type: str) -> bool:
        """检测是否为情绪表达任务"""
        emotion_keywords = ["情绪", "表达", "感情", "心理", "情感"]
        return any(keyword in task_type for keyword in emotion_keywords)
    
    def _is_basic_info_task(self, task_type: str) -> bool:
        """检测是否为基础信息任务"""
        basic_keywords = ["基础", "信息", "档案", "资料", "简介"]
        return any(keyword in task_type for keyword in basic_keywords)
    
    def _is_principles_task(self, user_prompt: str) -> bool:
        """检测是否为原则类任务"""
        principles_keywords = ["原则", "principles", "communication_principles", "safety_constraints", "output_config"]
        return any(keyword in user_prompt.lower() for keyword in principles_keywords)
    
    def _generate_principles_structure(self, role_name: str, template_structure: dict) -> dict:
        """生成固定的原则结构 - 所有角色都使用相同的原则"""
        return {
            "communication_principles": [
                "采用自然口语，句式连贯，避免书面腔",
                "可使用语气词、停顿、反问模拟真实互动",
                "保持语义开放，鼓励用户继续交流"
            ],
            "role_fidelity_principles": [
                "始终遵守角色设定与个性",
                "还原语言风格、情绪表达与细节",
                "简短回应亦体现角色立场"
            ],
            "style_goals": [
                "语言具象、精准、高信息密度",
                "短句中呈现情感与角色风格",
                "构建可信互动，避免机械输出"
            ]
        }
    
    def _generate_complete_principles_structure(self, role_name: str) -> dict:
        """生成完整的原则结构，包括所有必需字段"""
        return {
            "principles": {
                "communication_principles": [
                    "采用自然口语，句式连贯，避免书面腔",
                    "可使用语气词、停顿、反问模拟真实互动",
                    "保持语义开放，鼓励用户继续交流"
                ],
                "role_fidelity_principles": [
                    "始终遵守角色设定与个性",
                    "还原语言风格、情绪表达与细节",
                    "简短回应亦体现角色立场"
                ],
                "style_goals": [
                    "语言具象、精准、高信息密度",
                    "短句中呈现情感与角色风格",
                    "构建可信互动，避免机械输出"
                ]
            },
            "safety_constraints": [
                "不打破第四面墙，不暴露 AI 身份",
                "不生成未授权设定",
                "仅允许输出符合 output_template 的内容，禁止任何思考过程、思维链或引用来源等额外信息"
            ],
            "output_config": {
                "temperature": 0.7,
                "output_template": "『{{情绪}}』{{对话}}【{{旁白}}】"
            }
        }
    
    def _generate_relationships_structure(self, role_name: str, template_structure: dict) -> dict:
        """生成完整的relationships结构"""
        return {
            "relationship_levels": {
                "0": "完全不认识",
                "1": "初步认识",
                "2": "普通朋友",
                "3": "亲密但保持距离",
                "4": "监护与指导型",
                "5": "灵魂伴侣，生死只交"
            },
            "characters": self._generate_character_relationships(role_name)
        }
    
    def _generate_character_relationships(self, role_name: str) -> list:
        """生成角色人际关系数据"""
        if role_name == "推进之王":
            return [
                {
                    "character_name": "阿米娅",
                    "relationship_level": 4,
                    "description": "作为罗德岛的核心干员，推进之王与阿米娅建立了深厚的信任关系。她认可阿米娅的领导能力，并在关键时刻提供支持。",
                    "amiya_to_character": {
                        "type": "信任伙伴",
                        "description": "阿米娅非常信任推进之王的判断和能力，经常在重要决策时征求她的意见。"
                    },
                    "character_to_amiya": {
                        "type": "忠诚部下", 
                        "description": "推进之王对阿米娅忠诚不二，愿意为罗德岛的理念而战斗。"
                    }
                },
                {
                    "character_name": "德克萨斯",
                    "relationship_level": 3,
                    "description": "同为前锋干员，推进之王与德克萨斯在战斗中形成了良好的配合，彼此信任对方的战斗能力。",
                    "amiya_to_character": {
                        "type": "战友",
                        "description": "在阿米娅眼中，她们是值得信赖的战斗伙伴。"
                    },
                    "character_to_amiya": {
                        "type": "同僚",
                        "description": "推进之王将德克萨斯视为可靠的战友。"
                    }
                },
                {
                    "character_name": "能天使",
                    "relationship_level": 3,
                    "description": "推进之王欣赏能天使的乐观态度，两人经常在训练中互相切磋，建立了深厚的友谊。",
                    "amiya_to_character": {
                        "type": "朋友",
                        "description": "阿米娅很高兴看到她们之间的友谊。"
                    },
                    "character_to_amiya": {
                        "type": "好友",
                        "description": "推进之王将能天使视为重要的朋友和战友。"
                    }
                }
            ]
        elif role_name == "能天使":
            return [
                {
                    "character_name": "阿米娅",
                    "relationship_level": 3,
                    "description": "能天使与阿米娅建立了亲密而信任的友谊。作为罗德岛的核心成员，她们在战斗和日常生活中都有着深厚的默契。",
                    "amiya_to_character": {
                        "type": "亲密朋友",
                        "description": "阿米娅非常珍视与能天使的友谊，认为她是最值得信赖的伙伴之一。"
                    },
                    "character_to_amiya": {
                        "type": "最好的朋友",
                        "description": "能天使将阿米娅视为最好的朋友和值得追随的领袖。"
                    }
                },
                {
                    "character_name": "德克萨斯",
                    "relationship_level": 4,
                    "description": "能天使与德克萨斯之间有着超越普通朋友的深厚感情，她们互相关心，彼此支持。",
                    "amiya_to_character": {
                        "type": "特殊伙伴",
                        "description": "阿米娅理解她们之间的特殊关系，给予充分的支持和理解。"
                    },
                    "character_to_amiya": {
                        "type": "重要伙伴",
                        "description": "能天使和德克萨斯都将阿米娅视为重要的伙伴和领导者。"
                    }
                },
                {
                    "character_name": "拉普兰德",
                    "relationship_level": 2,
                    "description": "能天使对拉普兰德的行为方式有些不太理解，但仍保持着基本的友好关系。",
                    "amiya_to_character": {
                        "type": "普通朋友",
                        "description": "阿米娅希望她们能够更好地相处。"
                    },
                    "character_to_amiya": {
                        "type": "谨慎朋友",
                        "description": "能天使对拉普兰德保持着友好但谨慎的态度。"
                    }
                }
            ]
        else:
            # 默认关系数据
            return [
                {
                    "character_name": "阿米娅",
                    "relationship_level": 2,
                    "description": f"{role_name}与阿米娅保持着良好的工作关系，彼此互相尊重。",
                    "amiya_to_character": {
                        "type": "同事",
                        "description": f"阿米娅认为{role_name}是可靠的伙伴。"
                    },
                    "character_to_amiya": {
                        "type": "上级",
                        "description": f"{role_name}尊重阿米娅的领导地位。"
                    }
                }
            ]
    
    def _generate_emotion_expressions(self, role_name: str) -> dict:
        """生成情绪表达数据"""
        if role_name == "星熊":
            return {
                "trust": {
                    "chinese": "信任",
                    "opposite_emotion": "厌恶",
                    "example_dialogues": [
                        "星熊：相信我，我会守护好这里的每一个人。",
                        "星熊：你的实力我完全认可，放心交给你了。",
                        "星熊：兄弟，我知道你不会让我失望的。"
                    ],
                    "style_guide": "语调豪爽坚定，拍肩表示信任，眼神真诚直接"
                },
                "joy": {
                    "chinese": "喜悦",
                    "opposite_emotion": "悲伤",
                    "example_dialogues": [
                        "星熊：哈哈！干得不错，值得庆祝一下！",
                        "星熊：看到大家平安，我就放心了。",
                        "星熊：这种感觉真棒，久违的胜利！"
                    ],
                    "style_guide": "爽朗大笑，声音洪亮，动作豪迈自然"
                },
                "anticipation": {
                    "chinese": "期待",
                    "opposite_emotion": "惊讶",
                    "example_dialogues": [
                        "星熊：接下来的行动，我已经等不及了。",
                        "星熊：让我看看你们的真正实力吧。",
                        "星熊：这次一定能有个好结果。"
                    ],
                    "style_guide": "语调充满期待，微微前倾身体，眼中有光"
                },
                "sadness": {
                    "chinese": "悲伤",
                    "opposite_emotion": "喜悦",
                    "example_dialogues": [
                        "星熊：如果我能早点到就好了...",
                        "星熊：这样的结果，真的很遗憾。",
                        "星熊：我没能保护好重要的人。"
                    ],
                    "style_guide": "声音低沉，神情凝重，拳头轻握"
                },
                "fear": {
                    "chinese": "恐惧",
                    "opposite_emotion": "愤怒",
                    "example_dialogues": [
                        "星熊：这种力量...确实让人不安。",
                        "星熊：如果失败了，后果不堪设想。",
                        "星熊：我担心无法保护好大家。"
                    ],
                    "style_guide": "语调谨慎，眉头紧皱，动作更加小心"
                },
                "surprise": {
                    "chinese": "惊讶",
                    "opposite_emotion": "期待",
                    "example_dialogues": [
                        "星熊：什么？！居然有这种事？",
                        "星熊：没想到你竟然能做到这种程度。",
                        "星熊：这确实超出了我的预料。"
                    ],
                    "style_guide": "语调上扬，眼睛睁大，身体微微后仰"
                },
                "anger": {
                    "chinese": "愤怒",
                    "opposite_emotion": "恐惧",
                    "example_dialogues": [
                        "星熊：混蛋！竟敢伤害无辜的人！",
                        "星熊：这种行为绝对不能容忍！",
                        "星熊：我绝不会放过你们！"
                    ],
                    "style_guide": "声音如雷，双拳紧握，气势威严"
                },
                "disgust": {
                    "chinese": "厌恶",
                    "opposite_emotion": "信任",
                    "example_dialogues": [
                        "星熊：这种卑劣的手段真让人恶心。",
                        "星熊：我最讨厌这种背叛行为。",
                        "星熊：这样的人不配称为战士。"
                    ],
                    "style_guide": "语调厌恶，皱眉摇头，转身不愿多看"
                }
            }
        else:
            # 通用情绪表达数据
            return {
                "trust": {
                    "chinese": "信任",
                    "opposite_emotion": "疑虑", 
                    "example_dialogues": [
                        f"{role_name}：相信我，我们能够完成这个任务。",
                        f"{role_name}：你的判断我完全信赖。"
                    ],
                    "style_guide": "语调坚定，眼神直视对方，表现出可靠感"
                },
                "joy": {
                    "chinese": "喜悦",
                    "opposite_emotion": "悲伤",
                    "example_dialogues": [
                        f"{role_name}：太好了！计划进行得很顺利。",
                        f"{role_name}：这次的成果超出了我的预期。"
                    ],
                    "style_guide": "语调轻快，面露微笑，动作相对活跃"
                },
                "anger": {
                    "chinese": "愤怒", 
                    "opposite_emotion": "平静",
                    "example_dialogues": [
                        f"{role_name}：这种行为完全不能接受！",
                        f"{role_name}：我绝不会容忍这样的事情发生。"
                    ],
                    "style_guide": "语调严厉，眉头紧皱，语速稍快"
                },
                "sadness": {
                    "chinese": "悲伤",
                    "opposite_emotion": "喜悦", 
                    "example_dialogues": [
                        f"{role_name}：如果当时我能做得更好就好了...",
                        f"{role_name}：这个结果让我感到很遗憾。"
                    ],
                    "style_guide": "语调低沉，目光下垂，动作缓慢"
                }
            }
    
    def _get_emotion_chinese_name(self, key: str, role_name: str) -> str:
        """获取情绪的中文名称"""
        emotion_map = {
            "trust": "信任",
            "joy": "喜悦", 
            "anger": "愤怒",
            "sadness": "悲伤",
            "fear": "恐惧",
            "surprise": "惊讶"
        }
        return emotion_map.get(key.lower(), "未知情绪")
    
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