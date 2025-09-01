#!/usr/bin/env python3
"""
AI API 配置设置脚本
"""
import os
import sys
from pathlib import Path

def setup_ai_api():
    """设置AI API配置"""
    print("🚀 AI API 配置设置")
    print("=" * 50)
    
    # 获取项目根目录
    project_root = Path(__file__).parent.parent
    env_file = project_root / ".env"
    
    print(f"配置文件路径: {env_file}")
    
    # 检查是否已存在.env文件
    if env_file.exists():
        print("✅ 发现现有的 .env 文件")
        with open(env_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if 'QWEN_API_KEY' in content or 'DEEPSEEK_API_KEY' in content:
                print("⚠️  检测到已有AI API配置")
                choice = input("是否要更新配置？(y/N): ").lower()
                if choice != 'y':
                    print("❌ 取消配置更新")
                    return
    
    print("\n请选择要配置的AI API提供商:")
    print("1. 千问 (Qwen)")
    print("2. DeepSeek")
    print("3. 两者都配置")
    
    choice = input("请输入选择 (1/2/3): ").strip()
    
    config_lines = []
    
    # 基础配置
    base_config = """# 本地开发环境配置

# ======================
# 基础配置
# ======================
DOMAIN=localhost
FRONTEND_HOST=http://localhost:5173
ENVIRONMENT=local

# ======================
# 数据库配置
# ======================
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_DB=app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changethis

# ======================
# 后端安全配置
# ======================
SECRET_KEY=changethis-local-secret-key
BACKEND_CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

# ======================
# 超级用户配置
# ======================
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=changethis

# ======================
# 项目名称
# ======================
PROJECT_NAME=FullStack FastAPI

# ======================
# AI API 配置
# ======================
"""
    
    config_lines.append(base_config)
    
    if choice in ['1', '3']:
        # 配置千问
        print("\n🔧 配置千问 API")
        qwen_key = input("请输入千问 API Key: ").strip()
        if qwen_key:
            config_lines.append(f"""# 千问配置
DEFAULT_API_PROVIDER=qwen
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_API_KEY={qwen_key}
QIANWEN_MODEL_NAME=qwen-max
QWEN_MAX_TOKENS=2000
QWEN_TEMPERATURE=0.7
""")
        else:
            print("⚠️  未输入千问 API Key，跳过配置")
    
    if choice in ['2', '3']:
        # 配置DeepSeek
        print("\n🔧 配置 DeepSeek API")
        deepseek_key = input("请输入 DeepSeek API Key: ").strip()
        if deepseek_key:
            if choice == '2':  # 只配置DeepSeek
                config_lines.append("DEFAULT_API_PROVIDER=deepseek\n")
            config_lines.append(f"""# DeepSeek配置
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_API_KEY={deepseek_key}
DEEPSEEK_MODEL_NAME=deepseek-chat
DEEPSEEK_MAX_TOKENS=2000
DEEPSEEK_TEMPERATURE=0.7
""")
        else:
            print("⚠️  未输入 DeepSeek API Key，跳过配置")
    
    # 添加其他配置
    other_config = """
# API限流配置
API_RATE_LIMIT=60
API_FAILURE_THRESHOLD=5
API_CIRCUIT_TIMEOUT=60
API_CACHE_TTL=3600

# ======================
# Redis配置 (用于任务队列)
# ======================
REDIS_URL=redis://localhost:6379/0
RQ_QUEUE_NAME=ai_tasks

# ======================
# 批次执行配置
# ======================
BATCH_MAX_CONCURRENT=5
BATCH_TIMEOUT_MINUTES=120
BATCH_RETRY_ATTEMPTS=3
"""
    config_lines.append(other_config)
    
    # 写入配置文件
    try:
        with open(env_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(config_lines))
        print(f"\n✅ 配置文件已创建: {env_file}")
        print("\n📝 下一步:")
        print("1. 重启后端服务以加载新配置")
        print("2. 测试AI API调用是否正常工作")
        
        # 显示当前配置
        print(f"\n📋 当前配置:")
        if choice in ['1', '3']:
            print("- 千问 API: 已配置")
        if choice in ['2', '3']:
            print("- DeepSeek API: 已配置")
            
    except Exception as e:
        print(f"❌ 创建配置文件失败: {e}")
        return False
    
    return True

def test_api_config():
    """测试API配置"""
    print("\n🧪 测试AI API配置")
    print("=" * 30)
    
    try:
        # 导入配置
        sys.path.append(str(Path(__file__).parent / "app"))
        from app.core.config import settings
        
        print(f"默认API提供商: {settings.DEFAULT_API_PROVIDER}")
        
        if settings.DEFAULT_API_PROVIDER == "qwen":
            if settings.QWEN_API_KEY:
                print("✅ 千问 API Key: 已配置")
                print(f"   模型: {settings.QIANWEN_MODEL_NAME}")
                print(f"   Base URL: {settings.QWEN_BASE_URL}")
            else:
                print("❌ 千问 API Key: 未配置")
                
        elif settings.DEFAULT_API_PROVIDER == "deepseek":
            if settings.DEEPSEEK_API_KEY:
                print("✅ DeepSeek API Key: 已配置")
                print(f"   模型: {settings.DEEPSEEK_MODEL_NAME}")
                print(f"   Base URL: {settings.DEEPSEEK_BASE_URL}")
            else:
                print("❌ DeepSeek API Key: 未配置")
        
        return True
        
    except Exception as e:
        print(f"❌ 测试配置失败: {e}")
        return False

if __name__ == "__main__":
    print("🤖 FullStack FastAPI - AI API 配置工具")
    print("=" * 60)
    
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        test_api_config()
    else:
        if setup_ai_api():
            test_api_config()
