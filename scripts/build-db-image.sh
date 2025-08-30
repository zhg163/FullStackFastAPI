#!/usr/bin/env bash

# 构建包含初始数据的PostgreSQL数据库镜像

set -e

# 配置
DB_IMAGE_NAME="fullstack-fastapi-db"
DB_VERSION="latest"
REGISTRY="registry.cn-hangzhou.aliyuncs.com"
NAMESPACE=${DOCKER_NAMESPACE:-"your-namespace"}

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_info "=== 构建数据库镜像 ==="

# 1. 确保数据库服务正在运行
print_info "检查数据库服务状态..."
if ! docker-compose -f docker-compose.production.yml ps db | grep -q "Up"; then
    print_warning "数据库服务未运行，正在启动..."
    docker-compose -f docker-compose.production.yml up -d db
    sleep 10
fi

# 2. 导出数据库数据
print_info "导出数据库数据..."
mkdir -p ./docker-db/initdb
docker-compose -f docker-compose.production.yml exec db pg_dump -U postgres -d app --clean --if-exists > ./docker-db/initdb/01-app-data.sql

# 3. 创建自定义初始化脚本
cat > ./docker-db/initdb/00-init.sql << 'EOF'
-- 创建应用数据库和用户
CREATE DATABASE app;
CREATE USER appuser WITH PASSWORD 'apppassword';
GRANT ALL PRIVILEGES ON DATABASE app TO appuser;

-- 连接到app数据库
\c app;

-- 设置用户权限
GRANT ALL ON SCHEMA public TO appuser;
EOF

# 4. 创建Dockerfile
cat > ./docker-db/Dockerfile << 'EOF'
FROM postgres:17

# 设置环境变量
ENV POSTGRES_DB=app
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=changethis123

# 复制初始化脚本
COPY initdb/ /docker-entrypoint-initdb.d/

# 暴露端口
EXPOSE 5432

# 设置健康检查
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
EOF

# 5. 构建数据库镜像
print_info "构建数据库镜像..."
cd docker-db
docker build -t $DB_IMAGE_NAME:$DB_VERSION .
docker tag $DB_IMAGE_NAME:$DB_VERSION $REGISTRY/$NAMESPACE/$DB_IMAGE_NAME:$DB_VERSION
docker tag $DB_IMAGE_NAME:$DB_VERSION $REGISTRY/$NAMESPACE/$DB_IMAGE_NAME:latest

# 6. 推送镜像
print_info "推送数据库镜像..."
docker push $REGISTRY/$NAMESPACE/$DB_IMAGE_NAME:$DB_VERSION
docker push $REGISTRY/$NAMESPACE/$DB_IMAGE_NAME:latest

# 7. 清理临时文件
cd ..
# rm -rf docker-db  # 可选：保留用于调试

print_info "=== 数据库镜像构建完成 ==="
print_info "镜像名称: $REGISTRY/$NAMESPACE/$DB_IMAGE_NAME:$DB_VERSION"
print_info "使用方法:"
print_info "  docker run -d -p 5432:5432 $REGISTRY/$NAMESPACE/$DB_IMAGE_NAME:$DB_VERSION"
