#!/bin/bash
# 阿里云服务器部署脚本

set -e

echo "🚀 开始阿里云服务器部署..."
echo "服务器地址: 8.149.132.119"
echo "前端端口: 5173"
echo "后端端口: 8000"

# 设置环境变量
export VITE_API_URL=http://8.149.132.119:8000
export NODE_ENV=production

# 清理之前的构建
echo "🧹 清理之前的构建文件..."
rm -rf dist
rm -rf node_modules/.vite

# 安装依赖
echo "📦 安装依赖..."
npm install

# 构建项目
echo "🔨 构建项目..."
npm run build

# 启动预览服务器（生产模式）
echo "🌐 启动生产预览服务器..."
echo "访问地址: http://8.149.132.119:5173 (服务器绑定0.0.0.0:5173)"
npm run preview:external