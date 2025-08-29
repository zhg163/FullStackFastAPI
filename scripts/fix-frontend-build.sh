#!/bin/bash

# 前端构建问题修复脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

log_info "开始修复前端构建问题..."

# 1. 移动备份文件到项目外
log_info "处理备份文件..."
if [ -d "frontend/src/components/BatchPromptGeneration.backup" ]; then
    log_info "移动备份文件到临时目录..."
    mkdir -p temp_backup
    mv frontend/src/components/BatchPromptGeneration.backup temp_backup/
    log_success "备份文件已移动"
else
    log_info "没有找到备份文件"
fi

# 2. 检查并修复依赖
log_info "检查前端依赖..."
cd frontend

# 检查是否有package-lock.json
if [ -f "package-lock.json" ]; then
    log_info "清理npm缓存..."
    npm cache clean --force
fi

# 重新安装依赖
log_info "重新安装依赖..."
rm -rf node_modules
npm install

# 3. 尝试本地构建测试
log_info "测试本地构建..."
export VITE_API_URL="https://api.localhost"
export NODE_ENV="production"

if npm run build; then
    log_success "本地构建成功!"
else
    log_error "本地构建失败，请检查具体错误"
    cd ..
    
    # 恢复备份文件
    if [ -d "temp_backup/BatchPromptGeneration.backup" ]; then
        log_info "恢复备份文件..."
        mv temp_backup/BatchPromptGeneration.backup frontend/src/components/
    fi
    exit 1
fi

cd ..

# 4. 清理临时文件
log_info "清理临时文件..."
if [ -d "temp_backup" ]; then
    rm -rf temp_backup
fi

log_success "前端构建问题修复完成!"
log_info "现在可以重新运行部署命令:"
log_info "  ./scripts/deploy-production.sh --build"
