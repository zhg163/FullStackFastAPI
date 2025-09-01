#!/bin/bash
# 网络诊断脚本

echo "🔍 网络诊断开始..."

# 检查端口占用
echo "📍 检查端口占用情况:"
echo "端口 5173:"
lsof -i :5173 || echo "端口 5173 未被占用"
echo "端口 8000:"
lsof -i :8000 || echo "端口 8000 未被占用"

# 检查网络连接
echo "🌐 检查网络连接:"
echo "测试后端连接:"
curl -I http://8.149.132.119:8000/api/v1/login/test-token || echo "无法连接到后端"

# 检查防火墙状态
echo "🔥 检查防火墙状态:"
if command -v ufw &> /dev/null; then
    sudo ufw status || echo "无法检查ufw状态"
elif command -v firewall-cmd &> /dev/null; then
    sudo firewall-cmd --list-all || echo "无法检查firewall状态"
else
    echo "未检测到常见的防火墙工具"
fi

# 检查网络接口
echo "🖧 检查网络接口:"
ip addr show || ifconfig || echo "无法获取网络接口信息"

echo "✅ 网络诊断完成"