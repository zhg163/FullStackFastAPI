#!/bin/bash

# 本地Docker部署脚本（无远程推送）
# 使用方法: ./scripts/deploy-local.sh [--build] [--down]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查必要的文件
check_requirements() {
    log_info "检查部署环境..."
    
    if [ ! -f ".env.production" ]; then
        log_error ".env.production 文件不存在"
        log_info "请复制 env.production.template 为 .env.production 并配置相应的值"
        exit 1
    fi
    
    if [ ! -f "docker-compose.production.yml" ]; then
        log_error "docker-compose.production.yml 文件不存在"
        exit 1
    fi
    
    # 检查Docker是否运行
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker 未运行或不可访问"
        exit 1
    fi
    
    # 检查Docker Compose
    if ! command -v docker-compose >/dev/null 2>&1; then
        log_error "docker-compose 未安装"
        exit 1
    fi
    
    log_success "环境检查通过"
}

# 构建本地镜像
build_images() {
    log_info "构建本地Docker镜像..."
    
    # 构建后端镜像
    log_info "构建后端镜像..."
    docker-compose -f docker-compose.production.yml build backend
    
    # 构建前端镜像
    log_info "构建前端镜像..."
    docker-compose -f docker-compose.production.yml build frontend
    
    log_success "本地镜像构建完成"
    
    # 显示构建的镜像
    log_info "构建的镜像列表:"
    docker images | grep -E "(backend|frontend)" | head -10
}

# 停止并清理服务
stop_services() {
    log_info "停止服务..."
    docker-compose -f docker-compose.production.yml down
    log_success "服务已停止"
}

# 启动服务
start_services() {
    log_info "启动服务..."
    docker-compose -f docker-compose.production.yml up -d
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 10
    
    # 检查服务状态
    log_info "检查服务状态..."
    docker-compose -f docker-compose.production.yml ps
    
    # 健康检查
    log_info "执行健康检查..."
    for i in {1..30}; do
        if curl -f http://localhost/health >/dev/null 2>&1; then
            log_success "应用启动成功！"
            break
        fi
        if [ $i -eq 30 ]; then
            log_warning "健康检查超时，请检查服务状态"
        else
            echo "等待应用启动... ($i/30)"
            sleep 2
        fi
    done
}

# 显示日志
show_logs() {
    log_info "显示服务日志..."
    docker-compose -f docker-compose.production.yml logs --tail=50
}

# 显示帮助信息
show_help() {
    echo "本地Docker部署脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --build     重新构建本地镜像"
    echo "  --down      停止服务"
    echo "  --logs      显示日志"
    echo "  --help      显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 --build     # 构建镜像并启动服务"
    echo "  $0 --down      # 仅停止服务"
    echo "  $0 --logs      # 显示日志"
    echo ""
    echo "注意: 此脚本只构建本地镜像，不推送到远程仓库"
}

# 主函数
main() {
    local BUILD=false
    local DOWN=false
    local LOGS=false
    
    # 解析命令行参数
    while [ $# -gt 0 ]; do
        case $1 in
            --build)
                BUILD=true
                shift
                ;;
            --down)
                DOWN=true
                shift
                ;;
            --logs)
                LOGS=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 显示脚本信息
    log_info "=== FullStack FastAPI 本地Docker部署 ==="
    log_info "时间: $(date)"
    log_info "工作目录: $(pwd)"
    echo ""
    
    # 检查环境
    check_requirements
    
    # 如果只是查看日志
    if [ "$LOGS" = true ]; then
        show_logs
        exit 0
    fi
    
    # 如果是停止服务
    if [ "$DOWN" = true ]; then
        stop_services
        exit 0
    fi
    
    # 构建镜像
    if [ "$BUILD" = true ]; then
        build_images
    fi
    
    # 启动服务
    start_services
    
    # 显示访问信息
    echo ""
    log_success "=== 部署完成 ==="
    log_info "应用访问地址:"
    log_info "  🌐 前端应用: http://localhost:3001"
    log_info "  🔌 API接口: http://localhost"
    log_info "  📚 API文档: http://localhost/docs"
    log_info "  🗄️ 数据库管理: http://localhost:8080"
    echo ""
    log_info "管理命令:"
    log_info "  查看日志: $0 --logs"
    log_info "  停止服务: $0 --down"
    log_info "  重新构建: $0 --build"
    echo ""
}

# 执行主函数
main "$@"
