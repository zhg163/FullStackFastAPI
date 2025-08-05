#!/bin/bash
# RQ Worker启动脚本

# 设置环境变量
export PYTHONPATH=/Users/zhg/xingxi/FullStackFastAPI/backend
export REDIS_URL=redis://localhost:6379/0

# 颜色输出函数
print_info() {
    echo -e "\033[36m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[31m[ERROR]\033[0m $1"
}

# 检查Redis连接
print_info "检查Redis连接..."
redis-cli ping > /dev/null 2>&1
if [ $? -ne 0 ]; then
    print_error "Redis连接失败，请确保Redis服务正在运行"
    exit 1
fi

print_success "Redis连接正常"

# 检查Python环境
if [ ! -f ".venv/bin/activate" ]; then
    print_error "未找到虚拟环境，请先运行 'uv sync'"
    exit 1
fi

# 激活虚拟环境
source .venv/bin/activate

# 创建PID目录
mkdir -p /tmp/rq_workers

print_info "启动RQ Workers..."

# Worker 1 - 处理AI任务
rq worker ai_tasks --url $REDIS_URL --name worker_ai_1 &
RQ_PID_1=$!
echo $RQ_PID_1 > /tmp/rq_workers/worker_1.pid

# Worker 2 - 处理AI任务
rq worker ai_tasks --url $REDIS_URL --name worker_ai_2 &
RQ_PID_2=$!
echo $RQ_PID_2 > /tmp/rq_workers/worker_2.pid

# Worker 3 - 处理AI任务
rq worker ai_tasks --url $REDIS_URL --name worker_ai_3 &
RQ_PID_3=$!
echo $RQ_PID_3 > /tmp/rq_workers/worker_3.pid

print_success "RQ Workers 启动完成"
print_info "Worker 1 PID: $RQ_PID_1"
print_info "Worker 2 PID: $RQ_PID_2" 
print_info "Worker 3 PID: $RQ_PID_3"

print_info "使用以下命令停止所有Workers:"
print_info "bash scripts/stop_rq_workers.sh"

print_info "使用以下命令查看Workers状态:"
print_info "rq info --url $REDIS_URL"

# 创建停止脚本
cat > scripts/stop_rq_workers.sh << 'EOF'
#!/bin/bash
# 停止RQ Workers

print_info() {
    echo -e "\033[36m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[32m[SUCCESS]\033[0m $1"
}

print_info "停止RQ Workers..."

# 停止所有Workers
for pidfile in /tmp/rq_workers/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            print_success "已停止Worker (PID: $pid)"
        fi
        rm "$pidfile"
    fi
done

print_success "所有RQ Workers已停止"
EOF

chmod +x scripts/stop_rq_workers.sh

# 等待所有进程
wait