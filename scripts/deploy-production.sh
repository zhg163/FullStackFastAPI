#!/bin/bash

# 生产环境部署脚本
# 使用方法: ./scripts/deploy-production.sh [--build] [--down] (已移除远程推送功能)

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
    
    # 检查docker-compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose 未安装"
        exit 1
    fi
    
    log_success "环境检查通过"
}

# 构建镜像
build_images() {
    log_info "构建Docker镜像..."
    
    # 构建后端镜像
    log_info "构建后端镜像..."
    docker-compose -f docker-compose.production.yml build backend
    
    # 构建前端镜像
    log_info "构建前端镜像..."
    docker-compose -f docker-compose.production.yml build frontend
    
    log_success "镜像构建完成"
}

# 拉取镜像
pull_images() {
    log_info "拉取外部镜像..."
    docker-compose -f docker-compose.production.yml pull db adminer nginx
    log_success "镜像拉取完成"
}

# 停止现有服务
stop_services() {
    log_info "停止现有服务..."
    docker-compose -f docker-compose.production.yml down
    log_success "服务停止完成"
}

# 启动服务
start_services() {
    log_info "启动生产环境服务..."
    
    # 加载环境变量
    export $(cat .env.production | xargs)
    
    # 启动服务
    docker-compose -f docker-compose.production.yml up -d
    
    log_success "服务启动完成"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    # 等待服务启动
    sleep 10
    
    # 检查数据库
    if docker-compose -f docker-compose.production.yml exec -T db pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}; then
        log_success "数据库健康检查通过"
    else
        log_error "数据库健康检查失败"
        return 1
    fi
    
    # 检查后端API
    max_retries=30
    retry_count=0
    
    while [ $retry_count -lt $max_retries ]; do
        if curl -f -s http://localhost:8000/api/v1/utils/health-check/ > /dev/null; then
            log_success "后端API健康检查通过"
            break
        else
            retry_count=$((retry_count + 1))
            log_info "等待后端API启动... ($retry_count/$max_retries)"
            sleep 5
        fi
    done
    
    if [ $retry_count -eq $max_retries ]; then
        log_error "后端API健康检查失败"
        return 1
    fi
    
    # 检查前端
    if curl -f -s http://localhost:80 > /dev/null; then
        log_success "前端健康检查通过"
    else
        log_error "前端健康检查失败"
        return 1
    fi
    
    log_success "所有服务健康检查通过"
}

# 显示服务状态
show_status() {
    log_info "服务状态:"
    docker-compose -f docker-compose.production.yml ps
    
    echo
    log_info "服务访问地址:"
    echo "  前端: http://localhost:80"
    echo "  后端API: http://localhost:8000"
    echo "  数据库管理: http://localhost:8080"
    echo "  数据库: localhost:5432"
}

# 显示日志
show_logs() {
    log_info "显示服务日志 (Ctrl+C 退出):"
    docker-compose -f docker-compose.production.yml logs -f
}

# 备份数据库
backup_database() {
    log_info "备份数据库..."
    
    timestamp=$(date +"%Y%m%d_%H%M%S")
    backup_file="backup_${timestamp}.sql"
    
    docker-compose -f docker-compose.production.yml exec -T db pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > $backup_file
    
    log_success "数据库备份完成: $backup_file"
}

# 清理旧镜像和容器
cleanup() {
    log_info "清理旧镜像和容器..."
    
    # 清理停止的容器
    docker container prune -f
    
    # 清理悬空镜像
    docker image prune -f
    
    # 清理未使用的网络
    docker network prune -f
    
    log_success "清理完成"
}

# 主函数
main() {
    log_info "=== FullStack FastAPI 生产环境部署 ==="
    
    # 解析参数
    BUILD=false
    PULL=false
    DOWN=false
    LOGS=false
    BACKUP=false
    CLEANUP=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --build)
                BUILD=true
                shift
                ;;
            --pull)
                PULL=true
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
            --backup)
                BACKUP=true
                shift
                ;;
            --cleanup)
                CLEANUP=true
                shift
                ;;
            -h|--help)
                echo "使用方法: $0 [选项]"
                echo "选项:"
                echo "  --build     重新构建镜像"
                echo "  --pull      拉取外部镜像"
                echo "  --down      停止服务"
                echo "  --logs      显示日志"
                echo "  --backup    备份数据库"
                echo "  --cleanup   清理旧镜像和容器"
                echo "  -h, --help  显示帮助信息"
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                exit 1
                ;;
        esac
    done
    
    # 检查环境
    check_requirements
    
    # 执行操作
    if [ "$DOWN" = true ]; then
        stop_services
        exit 0
    fi
    
    if [ "$BACKUP" = true ]; then
        backup_database
        exit 0
    fi
    
    if [ "$CLEANUP" = true ]; then
        cleanup
        exit 0
    fi
    
    if [ "$LOGS" = true ]; then
        show_logs
        exit 0
    fi
    
    if [ "$PULL" = true ]; then
        pull_images
    fi
    
    if [ "$BUILD" = true ]; then
        build_images
    fi
    
    # 启动服务
    start_services
    
    # 健康检查
    if health_check; then
        show_status
        log_success "=== 部署成功! ==="
    else
        log_error "=== 部署失败，请检查日志 ==="
        show_logs
        exit 1
    fi
}

# 运行主函数
main "$@"
