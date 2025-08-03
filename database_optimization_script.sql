-- ================================
-- task_creat_role_prompt 表优化脚本
-- ================================

-- 1. 添加缺失的外键约束
ALTER TABLE task_creat_role_prompt
ADD CONSTRAINT fk_task_creat_role_prompt_role_id 
FOREIGN KEY (role_id) REFERENCES roles(id) 
ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. 添加性能优化索引
CREATE INDEX IF NOT EXISTS idx_task_creat_role_prompt_role_id 
ON task_creat_role_prompt(role_id);

CREATE INDEX IF NOT EXISTS idx_task_creat_role_prompt_task_state 
ON task_creat_role_prompt(task_state);

CREATE INDEX IF NOT EXISTS idx_task_creat_role_prompt_task_name 
ON task_creat_role_prompt USING gin(to_tsvector('simple', task_name));

CREATE INDEX IF NOT EXISTS idx_task_creat_role_prompt_created_at 
ON task_creat_role_prompt(created_at DESC);

-- 3. 添加数据完整性约束
ALTER TABLE task_creat_role_prompt 
ADD CONSTRAINT check_task_state 
CHECK (task_state IS NULL OR task_state IN ('C', 'P', 'F', 'W'));

-- 4. 设置默认值
ALTER TABLE task_creat_role_prompt 
ALTER COLUMN created_at SET DEFAULT NOW();

-- 5. JSON字段验证（可选）
ALTER TABLE task_creat_role_prompt 
ADD CONSTRAINT check_task_cmd_valid_json 
CHECK (task_cmd IS NULL OR json_typeof(task_cmd) = 'object');

ALTER TABLE task_creat_role_prompt 
ADD CONSTRAINT check_role_item_prompt_valid_json 
CHECK (role_item_prompt IS NULL OR json_typeof(role_item_prompt) = 'object');

-- 6. 添加复合索引优化常见查询
CREATE INDEX IF NOT EXISTS idx_task_creat_role_prompt_role_state 
ON task_creat_role_prompt(role_id, task_state);

-- 7. 添加注释
COMMENT ON COLUMN task_creat_role_prompt.task_state IS '任务状态: C=已完成, P=进行中, F=失败, W=等待中';
COMMENT ON CONSTRAINT check_task_state ON task_creat_role_prompt IS '任务状态必须是 C/P/F/W 之一';

-- ================================
-- 验证优化效果查询
-- ================================

-- 查看表结构
\d task_creat_role_prompt

-- 查看索引
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'task_creat_role_prompt'
ORDER BY indexname;

-- 查看约束
SELECT 
    conname,
    contype,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'task_creat_role_prompt'::regclass
ORDER BY contype, conname;