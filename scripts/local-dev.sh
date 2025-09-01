#!/bin/bash

# =============================================================================
# FullStackFastAPI 本地开发环境管理脚本
# =============================================================================
# 作用：一键初始化数据库、启动本地开发环境
# 技术栈：FastAPI + React + PostgreSQL + Redis + Docker Compose
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目配置
PROJECT_NAME="FullStackFastAPI"
BACKEND_PORT=8000
FRONTEND_PORT=5173
DB_PORT=5432
REDIS_PORT=6379
ADMINER_PORT=8080

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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# 显示欢迎信息
show_welcome() {
    clear
    echo -e "${CYAN}================================================${NC}"
    echo -e "${CYAN}    $PROJECT_NAME 本地开发环境管理工具${NC}"
    echo -e "${CYAN}================================================${NC}"
    echo -e "${GREEN}技术栈：${NC}"
    echo -e "  🐍 后端：FastAPI + SQLModel + PostgreSQL"
    echo -e "  ⚛️  前端：React + TypeScript + Chakra UI"
    echo -e "  🐳 容器：Docker Compose"
    echo -e "  🔄 队列：Redis + RQ"
    echo ""
    echo -e "${BLUE}当前时间：${NC}$(date)"
    echo -e "${BLUE}工作目录：${NC}$(pwd)"
    echo ""
}

# 检查系统要求
check_requirements() {
    log_step "检查系统环境要求..."
    
    local errors=0
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        errors=$((errors + 1))
    elif ! docker info >/dev/null 2>&1; then
        log_error "Docker 服务未运行"
        errors=$((errors + 1))
    else
        log_success "Docker: $(docker --version | head -1)"
    fi
    
    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装"
        errors=$((errors + 1))
    else
        log_success "Docker Compose: $(docker-compose --version)"
    fi
    
    # 检查Python（后端开发）
    if command -v python3 &> /dev/null; then
        log_success "Python: $(python3 --version)"
    else
        log_warning "Python3 未安装（后端开发需要）"
    fi
    
    # 检查Node.js（前端开发）
    if command -v node &> /dev/null; then
        log_success "Node.js: $(node --version)"
    else
        log_warning "Node.js 未安装（前端开发需要）"
    fi
    
    # 检查必要文件
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml 文件不存在"
        errors=$((errors + 1))
    fi
    
    if [ $errors -gt 0 ]; then
        log_error "系统环境检查失败，请安装缺失的依赖"
        exit 1
    fi
    
    log_success "系统环境检查通过"
}

# 检查和创建环境配置文件
setup_env_files() {
    log_step "检查和设置环境配置文件..."
    
    # 创建默认的.env文件（如果不存在）
    if [ ! -f ".env" ]; then
        log_info "创建默认的.env文件..."
        cat > .env << 'EOF'
# ======================
# 基础配置
# ======================
DOMAIN=localhost
FRONTEND_HOST=http://localhost:5173
ENVIRONMENT=local
PROJECT_NAME=Full Stack FastAPI Project
STACK_NAME=fullstack-fastapi

# ======================
# 安全配置
# ======================
SECRET_KEY=your-secret-key-change-this-in-production
BACKEND_CORS_ORIGINS=["http://localhost:5173","https://localhost:5173","http://localhost","https://localhost"]

# ======================
# 数据库配置
# ======================
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=fullstack_app

# ======================
# 初始用户配置
# ======================
FIRST_SUPERUSER=admin@example.com
FIRST_SUPERUSER_PASSWORD=admin123456

# ======================
# 邮件配置（可选）
# ======================
SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=
EMAILS_FROM_EMAIL=noreply@example.com

# ======================
# 错误监控（可选）
# ======================
SENTRY_DSN=

# ======================
# Redis配置
# ======================
REDIS_URL=redis://localhost:6379/0
RQ_QUEUE_NAME=ai_tasks

# ======================
# AI API配置
# ======================
DEFAULT_API_PROVIDER=mock
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_API_KEY=
EOF
        log_success "已创建默认的.env文件"
        log_warning "请编辑.env文件，配置正确的密码和API密钥"
    else
        log_success ".env文件已存在"
    fi
    
    # 检查前端环境配置
    if [ ! -f "frontend/.env.local" ]; then
        log_info "创建前端环境配置文件..."
        mkdir -p frontend
        cat > frontend/.env.local << 'EOF'
VITE_API_URL=http://localhost:8000
EOF
        log_success "已创建前端环境配置文件"
    fi
}

# 停止所有服务
stop_all_services() {
    log_step "停止所有服务..."
    
    # 停止Docker Compose服务
    docker-compose down 2>/dev/null || true
    
    # 停止可能运行的单独容器
    docker stop fullstack-postgres fullstack-redis fullstack-backend fullstack-frontend 2>/dev/null || true
    
    log_success "所有服务已停止"
}

# 清理旧数据（可选）
clean_old_data() {
    if [ "$1" = "--clean" ]; then
        log_step "清理旧数据..."
        log_warning "这将删除所有数据库数据！"
        read -p "确认清理旧数据? (y/N): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # 删除数据卷
            docker volume rm fullstackfastapi_app-db-data 2>/dev/null || true
            docker volume rm fullstackfastapi_redis-data 2>/dev/null || true
            log_success "旧数据已清理"
        else
            log_info "跳过数据清理"
        fi
    fi
}

# 启动数据库服务
start_database_services() {
    log_step "启动数据库和缓存服务..."
    
    # 启动PostgreSQL和Redis
    docker-compose up -d db redis 2>/dev/null || {
        log_info "启动基础服务（PostgreSQL和Redis）..."
        docker-compose up -d
        docker-compose stop backend frontend 2>/dev/null || true
    }
    
    # 等待数据库启动
    log_info "等待PostgreSQL数据库启动..."
    for i in {1..30}; do
        if docker-compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then
            log_success "PostgreSQL数据库已启动"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "PostgreSQL数据库启动超时"
            exit 1
        fi
        echo "等待数据库启动... ($i/30)"
        sleep 2
    done
    
    # 检查Redis
    log_info "检查Redis服务..."
    if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
        log_success "Redis服务正常"
    else
        log_warning "Redis服务可能未正常启动"
    fi
}

# 初始化数据库
initialize_database() {
    log_step "初始化数据库架构和数据..."
    
    # 等待数据库完全就绪
    sleep 5
    
    # 运行数据库初始化脚本
    log_info "运行数据库预启动脚本..."
    docker-compose run --rm prestart
    
    if [ $? -eq 0 ]; then
        log_success "数据库初始化完成"
    else
        log_error "数据库初始化失败"
        return 1
    fi
}

# 启动后端服务
start_backend_service() {
    log_step "启动后端API服务..."
    
    docker-compose up -d backend
    
    # 等待后端服务启动
    log_info "等待后端API服务启动..."
    for i in {1..30}; do
        if curl -f http://localhost:$BACKEND_PORT/api/v1/utils/health-check/ >/dev/null 2>&1; then
            log_success "后端API服务已启动"
            break
        fi
        if [ $i -eq 30 ]; then
            log_warning "后端API服务启动超时，请检查日志"
            break
        fi
        echo "等待后端API启动... ($i/30)"
        sleep 2
    done
}

# 启动前端服务
start_frontend_service() {
    log_step "启动前端开发服务..."
    
    docker-compose up -d frontend
    
    # 等待前端服务启动
    log_info "等待前端服务启动..."
    sleep 10
    
    if curl -f http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
        log_success "前端服务已启动"
    else
        log_warning "前端服务可能未正常启动，请检查日志"
    fi
}

# 启动管理工具
start_admin_tools() {
    log_step "启动管理工具..."
    
    # 启动Adminer数据库管理界面
    docker-compose up -d adminer
    
    log_success "管理工具已启动"
}

# 显示服务状态
show_service_status() {
    log_step "检查服务状态..."
    
    echo ""
    echo -e "${CYAN}=== 服务状态 ===${NC}"
    docker-compose ps
    
    echo ""
    echo -e "${CYAN}=== 端口占用检查 ===${NC}"
    
    # 检查各服务端口
    ports=("$DB_PORT:PostgreSQL" "$REDIS_PORT:Redis" "$BACKEND_PORT:Backend API" "$FRONTEND_PORT:Frontend" "$ADMINER_PORT:Adminer")
    
    for port_info in "${ports[@]}"; do
        port="${port_info%%:*}"
        service="${port_info##*:}"
        
        if lsof -i :$port >/dev/null 2>&1; then
            echo -e "  ✅ $service: http://localhost:$port"
        else
            echo -e "  ❌ $service: 端口 $port 未被占用"
        fi
    done
}

# 显示访问信息
show_access_info() {
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}    🎉 本地开发环境启动完成！${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "${CYAN}📱 应用访问地址：${NC}"
    echo -e "  🌐 前端应用:    ${YELLOW}http://localhost:$FRONTEND_PORT${NC}"
    echo -e "  🔌 后端API:     ${YELLOW}http://localhost:$BACKEND_PORT${NC}"
    echo -e "  📚 API文档:     ${YELLOW}http://localhost:$BACKEND_PORT/docs${NC}"
    echo -e "  🗄️  数据库管理:  ${YELLOW}http://localhost:$ADMINER_PORT${NC}"
    echo ""
    echo -e "${CYAN}🔑 默认登录信息：${NC}"
    echo -e "  📧 邮箱: ${YELLOW}admin@example.com${NC}"
    echo -e "  🔐 密码: ${YELLOW}admin123456${NC}"
    echo ""
    echo -e "${CYAN}🛠️  开发工具：${NC}"
    echo -e "  📊 查看日志: ${YELLOW}docker-compose logs -f [service]${NC}"
    echo -e "  ⏹️  停止服务: ${YELLOW}$0 --stop${NC}"
    echo -e "  🔄 重启服务: ${YELLOW}$0 --restart${NC}"
    echo -e "  🧹 清理数据: ${YELLOW}$0 --clean${NC}"
    echo ""
    echo -e "${CYAN}📁 项目目录：${NC}"
    echo -e "  后端代码: ${YELLOW}./backend/${NC}"
    echo -e "  前端代码: ${YELLOW}./frontend/${NC}"
    echo -e "  配置文件: ${YELLOW}./.env${NC}"
    echo ""
}

# 显示日志
show_logs() {
    log_step "显示服务日志..."
    
    if [ -n "$2" ]; then
        # 显示特定服务的日志
        docker-compose logs -f "$2"
    else
        # 显示所有服务的日志
        docker-compose logs -f
    fi
}

# 重启服务
restart_services() {
    log_step "重启所有服务..."
    
    stop_all_services
    sleep 3
    start_development_environment
}

# 主启动函数
start_development_environment() {
    # 1. 启动数据库服务
    start_database_services
    
    # 2. 初始化数据库
    if ! initialize_database; then
        log_error "数据库初始化失败，请检查配置"
        return 1
    fi
    
    # 3. 启动后端服务
    start_backend_service
    
    # 4. 启动前端服务
    start_frontend_service
    
    # 5. 启动管理工具
    start_admin_tools
    
    # 6. 显示状态
    show_service_status
    
    # 7. 显示访问信息
    show_access_info
}

# 显示帮助信息
show_help() {
    echo -e "${CYAN}FullStackFastAPI 本地开发环境管理工具${NC}"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --start     启动开发环境（默认）"
    echo "  --stop      停止所有服务"
    echo "  --restart   重启所有服务"
    echo "  --status    查看服务状态"
    echo "  --logs      查看所有服务日志"
    echo "  --logs <service>  查看特定服务日志"
    echo "  --clean     清理并重新初始化（删除所有数据）"
    echo "  --help      显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                    # 启动开发环境"
    echo "  $0 --stop             # 停止所有服务"
    echo "  $0 --logs backend     # 查看后端日志"
    echo "  $0 --clean            # 清理并重新初始化"
    echo ""
    echo "服务列表:"
    echo "  db          PostgreSQL数据库"
    echo "  redis       Redis缓存"
    echo "  backend     FastAPI后端"
    echo "  frontend    React前端"
    echo "  adminer     数据库管理界面"
    echo ""
}

# 主逻辑
main() {
    case "${1:-}" in
        --start|"")
            show_welcome
            check_requirements
            setup_env_files
            clean_old_data "$@"
            start_development_environment
            ;;
        --stop)
            log_info "停止开发环境..."
            stop_all_services
            ;;
        --restart)
            show_welcome
            restart_services
            ;;
        --status)
            show_service_status
            ;;
        --logs)
            show_logs "$@"
            ;;
        --clean)
            show_welcome
            check_requirements
            setup_env_files
            stop_all_services
            clean_old_data --clean
            start_development_environment
            ;;
        --help|-h)
            show_help
            ;;
        *)
            log_error "未知选项: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"