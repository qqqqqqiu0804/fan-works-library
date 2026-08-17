# CloudBase 接入说明（已大部分自动化完成）

本项目后端用 **腾讯云开发 CloudBase 的 PostgreSQL** 实例（环境 ID `kh-library-d8g5r9pxu24e60f0a`）。
之所以不用 Supabase：它的节点在海外，国内浏览器访问其 REST 端点会超时，表现为「点提交没动静 / Failed to fetch」。CloudBase 有国内节点，粉丝在国内可直连投稿。

## 已经帮你做好的部分（通过 WorkBuddy 的 CloudBase 连接器自动执行）

- ✅ 建好 `works` 表（PostgreSQL），字段：`id / title / author / original_url / links(jsonb) / cover_url / summary / category / tags(jsonb) / status / created_at`
- ✅ 开启行级安全（RLS），并放了两条策略：
  - `anon_select_works`：任何人可读（`USING (true)`）
  - `anon_insert_works`：任何人可投稿（`WITH CHECK (true)`）
  这对应「无审核、任何人可投稿」的需求。将来加审核，把插入策略改成需要登录即可。
- 迁移记录落在 `cloudbase/migrations/20260817080636_create_works.sql`

## 你只在部署平台补一步：配置环境变量

- Netlify：站点 → Site settings → Environment variables，新增
  - `VITE_CLOUDBASE_ENV_ID` = `kh-library-d8g5r9pxu24e60f0a`
- 改完后 **Deploys → Trigger deploy → Deploy site** 让变量生效（Vite 仅在构建时注入）

> envId 是「公开标识符」不是密钥，嵌在前端没问题（安全靠上面的 RLS 策略）。

## 验证

刷新网站 → 批量导入 → 粘文本 → 解析预览 → 确认提交 → 去 CloudBase 控制台数据库 `works` 表看有没有数据。有 = 全链路通了。

## 数据字段说明（works 表）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigint | 自增主键 |
| `title` | text | 作品标题 |
| `author` | text | 作者（可空） |
| `original_url` | text | 主链接（批量时为第一章） |
| `links` | jsonb | 多章节链接数组 |
| `cover_url` | text | 封面（可空） |
| `summary` | text | 简介（可空） |
| `category` | text | 分类（可空） |
| `tags` | jsonb | 标签数组 |
| `status` | smallint | 1=展示；将来审核用 0=待审 |
| `created_at` | timestamptz | 创建时间 |
