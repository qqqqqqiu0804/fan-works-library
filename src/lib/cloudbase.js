import cloudbase from '@cloudbase/js-sdk'

// 环境 ID：优先读构建期注入的 VITE_CLOUDBASE_ENV_ID（部署平台 / CLI 可覆盖），
// 缺省回退到硬编码默认值，保证 Git 自动部署 / 本地直接构建都能连上库，
// 不依赖控制台「在线部署」表单里是否填了环境变量。
// 注意：envId 是公开标识符（本就嵌在前端代码里），不是密钥；安全靠数据库安全规则。
// 本环境是 CloudBase PostgreSQL，数据层必须用 app.rdb()（postgREST 风格），
// 不能用 NoSQL 的 app.database()。
const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID || 'kh-library-d8g5r9pxu24e60f0a'

let app = null
let db = null

if (envId) {
  app = cloudbase.init({ env: envId })
  db = app.rdb()
}

// 填了 envId 才启用云端；否则走本地演示模式
export const cloudbaseEnabled = Boolean(envId)
export { app, db }
