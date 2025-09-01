#!/bin/bash

# 启动支持外部IP访问的开发环境
# 使用方法: ./start-dev-external.sh

echo "正在启动支持外部IP 8.149.132.119 访问的开发环境..."

# 检查Docker是否运行
if ! docker info > /dev/null 2>&1; then
    echo "错误: Docker未运行，请先启动Docker"
    exit 1
fi

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "警告: .env文件不存在，请确保已正确配置环境变量"
fi

# 停止现有服务
echo "停止现有服务..."
docker-compose down

# 启动服务
echo "启动服务..."
docker-compose -f docker-compose.yml -f docker-compose.8149132119.yml up -d

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 显示服务状态
echo "服务状态:"
docker-compose ps

echo ""
echo "=================================="
echo "开发环境已启动，可通过以下地址访问:"
echo "前端: http://8.149.132.119:5173/"
echo "后端API: http://8.149.132.119:8000/"
echo "API文档: http://8.149.132.119:8000/docs"
echo "数据库管理: http://8.149.132.119:8080/"
echo "=================================="
echo ""
echo "本地地址仍然可用:"
echo "前端: http://localhost:5173/"
echo "后端API: http://localhost:8000/"
echo "=================================="