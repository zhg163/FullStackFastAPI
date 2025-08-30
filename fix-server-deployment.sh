#!/bin/bash

# 在阿里云服务器上修复部署问题的脚本

echo "=== 修复阿里云服务器部署问题 ==="

# 1. 创建环境变量文件
echo "1. 创建 .env.production 文件..."
cat > .env.production << 'ENVEOF'
# 服务器配置
DOMAIN=47.96.8.83
SERVER_IP=47.96.8.83

# 前端配置
VITE_API_URL=http://47.96.8.83
FRONTEND_HOST=http://47.96.8.83:3001

# 数据库配置
POSTGRES_SERVER=db
POSTGRES_PORT=5432
POSTGRES_DB=app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changethis123

# 应用配置
PROJECT_NAME=FastAPI
SECRET_KEY=your-super-secret-key-change-this-in-production-$(date +%s)
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=1q2w3e4r

# CORS配置
BACKEND_CORS_ORIGINS=["http://localhost","http://localhost:3000","http://localhost:3001","http://localhost:5173","http://localhost:8000","http://47.96.8.83","http://47.96.8.83:3000","http://47.96.8.83:3001","http://47.96.8.83:5173","http://47.96.8.83:8000"]

# 环境配置
ENVIRONMENT=production

# 邮件配置（可选）
SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=
EMAILS_FROM_EMAIL=noreply@example.com

# 监控配置（可选）
SENTRY_DSN=
ENVEOF

# 2. 配置Docker镜像加速器
echo "2. 配置Docker镜像加速器..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'DOCKEREOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
DOCKEREOF

# 重启Docker服务
echo "3. 重启Docker服务..."
systemctl restart docker
systemctl enable docker

# 4. 测试Docker连接
echo "4. 测试Docker连接..."
docker info | grep "Registry Mirrors" -A 10

echo "=== 修复完成 ==="
echo "现在可以重新运行部署脚本："
echo "./scripts/deploy-production.sh --build"
