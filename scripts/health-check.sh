#!/bin/bash

# 系统健康检查脚本
# 检查所有服务的健康状态

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 默认配置
ENVIRONMENT="development"
TIMEOUT=30

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            echo "系统健康检查脚本"
            echo "使用方法: $0 [选项]"
            echo "选项:"
            echo "  --env ENV        环境 (development|production, 默认: development)"
            echo "  --timeout SEC    超时时间 (默认: 30秒)"
            echo "  -h, --help       显示帮助"
            exit 0
            ;;
        *)
            log_error "未知参数: $1"
            exit 1
            ;;
    esac
done

# 设置compose文件
COMPOSE_FILE="docker-compose.override.yml"
if [ "$ENVIRONMENT" = "production" ]; then
    COMPOSE_FILE="docker-compose.production.yml"
fi

# 加载环境变量
if [ "$ENVIRONMENT" = "production" ] && [ -f ".env.production" ]; then
    export $(cat .env.production | xargs)
elif [ -f ".env" ]; then
    export $(cat .env | xargs)
fi

# 检查Docker服务状态
check_docker_services() {
    log_info "检查Docker服务状态..."
    
    # 获取服务状态
    services=$(docker-compose -f "$COMPOSE_FILE" ps --services)
    all_healthy=true
    
    for service in $services; do
        status=$(docker-compose -f "$COMPOSE_FILE" ps -q "$service" | xargs -r docker inspect --format='{{.State.Status}}' 2>/dev/null || echo "not found")
        
        case $status in
            "running")
                log_success "$service: 运行中"
                ;;
            "exited")
                log_error "$service: 已退出"
                all_healthy=false
                ;;
            "not found")
                log_warning "$service: 未找到"
                all_healthy=false
                ;;
            *)
                log_warning "$service: $status"
                all_healthy=false
                ;;
        esac
    done
    
    return $([[ $all_healthy == true ]] && echo 0 || echo 1)
}

# 检查数据库连接
check_database() {
    log_info "检查数据库连接..."
    
    max_attempts=$((TIMEOUT / 2))
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f "$COMPOSE_FILE" exec -T db pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-app}" >/dev/null 2>&1; then
            log_success "数据库连接正常"
            return 0
        fi
        
        log_info "数据库连接尝试 $attempt/$max_attempts..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "数据库连接失败"
    return 1
}

# 检查后端API
check_backend_api() {
    log_info "检查后端API..."
    
    # 确定API URL
    if [ "$ENVIRONMENT" = "production" ]; then
        API_URL="https://api.${DOMAIN:-localhost}/api/v1/utils/health-check/"
    else
        API_URL="http://localhost:8000/api/v1/utils/health-check/"
    fi
    
    max_attempts=$((TIMEOUT / 3))
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s --connect-timeout 5 "$API_URL" >/dev/null 2>&1; then
            log_success "后端API正常"
            
            # 获取API版本信息
            version_info=$(curl -s "$API_URL" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "未知")
            log_info "API响应: $version_info"
            return 0
        fi
        
        log_info "后端API检查尝试 $attempt/$max_attempts..."
        sleep 3
        attempt=$((attempt + 1))
    done
    
    log_error "后端API检查失败"
    return 1
}

# 检查前端
check_frontend() {
    log_info "检查前端服务..."
    
    # 确定前端URL
    if [ "$ENVIRONMENT" = "production" ]; then
        FRONTEND_URL="https://dashboard.${DOMAIN:-localhost}"
    else
        FRONTEND_URL="http://localhost:5173"
    fi
    
    if curl -f -s --connect-timeout 5 "$FRONTEND_URL" >/dev/null 2>&1; then
        log_success "前端服务正常"
        return 0
    else
        log_error "前端服务检查失败"
        return 1
    fi
}

# 检查磁盘空间
check_disk_space() {
    log_info "检查磁盘空间..."
    
    # 检查根分区
    root_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$root_usage" -gt 90 ]; then
        log_error "根分区磁盘使用率过高: ${root_usage}%"
        return 1
    elif [ "$root_usage" -gt 80 ]; then
        log_warning "根分区磁盘使用率较高: ${root_usage}%"
    else
        log_success "磁盘空间正常: ${root_usage}%"
    fi
    
    # 检查Docker空间
    docker_info=$(docker system df --format "table {{.Type}}\t{{.Size}}" | tail -n +2)
    log_info "Docker存储使用情况:"
    echo "$docker_info"
    
    return 0
}

# 检查内存使用
check_memory() {
    log_info "检查内存使用..."
    
    if command -v free >/dev/null 2>&1; then
        memory_info=$(free -h | grep "Mem:")
        log_info "内存使用情况: $memory_info"
        
        memory_usage=$(free | grep "Mem:" | awk '{printf "%.1f", $3/$2 * 100.0}')
        memory_usage_int=${memory_usage%.*}
        
        if [ "$memory_usage_int" -gt 90 ]; then
            log_error "内存使用率过高: ${memory_usage}%"
            return 1
        elif [ "$memory_usage_int" -gt 80 ]; then
            log_warning "内存使用率较高: ${memory_usage}%"
        else
            log_success "内存使用正常: ${memory_usage}%"
        fi
    else
        log_info "无法检查内存使用情况 (free命令不可用)"
    fi
    
    return 0
}

# 显示详细状态
show_detailed_status() {
    log_info "详细服务状态:"
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo
    log_info "容器资源使用情况:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
    
    echo
    log_info "最近的容器日志 (最后20行):"
    docker-compose -f "$COMPOSE_FILE" logs --tail=20
}

# 主函数
main() {
    log_info "=== 系统健康检查开始 (环境: $ENVIRONMENT) ==="
    
    # 检查计数器
    total_checks=0
    failed_checks=0
    
    # 执行各项检查
    checks=(
        "check_docker_services"
        "check_database"
        "check_backend_api"
        "check_frontend"
        "check_disk_space"
        "check_memory"
    )
    
    for check in "${checks[@]}"; do
        total_checks=$((total_checks + 1))
        if ! $check; then
            failed_checks=$((failed_checks + 1))
        fi
        echo
    done
    
    # 显示结果摘要
    passed_checks=$((total_checks - failed_checks))
    log_info "=== 检查结果摘要 ==="
    log_info "总检查项: $total_checks"
    log_success "通过: $passed_checks"
    
    if [ $failed_checks -gt 0 ]; then
        log_error "失败: $failed_checks"
        log_info "建议查看详细日志:"
        log_info "  docker-compose -f $COMPOSE_FILE logs"
        show_detailed_status
        exit 1
    else
        log_success "所有检查项通过!"
        
        # 显示访问地址
        echo
        log_info "服务访问地址:"
        if [ "$ENVIRONMENT" = "production" ]; then
            echo "  前端: https://dashboard.${DOMAIN:-localhost}"
            echo "  后端API: https://api.${DOMAIN:-localhost}"
            echo "  数据库管理: https://adminer.${DOMAIN:-localhost}"
        else
            echo "  前端: http://localhost:5173"
            echo "  后端API: http://localhost:8000"
            echo "  数据库管理: http://localhost:8080"
        fi
        
        exit 0
    fi
}

# 运行主函数
main
