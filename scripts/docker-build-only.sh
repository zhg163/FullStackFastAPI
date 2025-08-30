#!/usr/bin/env bash

# Docker镜像构建脚本（无推送功能）
# 只构建本地镜像，不推送到远程仓库

set -e

# 默认配置
DEFAULT_TAG="latest"
DEFAULT_PROJECT_NAME="fullstack-fastapi"

# 从环境变量或参数获取配置
TAG=${TAG:-$DEFAULT_TAG}
PROJECT_NAME=${PROJECT_NAME:-$DEFAULT_PROJECT_NAME}

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示配置信息
print_info "=== Docker 本地镜像构建 ==="
print_info "项目名称: $PROJECT_NAME"
print_info "标签版本: $TAG"
print_info "后端镜像: $PROJECT_NAME-backend:$TAG"
print_info "前端镜像: $PROJECT_NAME-frontend:$TAG"
print_info "注意: 只构建本地镜像，不推送到远程仓库"
echo

# 检查必要文件
if [ ! -f "backend/Dockerfile" ]; then
    print_error "backend/Dockerfile 不存在"
    exit 1
fi

if [ ! -f "frontend/Dockerfile" ]; then
    print_error "frontend/Dockerfile 不存在"
    exit 1
fi

# 构建镜像
print_info "开始构建镜像..."

# 构建后端镜像
print_info "构建后端镜像..."
docker build -t $PROJECT_NAME-backend:$TAG -t $PROJECT_NAME-backend:latest ./backend

# 构建前端镜像
print_info "构建前端镜像..."
docker build -t $PROJECT_NAME-frontend:$TAG -t $PROJECT_NAME-frontend:latest \
  --build-arg VITE_API_URL=${VITE_API_URL:-http://localhost} \
  ./frontend

print_info "镜像构建完成!"

# 显示构建结果
print_info "=== 构建的镜像列表 ==="
docker images | grep "$PROJECT_NAME" | head -10

print_info "=== 使用说明 ==="
print_info "后端镜像: $PROJECT_NAME-backend:$TAG"
print_info "前端镜像: $PROJECT_NAME-frontend:$TAG"
print_info ""
print_info "直接运行:"
print_info "  docker run -d -p 8000:8000 $PROJECT_NAME-backend:$TAG"
print_info "  docker run -d -p 3000:80 $PROJECT_NAME-frontend:$TAG"
print_info ""
print_info "使用docker-compose:"
print_info "  docker-compose -f docker-compose.production.yml up -d"
print_info ""
print_info "✅ 本地镜像构建完成!"
