#!/bin/bash
# 外部IP开发环境启动脚本

echo "启动外部IP访问的开发环境..."
echo "外部IP: 8.149.132.119:5173"
echo "API地址: 8.149.132.119:8000"

# 设置环境变量
export VITE_API_URL=http://8.149.132.119:8000
export VITE_HMR_HOST=8.149.132.119
export VITE_HMR_PORT=5173
export NODE_ENV=development

# 启动前端开发服务器
cd "$(dirname "$0")"
npm run dev -- --host 0.0.0.0 --port 5173

echo "开发服务器已停止"