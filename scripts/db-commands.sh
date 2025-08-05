#!/bin/bash

# =============================================================================
# PostgreSQL数据库管理脚本
# =============================================================================

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 从.env文件加载环境变量
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

# 默认值
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-your_secure_password}
POSTGRES_DB=${POSTGRES_DB:-fullstack_app}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
CONTAINER_NAME="fullstack_postgres"

# 帮助信息
show_help() {
    echo -e "${BLUE}PostgreSQL数据库管理脚本${NC}"
    echo ""
    echo "使用方法: $0 [命令]"
    echo ""
    echo "可用命令:"
    echo -e "  ${GREEN}start${NC}     - 启动PostgreSQL容器"
    echo -e "  ${GREEN}stop${NC}      - 停止PostgreSQL容器"
    echo -e "  ${GREEN}restart${NC}   - 重启PostgreSQL容器"
    echo -e "  ${GREEN}status${NC}    - 查看容器状态"
    echo -e "  ${GREEN}logs${NC}      - 查看容器日志"
    echo -e "  ${GREEN}connect${NC}   - 连接到数据库"
    echo -e "  ${GREEN}backup${NC}    - 备份数据库"
    echo -e "  ${GREEN}restore${NC}   - 恢复数据库"
    echo -e "  ${GREEN}reset${NC}     - 重置数据库（删除所有数据）"
    echo -e "  ${GREEN}init${NC}      - 初始化数据库和数据"
    echo -e "  ${GREEN}clean${NC}     - 清理容器和数据卷"
    echo ""
}

# 启动数据库
start_db() {
    echo -e "${BLUE}启动PostgreSQL容器...${NC}"
    
    if docker ps | grep -q $CONTAINER_NAME; then
        echo -e "${YELLOW}容器已经在运行中${NC}"
        return
    fi
    
    if docker ps -a | grep -q $CONTAINER_NAME; then
        docker start $CONTAINER_NAME
    else
        docker-compose -f docker-compose.postgres.yml up -d postgres
    fi
    
    echo -e "${GREEN}等待数据库启动...${NC}"
    sleep 10
    
    if docker ps | grep -q $CONTAINER_NAME; then
        echo -e "${GREEN}PostgreSQL容器启动成功！${NC}"
    else
        echo -e "${RED}PostgreSQL容器启动失败${NC}"
        exit 1
    fi
}

# 停止数据库
stop_db() {
    echo -e "${BLUE}停止PostgreSQL容器...${NC}"
    docker stop $CONTAINER_NAME
    echo -e "${GREEN}PostgreSQL容器已停止${NC}"
}

# 重启数据库
restart_db() {
    echo -e "${BLUE}重启PostgreSQL容器...${NC}"
    stop_db
    start_db
}

# 查看状态
status_db() {
    echo -e "${BLUE}PostgreSQL容器状态:${NC}"
    docker ps -a | grep postgres
    echo ""
    echo -e "${BLUE}数据库连接测试:${NC}"
    docker exec $CONTAINER_NAME pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
}

# 查看日志
logs_db() {
    echo -e "${BLUE}PostgreSQL容器日志:${NC}"
    docker logs -f $CONTAINER_NAME
}

# 连接数据库
connect_db() {
    echo -e "${BLUE}连接到PostgreSQL数据库...${NC}"
    docker exec -it $CONTAINER_NAME psql -U $POSTGRES_USER -d $POSTGRES_DB
}

# 备份数据库
backup_db() {
    BACKUP_DIR="./backups"
    mkdir -p $BACKUP_DIR
    
    BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
    
    echo -e "${BLUE}备份数据库到: $BACKUP_FILE${NC}"
    docker exec $CONTAINER_NAME pg_dump -U $POSTGRES_USER -d $POSTGRES_DB > $BACKUP_FILE
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}数据库备份成功！${NC}"
        ls -lh $BACKUP_FILE
    else
        echo -e "${RED}数据库备份失败${NC}"
        exit 1
    fi
}

# 恢复数据库
restore_db() {
    if [ -z "$2" ]; then
        echo -e "${RED}请提供备份文件路径${NC}"
        echo "使用方法: $0 restore <backup_file>"
        exit 1
    fi
    
    BACKUP_FILE=$2
    
    if [ ! -f "$BACKUP_FILE" ]; then
        echo -e "${RED}备份文件不存在: $BACKUP_FILE${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}警告: 这将覆盖现有数据库！${NC}"
    read -p "确认恢复数据库? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}恢复数据库从: $BACKUP_FILE${NC}"
        docker exec -i $CONTAINER_NAME psql -U $POSTGRES_USER -d $POSTGRES_DB < $BACKUP_FILE
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}数据库恢复成功！${NC}"
        else
            echo -e "${RED}数据库恢复失败${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}恢复操作已取消${NC}"
    fi
}

# 重置数据库
reset_db() {
    echo -e "${YELLOW}警告: 这将删除所有数据库数据！${NC}"
    read -p "确认重置数据库? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}重置数据库...${NC}"
        
        # 停止容器
        docker stop $CONTAINER_NAME
        
        # 删除数据卷
        docker volume rm fullstackfastapi_postgres_data 2>/dev/null || true
        
        # 重新启动
        start_db
        
        echo -e "${GREEN}数据库重置完成！${NC}"
    else
        echo -e "${YELLOW}重置操作已取消${NC}"
    fi
}

# 初始化数据库和数据
init_db() {
    echo -e "${BLUE}初始化数据库和应用数据...${NC}"
    
    # 确保数据库运行
    start_db
    
    # 等待数据库完全启动
    echo -e "${BLUE}等待数据库完全启动...${NC}"
    sleep 15
    
    # 进入backend目录执行数据库迁移
    cd backend || { echo -e "${RED}找不到backend目录${NC}"; exit 1; }
    
    echo -e "${BLUE}运行数据库迁移...${NC}"
    uv run alembic upgrade head
    
    echo -e "${BLUE}创建初始数据...${NC}"
    uv run python app/initial_data.py
    
    cd ..
    
    echo -e "${GREEN}数据库初始化完成！${NC}"
    echo ""
    echo -e "${GREEN}超级用户信息:${NC}"
    echo -e "  邮箱: ${FIRST_SUPERUSER}"
    echo -e "  密码: ${FIRST_SUPERUSER_PASSWORD}"
}

# 清理容器和数据
clean_db() {
    echo -e "${YELLOW}警告: 这将删除所有容器和数据！${NC}"
    read -p "确认清理所有数据? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}清理容器和数据...${NC}"
        
        # 停止并删除容器
        docker-compose -f docker-compose.postgres.yml down -v
        
        # 删除数据卷
        docker volume rm fullstackfastapi_postgres_data 2>/dev/null || true
        docker volume rm fullstackfastapi_redis_data 2>/dev/null || true
        docker volume rm fullstackfastapi_pgadmin_data 2>/dev/null || true
        
        echo -e "${GREEN}清理完成！${NC}"
    else
        echo -e "${YELLOW}清理操作已取消${NC}"
    fi
}

# 主逻辑
case "$1" in
    start)
        start_db
        ;;
    stop)
        stop_db
        ;;
    restart)
        restart_db
        ;;
    status)
        status_db
        ;;
    logs)
        logs_db
        ;;
    connect)
        connect_db
        ;;
    backup)
        backup_db
        ;;
    restore)
        restore_db "$@"
        ;;
    reset)
        reset_db
        ;;
    init)
        init_db
        ;;
    clean)
        clean_db
        ;;
    *)
        show_help
        ;;
esac