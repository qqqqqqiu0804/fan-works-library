-- Migration: auth_roles_favorites
-- 2026-08-17
-- 1) works 表 RLS 从 anon 专用改为 PUBLIC（兼容匿名与邮箱登录两种连接角色）
-- 2) works 新增 author_uid（记录投稿者，用于"普通用户管理自己投稿"）
-- 3) users 表 + 触发器（插入时强制 role='user'，防越权）
-- 4) favorites 表（收藏）

DROP POLICY IF EXISTS anon_select_works ON works;
DROP POLICY IF EXISTS anon_insert_works ON works;
DROP POLICY IF EXISTS anon_update_works ON works;
DROP POLICY IF EXISTS anon_delete_works ON works;

CREATE POLICY works_select ON works FOR SELECT USING (true);
CREATE POLICY works_insert ON works FOR INSERT WITH CHECK (true);
CREATE POLICY works_update ON works FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY works_delete ON works FOR DELETE USING (true);

ALTER TABLE works ADD COLUMN IF NOT EXISTS author_uid text;

CREATE TABLE IF NOT EXISTS users (
  uid text PRIMARY KEY,
  email text,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_select ON users FOR SELECT USING (true);
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION force_user_role() RETURNS trigger AS $$
BEGIN
  NEW.role = 'user';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_force_user_role ON users;
CREATE TRIGGER trg_force_user_role BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION force_user_role();

CREATE TABLE IF NOT EXISTS favorites (
  uid text NOT NULL,
  work_id bigint NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (uid, work_id)
);
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS favorites_all ON favorites;
CREATE POLICY favorites_all ON favorites FOR ALL USING (true) WITH CHECK (true);
