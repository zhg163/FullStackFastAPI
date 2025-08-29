#!/bin/bash

# 数据库备份脚本
# 支持本地和生产环境

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 默认配置
ENVIRONMENT="development"
BACKUP_DIR="./backups"
COMPOSE_FILE="docker-compose.override.yml"

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --restore)
            RESTORE_FILE="$2"
            shift 2
            ;;
        -h|--help)
            echo "数据库备份/恢复脚本"
            echo "使用方法: $0 [选项]"
            echo "选项:"
            echo "  --env ENV        环境 (development|production, 默认: development)"
            echo "  --dir DIR        备份目录 (默认: ./backups)"
            echo "  --restore FILE   恢复指定备份文件"
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
if [ "$ENVIRONMENT" = "production" ]; then
    COMPOSE_FILE="docker-compose.production.yml"
fi

# 加载环境变量
if [ "$ENVIRONMENT" = "production" ] && [ -f ".env.production" ]; then
    export $(cat .env.production | xargs)
elif [ -f ".env" ]; then
    export $(cat .env | xargs)
fi

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份函数
backup_database() {
    log_info "开始备份数据库..."
    
    timestamp=$(date +"%Y%m%d_%H%M%S")
    backup_file="${BACKUP_DIR}/backup_${ENVIRONMENT}_${timestamp}.sql"
    
    # 执行备份
    docker-compose -f "$COMPOSE_FILE" exec -T db pg_dump \
        -U "${POSTGRES_USER:-postgres}" \
        -d "${POSTGRES_DB:-app}" \
        --clean \
        --create \
        --verbose > "$backup_file"
    
    # 压缩备份文件
    gzip "$backup_file"
    backup_file="${backup_file}.gz"
    
    log_success "备份完成: $backup_file"
    
    # 显示备份文件大小
    size=$(du -h "$backup_file" | cut -f1)
    log_info "备份文件大小: $size"
    
    # 清理旧备份 (保留最近10个)
    ls -t "${BACKUP_DIR}"/backup_${ENVIRONMENT}_*.sql.gz | tail -n +11 | xargs -r rm
    log_info "已清理旧备份文件"
}

# 恢复函数
restore_database() {
    if [ -z "$RESTORE_FILE" ]; then
        log_error "请指定要恢复的备份文件"
        exit 1
    fi
    
    if [ ! -f "$RESTORE_FILE" ]; then
        log_error "备份文件不存在: $RESTORE_FILE"
        exit 1
    fi
    
    log_info "开始恢复数据库: $RESTORE_FILE"
    
    # 确认操作
    read -p "这将覆盖现有数据库，是否继续? (y/N): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        log_info "操作已取消"
        exit 0
    fi
    
    # 停止依赖数据库的服务
    log_info "停止相关服务..."
    docker-compose -f "$COMPOSE_FILE" stop backend prestart
    
    # 解压并恢复
    if [[ "$RESTORE_FILE" == *.gz ]]; then
        gunzip -c "$RESTORE_FILE" | docker-compose -f "$COMPOSE_FILE" exec -T db psql \
            -U "${POSTGRES_USER:-postgres}" \
            -d postgres
    else
        cat "$RESTORE_FILE" | docker-compose -f "$COMPOSE_FILE" exec -T db psql \
            -U "${POSTGRES_USER:-postgres}" \
            -d postgres
    fi
    
    # 重启服务
    log_info "重启服务..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    log_success "数据库恢复完成"
}

# 列出备份文件
list_backups() {
    log_info "可用的备份文件:"
    ls -la "${BACKUP_DIR}"/backup_${ENVIRONMENT}_*.sql.gz 2>/dev/null || log_info "没有找到备份文件"
}

# 主逻辑
if [ -n "$RESTORE_FILE" ]; then
    restore_database
else
    backup_database
    list_backups
fi
