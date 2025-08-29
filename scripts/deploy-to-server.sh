#!/usr/bin/env bash

# 47.96.8.83 服务器部署脚本
# 此脚本用于将应用部署到指定服务器

set -e

# 服务器配置
SERVER_IP="47.96.8.83"
SERVER_USER="root"  # 根据实际情况修改
DEPLOY_PATH="/opt/fullstack-fastapi"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查参数
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "用法: $0 [选项]"
    echo "选项:"
    echo "  --build-push    构建并推送镜像到仓库"
    echo "  --deploy-only   仅部署（跳过构建）"
    echo "  --help, -h      显示帮助信息"
    echo ""
    echo "环境变量:"
    echo "  SERVER_IP       服务器IP地址（默认: 47.96.8.83）"
    echo "  SERVER_USER     服务器用户名（默认: root）"
    echo "  DEPLOY_PATH     部署路径（默认: /opt/fullstack-fastapi）"
    echo "  SSH_KEY         SSH私钥路径（可选）"
    exit 0
fi

# 获取环境变量
SERVER_IP=${SERVER_IP:-"47.96.8.83"}
SERVER_USER=${SERVER_USER:-"root"}
DEPLOY_PATH=${DEPLOY_PATH:-"/opt/fullstack-fastapi"}

print_info "=== FullStackFastAPI 服务器部署 ==="
print_info "目标服务器: $SERVER_USER@$SERVER_IP"
print_info "部署路径: $DEPLOY_PATH"
print_info "部署时间: $(date)"
echo

# SSH连接测试
print_step "1. 测试SSH连接..."
SSH_CMD="ssh"
if [ ! -z "$SSH_KEY" ]; then
    SSH_CMD="ssh -i $SSH_KEY"
fi

if ! $SSH_CMD -o ConnectTimeout=10 $SERVER_USER@$SERVER_IP "echo 'SSH连接成功'" 2>/dev/null; then
    print_error "无法连接到服务器 $SERVER_USER@$SERVER_IP"
    print_info "请检查:"
    print_info "1. 服务器IP地址是否正确"
    print_info "2. SSH密钥是否配置正确"
    print_info "3. 服务器防火墙是否允许SSH连接"
    exit 1
fi

# 构建和推送镜像（可选）
if [ "$1" = "--build-push" ] || [ -z "$1" ]; then
    print_step "2. 构建并推送Docker镜像..."
    
    # 设置构建环境变量
    export DOCKER_REGISTRY="registry.cn-hangzhou.aliyuncs.com"
    export VITE_API_URL="http://$SERVER_IP"
    
    print_info "正在构建镜像..."
    if [ -f "./scripts/docker-registry-push.sh" ]; then
        ./scripts/docker-registry-push.sh
    else
        print_error "构建脚本不存在: ./scripts/docker-registry-push.sh"
        exit 1
    fi
    print_info "镜像构建和推送完成"
fi

# 准备部署文件
print_step "3. 准备部署文件..."
TEMP_DIR=$(mktemp -d)
print_info "临时目录: $TEMP_DIR"

# 复制必要文件
cp docker-compose.server.yml $TEMP_DIR/docker-compose.yml
cp server-config.env $TEMP_DIR/.env.production
cp -r nginx $TEMP_DIR/ 2>/dev/null || true

# 创建部署脚本
cat > $TEMP_DIR/deploy.sh << 'EOF'
#!/bin/bash
set -e

echo "=== 开始部署 FastAPI 应用 ==="

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "安装Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl start docker
    systemctl enable docker
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "安装Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# 停止现有服务
echo "停止现有服务..."
docker-compose down || true

# 拉取最新镜像
echo "拉取最新镜像..."
docker-compose pull

# 启动服务
echo "启动服务..."
docker-compose up -d

# 等待服务启动
echo "等待服务启动..."
sleep 30

# 检查服务状态
echo "检查服务状态..."
docker-compose ps

# 健康检查
echo "执行健康检查..."
for i in {1..30}; do
    if curl -f http://localhost/health &>/dev/null; then
        echo "✅ 应用启动成功！"
        break
    fi
    echo "等待应用启动... ($i/30)"
    sleep 2
done

echo "=== 部署完成 ==="
echo "应用访问地址:"
echo "  前端: http://$(hostname -I | awk '{print $1}'):3001"
echo "  API:  http://$(hostname -I | awk '{print $1}')"
echo "  管理: http://$(hostname -I | awk '{print $1}'):8080"
EOF

chmod +x $TEMP_DIR/deploy.sh

# 上传文件到服务器
print_step "4. 上传文件到服务器..."
print_info "创建部署目录..."
$SSH_CMD $SERVER_USER@$SERVER_IP "mkdir -p $DEPLOY_PATH"

print_info "上传部署文件..."
if command -v rsync &> /dev/null; then
    if [ ! -z "$SSH_KEY" ]; then
        rsync -avz -e "ssh -i $SSH_KEY" $TEMP_DIR/ $SERVER_USER@$SERVER_IP:$DEPLOY_PATH/
    else
        rsync -avz $TEMP_DIR/ $SERVER_USER@$SERVER_IP:$DEPLOY_PATH/
    fi
else
    scp -r $TEMP_DIR/* $SERVER_USER@$SERVER_IP:$DEPLOY_PATH/
fi

# 在服务器上执行部署
print_step "5. 在服务器上执行部署..."
$SSH_CMD $SERVER_USER@$SERVER_IP "cd $DEPLOY_PATH && bash deploy.sh"

# 清理临时文件
print_step "6. 清理临时文件..."
rm -rf $TEMP_DIR
print_info "临时文件已清理"

# 显示部署结果
print_step "7. 部署完成！"
echo
print_info "=== 部署成功 ==="
print_info "应用访问地址:"
print_info "  🌐 前端应用: http://$SERVER_IP:3001"
print_info "  🔌 API接口: http://$SERVER_IP"
print_info "  🗄️ 数据库管理: http://$SERVER_IP:8080"
echo
print_info "=== 登录信息 ==="
print_info "  📧 邮箱: admin@example.com"
print_info "  🔑 密码: 1q2w3e4r"
echo
print_info "=== 服务器管理命令 ==="
print_info "查看服务状态: ssh $SERVER_USER@$SERVER_IP 'cd $DEPLOY_PATH && docker-compose ps'"
print_info "查看日志: ssh $SERVER_USER@$SERVER_IP 'cd $DEPLOY_PATH && docker-compose logs -f'"
print_info "重启服务: ssh $SERVER_USER@$SERVER_IP 'cd $DEPLOY_PATH && docker-compose restart'"
print_info "停止服务: ssh $SERVER_USER@$SERVER_IP 'cd $DEPLOY_PATH && docker-compose down'"
echo
print_info "🎉 部署完成！"
