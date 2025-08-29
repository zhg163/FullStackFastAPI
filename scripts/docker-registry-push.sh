#!/usr/bin/env bash

# 镜像仓库发布脚本
# 支持多种镜像仓库：Docker Hub, 阿里云, 腾讯云, 私有仓库

set -e

# 默认配置
DEFAULT_REGISTRY="aliyuncs.com"
DEFAULT_NAMESPACE="your-username"
DEFAULT_TAG="latest"

# 从环境变量或参数获取配置
REGISTRY=${DOCKER_REGISTRY:-$DEFAULT_REGISTRY}
NAMESPACE=${DOCKER_NAMESPACE:-$DEFAULT_NAMESPACE}
TAG=${TAG:-$DEFAULT_TAG}
PROJECT_NAME=${PROJECT_NAME:-"fullstack-fastapi"}

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
print_info "=== Docker 镜像发布配置 ==="
print_info "镜像仓库: $REGISTRY"
print_info "命名空间: $NAMESPACE"
print_info "项目名称: $PROJECT_NAME"
print_info "标签版本: $TAG"
print_info "后端镜像: $REGISTRY/$NAMESPACE/$PROJECT_NAME-backend:$TAG"
print_info "前端镜像: $REGISTRY/$NAMESPACE/$PROJECT_NAME-frontend:$TAG"
echo

# 构建镜像
print_info "开始构建镜像..."

# 构建后端镜像
print_info "构建后端镜像..."
docker build -t $REGISTRY/$NAMESPACE/$PROJECT_NAME-backend:$TAG -t $REGISTRY/$NAMESPACE/$PROJECT_NAME-backend:latest ./backend

# 构建前端镜像
print_info "构建前端镜像..."
docker build -t $REGISTRY/$NAMESPACE/$PROJECT_NAME-frontend:$TAG -t $REGISTRY/$NAMESPACE/$PROJECT_NAME-frontend:latest \
  --build-arg VITE_API_URL=${VITE_API_URL:-http://localhost} \
  ./frontend

print_info "镜像构建完成!"

# 检查Docker登录状态
print_info "检查Docker登录状态..."
if ! docker info | grep -q "Username"; then
    print_warning "请先登录到Docker仓库:"
    case $REGISTRY in
        "docker.io"|"")
            print_info "Docker Hub: docker login"
            ;;
        *"aliyuncs.com"*)
            print_info "阿里云: docker login --username=your-username registry.cn-hangzhou.aliyuncs.com"
            ;;
        *"tencentcloudcr.com"*)
            print_info "腾讯云: docker login --username=your-username ccr.ccs.tencentyun.com"
            ;;
        *)
            print_info "私有仓库: docker login $REGISTRY"
            ;;
    esac
    exit 1
fi

# 推送镜像
print_info "开始推送镜像到仓库..."

print_info "推送后端镜像..."
docker push $REGISTRY/$NAMESPACE/$PROJECT_NAME-backend:$TAG
docker push $REGISTRY/$NAMESPACE/$PROJECT_NAME-backend:latest

print_info "推送前端镜像..."
docker push $REGISTRY/$NAMESPACE/$PROJECT_NAME-frontend:$TAG  
docker push $REGISTRY/$NAMESPACE/$PROJECT_NAME-frontend:latest

print_info "镜像推送完成!"

# 生成部署配置
print_info "生成部署配置文件..."
cat > docker-compose.registry.yml << EOF
# 基于镜像仓库的部署配置
# 使用方法: docker-compose -f docker-compose.registry.yml up -d

version: "3.8"

services:
  db:
    image: postgres:17
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER} -d \${POSTGRES_DB}"]
      interval: 10s
      retries: 5
      start_period: 30s
      timeout: 10s
    volumes:
      - app-db-data:/var/lib/postgresql/data/pgdata
    environment:
      - PGDATA=/var/lib/postgresql/data/pgdata
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_DB=\${POSTGRES_DB}
    networks:
      - backend-network
    ports:
      - "5432:5432"

  adminer:
    image: adminer
    restart: always
    depends_on:
      - db
    environment:
      - ADMINER_DESIGN=pepa-linha-dark
    networks:
      - backend-network
    ports:
      - "8080:8080"

  prestart:
    image: $REGISTRY/$NAMESPACE/$PROJECT_NAME-backend:$TAG
    depends_on:
      db:
        condition: service_healthy
    environment:
      - POSTGRES_SERVER=db
      - POSTGRES_PORT=\${POSTGRES_PORT:-5432}
      - POSTGRES_DB=\${POSTGRES_DB}
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
      - FIRST_SUPERUSER=\${FIRST_SUPERUSER}
      - FIRST_SUPERUSER_PASSWORD=\${FIRST_SUPERUSER_PASSWORD}
      - SECRET_KEY=\${SECRET_KEY}
      - PROJECT_NAME=\${PROJECT_NAME}
    networks:
      - backend-network
    command: python /app/app/backend_pre_start.py && alembic upgrade head && python /app/app/initial_data.py

  backend:
    image: $REGISTRY/$NAMESPACE/$PROJECT_NAME-backend:$TAG
    restart: always
    depends_on:
      db:
        condition: service_healthy
      prestart:
        condition: service_completed_successfully
    environment:
      - DOMAIN=\${DOMAIN}
      - FRONTEND_HOST=\${FRONTEND_HOST}
      - ENVIRONMENT=production
      - PROJECT_NAME=\${PROJECT_NAME}
      - BACKEND_CORS_ORIGINS=\${BACKEND_CORS_ORIGINS}
      - SECRET_KEY=\${SECRET_KEY}
      - FIRST_SUPERUSER=\${FIRST_SUPERUSER}
      - FIRST_SUPERUSER_PASSWORD=\${FIRST_SUPERUSER_PASSWORD}
      - POSTGRES_SERVER=db
      - POSTGRES_PORT=\${POSTGRES_PORT:-5432}
      - POSTGRES_DB=\${POSTGRES_DB}
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
    networks:
      - frontend-network
      - backend-network
    ports:
      - "8000:8000"

  frontend:
    image: $REGISTRY/$NAMESPACE/$PROJECT_NAME-frontend:$TAG
    restart: always
    depends_on:
      - backend
    networks:
      - frontend-network
    ports:
      - "3000:80"

  nginx:
    image: nginx:alpine
    restart: always
    depends_on:
      - backend
      - frontend
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    networks:
      - frontend-network
      - backend-network
    ports:
      - "80:80"
      - "3001:8080"

volumes:
  app-db-data:

networks:
  frontend-network:
  backend-network:
EOF

print_info "部署配置文件已生成: docker-compose.registry.yml"

# 显示使用说明
print_info "=== 镜像仓库信息 ==="
print_info "后端镜像: $REGISTRY/$NAMESPACE/$PROJECT_NAME-backend:$TAG"
print_info "前端镜像: $REGISTRY/$NAMESPACE/$PROJECT_NAME-frontend:$TAG"
print_info ""
print_info "=== 部署说明 ==="
print_info "1. 复制 .env.production 到目标服务器"
print_info "2. 复制 docker-compose.registry.yml 到目标服务器"
print_info "3. 复制 nginx/ 目录到目标服务器"
print_info "4. 执行部署命令:"
print_info "   docker-compose -f docker-compose.registry.yml up -d"
print_info ""
print_info "✅ 镜像发布完成!"
