#!/bin/bash
# 快速重启后端以应用CORS配置

echo "🔄 重启后端服务以应用CORS配置..."

# 杀死现有的后端进程
echo "⏹️  停止现有后端进程..."
pkill -f "fastapi run"
pkill -f "uvicorn"
sleep 2

# 启动后端
echo "🚀 启动后端服务..."
cd "$(dirname "$0")/backend"

# 设置环境变量
export BACKEND_CORS_ORIGINS="http://localhost:5173,http://8.149.132.119:5173,http://172.23.57.43:5173,http://192.168.2.201:5173"

# 启动FastAPI
fastapi run --reload app/main.py --host 0.0.0.0 --port 8000 &

echo "✅ 后端已重启，CORS配置已应用"
echo "🌐 后端地址: http://8.149.132.119:8000"
echo "📚 API文档: http://8.149.132.119:8000/docs"