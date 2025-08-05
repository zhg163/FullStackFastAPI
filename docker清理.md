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
npm install
npm run dev &