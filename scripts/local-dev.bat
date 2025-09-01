@echo off
setlocal enabledelayedexpansion

REM =============================================================================
REM FullStackFastAPI Windows 本地开发环境启动脚本
REM =============================================================================

echo ================================================
echo     FullStackFastAPI 本地开发环境启动工具
echo ================================================
echo 技术栈: FastAPI + React + PostgreSQL + Redis
echo 时间: %date% %time%
echo 工作目录: %cd%
echo ================================================
echo.

REM 检查Docker是否运行
echo [INFO] 检查Docker环境...
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker未运行或未安装，请先启动Docker Desktop
    pause
    exit /b 1
)
echo [SUCCESS] Docker环境检查通过

REM 检查docker-compose
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] docker-compose未安装
    pause
    exit /b 1
)
echo [SUCCESS] Docker Compose可用

REM 检查必要文件
if not exist "docker-compose.yml" (
    echo [ERROR] docker-compose.yml文件不存在
    pause
    exit /b 1
)

REM 创建默认环境文件（如果不存在）
if not exist ".env" (
    echo [INFO] 创建默认.env配置文件...
    (
        echo # ======================
        echo # 基础配置
        echo # ======================
        echo DOMAIN=localhost
        echo FRONTEND_HOST=http://localhost:5173
        echo ENVIRONMENT=local
        echo PROJECT_NAME=Full Stack FastAPI Project
        echo STACK_NAME=fullstack-fastapi
        echo.
        echo # ======================
        echo # 安全配置
        echo # ======================
        echo SECRET_KEY=your-secret-key-change-this-in-production
        echo BACKEND_CORS_ORIGINS=["http://localhost:5173","https://localhost:5173","http://localhost","https://localhost"]
        echo.
        echo # ======================
        echo # 数据库配置
        echo # ======================
        echo POSTGRES_SERVER=localhost
        echo POSTGRES_PORT=5432
        echo POSTGRES_USER=postgres
        echo POSTGRES_PASSWORD=your_secure_password
        echo POSTGRES_DB=fullstack_app
        echo.
        echo # ======================
        echo # 初始用户配置
        echo # ======================
        echo FIRST_SUPERUSER=admin@example.com
        echo FIRST_SUPERUSER_PASSWORD=admin123456
        echo.
        echo # ======================
        echo # 邮件配置
        echo # ======================
        echo SMTP_HOST=
        echo SMTP_USER=
        echo SMTP_PASSWORD=
        echo EMAILS_FROM_EMAIL=noreply@example.com
        echo.
        echo # ======================
        echo # 错误监控
        echo # ======================
        echo SENTRY_DSN=
        echo.
        echo # ======================
        echo # Redis配置
        echo # ======================
        echo REDIS_URL=redis://localhost:6379/0
        echo RQ_QUEUE_NAME=ai_tasks
        echo.
        echo # ======================
        echo # AI API配置
        echo # ======================
        echo DEFAULT_API_PROVIDER=mock
        echo QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
        echo QWEN_API_KEY=
        echo DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
        echo DEEPSEEK_API_KEY=
    ) > .env
    echo [SUCCESS] 已创建默认.env文件
    echo [WARNING] 请编辑.env文件，配置正确的密码和API密钥
)

REM 处理命令行参数
set "command=%1"
if "%command%"=="--stop" goto stop_services
if "%command%"=="--clean" goto clean_data
if "%command%"=="--logs" goto show_logs
if "%command%"=="--help" goto show_help

REM 默认启动流程
:start_services
echo.
echo [STEP] 启动本地开发环境...

REM 停止现有服务
echo [INFO] 停止现有服务...
docker-compose down >nul 2>&1

REM 启动数据库和Redis
echo [INFO] 启动数据库和缓存服务...
docker-compose up -d db redis
if errorlevel 1 (
    echo [ERROR] 数据库服务启动失败
    pause
    exit /b 1
)

REM 等待数据库启动
echo [INFO] 等待PostgreSQL数据库启动...
timeout /t 15 /nobreak >nul

REM 检查数据库是否就绪
echo [INFO] 检查数据库连接...
for /L %%i in (1,1,30) do (
    docker-compose exec -T db pg_isready -U postgres >nul 2>&1
    if not errorlevel 1 (
        echo [SUCCESS] PostgreSQL数据库已就绪
        goto db_ready
    )
    echo 等待数据库启动... (%%i/30^)
    timeout /t 2 /nobreak >nul
)
echo [ERROR] 数据库启动超时
pause
exit /b 1

:db_ready
REM 初始化数据库
echo [INFO] 初始化数据库...
docker-compose run --rm prestart
if errorlevel 1 (
    echo [ERROR] 数据库初始化失败
    pause
    exit /b 1
)
echo [SUCCESS] 数据库初始化完成

REM 启动后端服务
echo [INFO] 启动后端API服务...
docker-compose up -d backend
if errorlevel 1 (
    echo [ERROR] 后端服务启动失败
    pause
    exit /b 1
)

REM 等待后端服务启动
echo [INFO] 等待后端API服务启动...
for /L %%i in (1,1,30) do (
    curl -f http://localhost:8000/api/v1/utils/health-check/ >nul 2>&1
    if not errorlevel 1 (
        echo [SUCCESS] 后端API服务已启动
        goto backend_ready
    )
    echo 等待后端API启动... (%%i/30^)
    timeout /t 2 /nobreak >nul
)
echo [WARNING] 后端API服务启动超时，请检查日志

:backend_ready
REM 启动前端服务
echo [INFO] 启动前端服务...
docker-compose up -d frontend
if errorlevel 1 (
    echo [ERROR] 前端服务启动失败
    pause
    exit /b 1
)

REM 启动管理工具
echo [INFO] 启动管理工具...
docker-compose up -d adminer

REM 显示服务状态
echo.
echo [INFO] 检查服务状态...
docker-compose ps

REM 显示访问信息
echo.
echo ================================================
echo     开发环境启动完成！
echo ================================================
echo.
echo 应用访问地址:
echo   前端应用:    http://localhost:5173
echo   后端API:     http://localhost:8000
echo   API文档:     http://localhost:8000/docs
echo   数据库管理:  http://localhost:8080
echo.
echo 默认登录信息:
echo   邮箱: admin@example.com
echo   密码: admin123456
echo.
echo 管理命令:
echo   查看日志:    %~nx0 --logs
echo   停止服务:    %~nx0 --stop
echo   清理数据:    %~nx0 --clean
echo.
echo 按任意键退出...
pause >nul
exit /b 0

:stop_services
echo [INFO] 停止所有服务...
docker-compose down
echo [SUCCESS] 所有服务已停止
pause
exit /b 0

:clean_data
echo [WARNING] 这将删除所有数据库数据！
set /p confirm="确认清理数据? (y/N): "
if /i not "%confirm%"=="y" (
    echo [INFO] 清理操作已取消
    pause
    exit /b 0
)

echo [INFO] 清理数据和容器...
docker-compose down -v
docker volume rm fullstackfastapi_app-db-data 2>nul
docker volume rm fullstackfastapi_redis-data 2>nul
echo [SUCCESS] 数据清理完成

echo [INFO] 重新初始化环境...
goto start_services

:show_logs
docker-compose logs -f
exit /b 0

:show_help
echo Windows 本地开发环境启动脚本
echo.
echo 使用方法:
echo   %~nx0 [选项]
echo.
echo 选项:
echo   --stop     停止所有服务
echo   --clean    清理数据并重新初始化
echo   --logs     查看服务日志
echo   --help     显示帮助信息
echo.
echo 示例:
echo   %~nx0          启动开发环境
echo   %~nx0 --stop   停止所有服务
echo   %~nx0 --clean  清理并重新初始化
echo.
pause
exit /b 0