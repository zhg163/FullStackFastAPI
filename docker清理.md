# 停止所有容器
docker compose down

# 清理Docker构建缓存
docker builder prune -a -f

# 清理所有未使用的资源
docker system prune -a -f

# 清理卷（注意：这会删除数据库数据）
docker volume prune -f

# 重新构建并启动
docker compose build --no-cache
docker compose up -d

#安装数据库
docker compose up db -d
#数据库迁移创建表
uv run alembic upgrade head



cd backend
uv sync
fastapi dev app/main.py &
uv run fastapi dev app/main.py


# 1. 安装依赖
cd backend && uv sync

# 2. 启动Redis
redis-server

# 3. 启动FastAPI
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 4. 启动RQ Workers
bash scripts/start_rq_workers.sh


cd ../frontend  
apt install npm
npm install
npm run dev &









# === 2. 创建项目虚拟环境 ===

echo "=== 创建Python虚拟环境 ==="
cd /opt/FullStackFastAPI
apt install python3.12-venv
python3 -m venv venv

echo "=== 激活虚拟环境 ==="
source venv/bin/activate

echo "=== 升级pip ==="
pip install --upgrade pip

echo "=== 配置pip使用国内源 ==="
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple/
pip config set global.trusted-host pypi.tuna.tsinghua.edu.cn

echo "=== 安装Python依赖 ==="



# === 停止当前安装 ===
# 按 Ctrl+C 停止当前安装

# === 分批安装核心依赖 ===

echo "=== 确保在虚拟环境中 ==="
cd /home/FullStackFastAPI/backend
source venv/bin/activate

echo "=== 第1批：安装核心框架 ==="
pip install --no-deps fastapi==0.104.1
pip install --no-deps uvicorn==0.24.0
pip install --no-deps pydantic==2.5.0

echo "=== 第2批：安装数据库相关 ==="
pip install --no-deps sqlalchemy==2.0.23
pip install --no-deps psycopg2-binary==2.9.7
pip install --no-deps alembic==1.12.1

echo "=== 第3批：安装认证相关 ==="
pip install --no-deps bcrypt==4.0.1
pip install --no-deps passlib==1.7.4
pip install --no-deps python-jose==3.3.0

echo "=== 第4批：安装其他必需依赖 ==="
pip install --no-deps python-multipart==0.0.6
pip install --no-deps python-dotenv==1.0.0
pip install --no-deps pydantic-settings==2.1.0

echo "=== 第5批：安装监控（可选）==="
pip install --no-deps sentry-sdk==1.40.6

echo "=== 安装缺失的运行时依赖 ==="
pip install starlette
pip install anyio
pip install sniffio
pip install typing-extensions
pip install annotated-types
pip install psycopg[binary]
pip install jinja2
pip install redis

echo "=== 检查安装结果 ==="
pip list


apt update
apt install -y postgresql-server-dev-all libpq-dev
pip install psycopg2-binary