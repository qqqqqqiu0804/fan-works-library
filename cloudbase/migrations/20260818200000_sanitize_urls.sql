-- Migration: sanitize_urls
-- 2026-08-18
-- 安全加固（雷2 之后的 XSS 兜底）：works 表的 original_url / links / cover_url 只允许 http(s)。
--
-- 为什么必须做在数据库层：
--   CloudBase 的 anon accessKey 是公开的（写在前端代码里），任何人都能拿它直接调
--   postgREST 接口插入 original_url = 'javascript:...' 之类的数据，绕过前端校验。
--   而模板用 :href="mainLink(w)" 渲染外链，Vue 不会过滤 href，点击即执行脚本
--   （存储型 XSS，可读取受害者会话 token）。因此前端校验不够，必须在写入前由触发器兜底。
--
-- 行为：BEFORE INSERT OR UPDATE 时
--   - links：仅保留以 http(s):// 开头的元素，其余（javascript:/data:/vbscript: 等）丢弃
--   - original_url：非 http(s) 则退化到 links[0]，再不行置空串（text NOT NULL 允许空串）
--   - cover_url：非 http(s) 置空串
-- 这样库里永远只存安全链接，模板渲染即安全。

CREATE OR REPLACE FUNCTION sanitize_work_urls() RETURNS trigger AS $$
DECLARE
  cleaned jsonb := '[]'::jsonb;
  el text;
BEGIN
  -- 清洗 links 数组：只保留 http(s) 元素
  IF NEW.links IS NOT NULL AND jsonb_typeof(NEW.links) = 'array' THEN
    FOR el IN SELECT jsonb_array_elements_text(NEW.links) LOOP
      IF el ~* '^https?://' THEN
        cleaned := cleaned || to_jsonb(el);
      END IF;
    END LOOP;
  END IF;
  NEW.links := cleaned;

  -- original_url 必须是 http(s)，否则借 links[0]，再不行置空串
  IF NEW.original_url IS NULL OR NEW.original_url !~* '^https?://' THEN
    IF jsonb_array_length(cleaned) > 0 THEN
      NEW.original_url := cleaned ->> 0;
    ELSE
      NEW.original_url := '';
    END IF;
  END IF;

  -- cover_url 非 http(s) 置空串
  IF NEW.cover_url IS NOT NULL AND NEW.cover_url !~* '^https?://' THEN
    NEW.cover_url := '';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sanitize_work_urls ON works;
CREATE TRIGGER trg_sanitize_work_urls
  BEFORE INSERT OR UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION sanitize_work_urls();
