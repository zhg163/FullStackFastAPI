-- =============================================================================
-- PostgreSQL数据库初始化脚本
-- =============================================================================

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 设置时区
SET timezone = 'Asia/Shanghai';

-- 创建应用数据库用户（如果需要）
-- CREATE USER app_user WITH PASSWORD 'app_password';
-- GRANT ALL PRIVILEGES ON DATABASE fullstack_app TO app_user;

-- 设置默认搜索路径
-- ALTER DATABASE fullstack_app SET search_path TO public;

-- 创建一些有用的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 输出初始化完成信息
DO $$
BEGIN
    RAISE NOTICE 'Database initialization completed successfully!';
    RAISE NOTICE 'Extensions created: uuid-ossp, pgcrypto';
    RAISE NOTICE 'Timezone set to: Asia/Shanghai';
    RAISE NOTICE 'update_updated_at_column() function created';
END $$;