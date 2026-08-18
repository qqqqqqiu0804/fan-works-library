-- Migration: tighten_rls
-- 2026-08-18
-- 收紧行级安全（雷2）：读 / 投公开；改 / 删仅作者本人或管理员；收藏仅本人。
-- 管理员识别：users.role = 'admin'（见 is_admin() 函数）。
-- 作者识别：works.author_uid = auth.uid()（auth.uid() 返回 text，与 author_uid(text) 一致；
--           切勿用 current_user，那是数据库角色名而非 CloudBase 用户 ID）。

-- 管理员判定函数（SECURITY INVOKER：以调用者权限查 users，users 表公开可读）
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE uid = auth.uid() AND role = 'admin');
$$;

-- ---------- works ----------
DROP POLICY IF EXISTS works_select ON works;
DROP POLICY IF EXISTS works_insert ON works;
DROP POLICY IF EXISTS works_update ON works;
DROP POLICY IF EXISTS works_delete ON works;

CREATE POLICY works_select ON works FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY works_insert ON works FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY works_update ON works FOR UPDATE TO authenticated
  USING (author_uid = auth.uid() OR is_admin())
  WITH CHECK (author_uid = auth.uid() OR is_admin());
CREATE POLICY works_delete ON works FOR DELETE TO authenticated
  USING (author_uid = auth.uid() OR is_admin());

-- ---------- favorites（仅本人可看 / 加 / 删自己的收藏） ----------
DROP POLICY IF EXISTS favorites_all ON favorites;
CREATE POLICY favorites_select ON favorites FOR SELECT TO anon, authenticated USING (uid = auth.uid());
CREATE POLICY favorites_insert ON favorites FOR INSERT TO anon, authenticated WITH CHECK (uid = auth.uid());
CREATE POLICY favorites_delete ON favorites FOR DELETE TO anon, authenticated USING (uid = auth.uid());
