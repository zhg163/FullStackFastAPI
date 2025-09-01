#!/bin/bash

# =============================================================================
# 数据库快速初始化脚本
# =============================================================================
# 作用：快速初始化PostgreSQL数据库，创建表结构和初始数据
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
DB_NAME="fullstack_app"
DB_USER="postgres"
DB_PASSWORD="your_secure_password"
DB_HOST="localhost"
DB_PORT="5432"

# 从.env文件加载配置（如果存在）
if [ -f ".env" ]; then
    source .env
    DB_NAME=${POSTGRES_DB:-$DB_NAME}
    DB_USER=${POSTGRES_USER:-$DB_USER}
    DB_PASSWORD=${POSTGRES_PASSWORD:-$DB_PASSWORD}
    DB_HOST=${POSTGRES_SERVER:-$DB_HOST}
    DB_PORT=${POSTGRES_PORT:-$DB_PORT}
fi

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

# 检查PostgreSQL是否运行
check_postgres() {
    log_info "检查PostgreSQL服务状态..."
    
    # 检查Docker容器方式
    if docker ps | grep -q postgres; then
        log_success "PostgreSQL Docker容器正在运行"
        return 0
    fi
    
    # 检查本地PostgreSQL服务
    if pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER >/dev/null 2>&1; then
        log_success "PostgreSQL服务正在运行"
        return 0
    fi
    
    log_error "PostgreSQL服务未运行"
    return 1
}

# 启动PostgreSQL Docker容器
start_postgres_docker() {
    log_info "启动PostgreSQL Docker容器..."
    
    if docker ps | grep -q postgres; then
        log_info "PostgreSQL容器已在运行"
        return 0
    fi
    
    # 使用docker-compose启动
    if [ -f "docker-compose.yml" ]; then
        docker-compose up -d db
        log_info "等待PostgreSQL启动..."
        sleep 10
        
        # 验证启动
        for i in {1..30}; do
            if docker-compose exec -T db pg_isready -U $DB_USER >/dev/null 2>&1; then
                log_success "PostgreSQL容器启动成功"
                return 0
            fi
            echo "等待数据库启动... ($i/30)"
            sleep 2
        done
        
        log_error "PostgreSQL容器启动超时"
        return 1
    else
        log_error "未找到docker-compose.yml文件"
        return 1
    fi
}

# 创建数据库（如果不存在）
create_database() {
    log_info "检查并创建数据库..."
    
    # 使用Docker执行
    if docker ps | grep -q postgres; then
        # 检查数据库是否存在
        if docker-compose exec -T db psql -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
            log_success "数据库 '$DB_NAME' 已存在"
        else
            log_info "创建数据库 '$DB_NAME'..."
            docker-compose exec -T db createdb -U $DB_USER $DB_NAME
            log_success "数据库 '$DB_NAME' 创建成功"
        fi
    else
        # 使用本地psql
        if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
            log_success "数据库 '$DB_NAME' 已存在"
        else
            log_info "创建数据库 '$DB_NAME'..."
            createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
            log_success "数据库 '$DB_NAME' 创建成功"
        fi
    fi
}

# 初始化数据库表结构
init_database_schema() {
    log_info "初始化数据库表结构..."
    
    # 进入backend目录
    if [ ! -d "backend" ]; then
        log_error "未找到backend目录"
        return 1
    fi
    
    cd backend
    
    # 检查是否有uv包管理器
    if command -v uv &> /dev/null; then
        log_info "使用uv运行数据库迁移..."
        
        # 运行数据库迁移
        uv run alembic upgrade head
        
        # 创建初始数据
        uv run python app/initial_data.py
        
    elif command -v python3 &> /dev/null; then
        log_info "使用python3运行数据库迁移..."
        
        # 安装依赖（如果需要）
        if [ -f "requirements.txt" ]; then
            pip3 install -r requirements.txt
        fi
        
        # 运行数据库迁移
        python3 -m alembic upgrade head
        
        # 创建初始数据
        python3 app/initial_data.py
        
    else
        log_error "未找到Python环境"
        cd ..
        return 1
    fi
    
    cd ..
    log_success "数据库表结构初始化完成"
}

# 使用Docker容器初始化
init_with_docker() {
    log_info "使用Docker容器初始化数据库..."
    
    if [ -f "docker-compose.yml" ]; then
        # 运行prestart服务进行初始化
        docker-compose run --rm prestart
        log_success "Docker容器初始化完成"
    else
        log_error "未找到docker-compose.yml文件"
        return 1
    fi
}

# 验证数据库初始化结果
verify_database() {
    log_info "验证数据库初始化结果..."
    
    # 检查表是否存在
    local tables=("user" "item" "roles_dir" "roles" "role_template" "role_template_item" "role_prompt" "task_creat_role_prompt")
    
    for table in "${tables[@]}"; do
        if docker ps | grep -q postgres; then
            # 使用Docker检查
            if docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -c "SELECT 1 FROM $table LIMIT 1;" >/dev/null 2>&1; then
                log_success "表 '$table' 存在并可访问"
            else
                log_warning "表 '$table' 不存在或无法访问"
            fi
        else
            # 使用本地psql检查
            if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1 FROM $table LIMIT 1;" >/dev/null 2>&1; then
                log_success "表 '$table' 存在并可访问"
            else
                log_warning "表 '$table' 不存在或无法访问"
            fi
        fi
    done
    
    # 检查初始用户
    if docker ps | grep -q postgres; then
        user_count=$(docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM \"user\";" | tr -d ' ')
    else
        user_count=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM \"user\";" | tr -d ' ')
    fi
    
    if [ "$user_count" -gt 0 ]; then
        log_success "初始用户已创建（$user_count 个用户）"
    else
        log_warning "未找到初始用户"
    fi
}

# 显示连接信息
show_connection_info() {
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}    数据库初始化完成！${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "${BLUE}数据库连接信息：${NC}"
    echo -e "  主机: $DB_HOST"
    echo -e "  端口: $DB_PORT"
    echo -e "  数据库: $DB_NAME"
    echo -e "  用户: $DB_USER"
    echo ""
    echo -e "${BLUE}管理界面：${NC}"
    echo -e "  Adminer: http://localhost:8080"
    echo ""
    echo -e "${BLUE}默认超级用户：${NC}"
    echo -e "  邮箱: ${FIRST_SUPERUSER:-admin@example.com}"
    echo -e "  密码: ${FIRST_SUPERUSER_PASSWORD:-admin123456}"
    echo ""
}

# 显示帮助信息
show_help() {
    echo "数据库快速初始化脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --docker     使用Docker容器初始化（推荐）"
    echo "  --local      使用本地Python环境初始化"
    echo "  --verify     仅验证数据库状态"
    echo "  --help       显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0           # 自动选择初始化方式"
    echo "  $0 --docker  # 使用Docker初始化"
    echo "  $0 --local   # 使用本地环境初始化"
    echo ""
}

# 主函数
main() {
    echo -e "${BLUE}数据库快速初始化工具${NC}"
    echo ""
    
    case "${1:-}" in
        --docker)
            # 强制使用Docker方式
            if ! check_postgres; then
                start_postgres_docker
            fi
            create_database
            init_with_docker
            verify_database
            show_connection_info
            ;;
        --local)
            # 强制使用本地方式
            if ! check_postgres; then
                log_error "请先启动PostgreSQL服务"
                exit 1
            fi
            create_database
            init_database_schema
            verify_database
            show_connection_info
            ;;
        --verify)
            # 仅验证
            verify_database
            ;;
        --help|-h)
            show_help
            ;;
        "")
            # 自动选择方式
            if ! check_postgres; then
                log_info "尝试启动PostgreSQL Docker容器..."
                if start_postgres_docker; then
                    create_database
                    init_with_docker
                else
                    log_error "无法启动PostgreSQL，请手动启动数据库服务"
                    exit 1
                fi
            else
                create_database
                # 优先使用Docker方式
                if docker ps | grep -q postgres && [ -f "docker-compose.yml" ]; then
                    init_with_docker
                else
                    init_database_schema
                fi
            fi
            verify_database
            show_connection_info
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"