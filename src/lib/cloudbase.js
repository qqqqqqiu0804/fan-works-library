import cloudbase from '@cloudbase/js-sdk'

// 环境 ID：优先读构建期注入的 VITE_CLOUDBASE_ENV_ID，缺省回退硬编码默认值。
// region / accessKey（publishable key）同理焊死兜底，保证本地构建、Git 自动部署都连得上，
// 不依赖控制台"在线部署"表单是否填了环境变量。
// 三者都是公开标识（前端代码里本就可见），安全靠数据库安全规则 + RLS，不是靠藏 key。
// 当前环境是 CloudBase PostgreSQL 版，数据层必须用 app.rdb()（postgREST 风格），
// 不能用 NoSQL 的 app.database()。
const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID || 'kh-library-d8g5r9pxu24e60f0a'
const region = import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai'
const accessKey = import.meta.env.VITE_CLOUDBASE_ACCESS_KEY || 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjRjOTUyYWM5LWQ4ZTMtNDUzNC05YmFlLTg0MjBkOTgxMzZmMyJ9.eyJpc3MiOiJodHRwczovL2toLWxpYnJhcnktZDhnNXI5cHh1MjRlNjBmMGEuYXAtc2hhbmdoYWkudGNiLWFwaS50ZW5jZW50Y2xvdWRhcGkuY29tIiwic3ViIjoiYW5vbiIsImF1ZCI6ImtoLWxpYnJhcnktZDhnNXI5cHh1MjRlNjBmMGEiLCJleHAiOjQwOTA2NTEyMDQsImlhdCI6MTc4Njk2ODAwNCwibm9uY2UiOiJuaThIR3lLYVJ2LUl0c1JYX3BveWF3IiwiYXRfaGFzaCI6Im5pOEhHeUthUnYtSXRzUlhfcG95YXciLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoia2gtbGlicmFyeS1kOGc1cjlweHUyNGU2MGYwYSIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.fLt6Lj7PAjaRJyUbWCc63v9yawvRsMePXD9W7qB21rZ8Fh8Qp02LrJl9obX5kXWTuEN-T6Br5VSAUqwHL3U9tvZI18s4Ec5SNiLAMC-q6FCRLF6tHHBdcHNuK5Mz827FlVwp9q8e-WQ_xyTX6J3tfSXoRMvgaTt1PH7XBh0_WjR9w3e-LjMDWydY8RuC32OcxeynH2NtJDFUtdNVUj6aONzmdgeedD_bso3VuJFZbR3xeAXsOmClH9BNVIugIyf1xPYdyyNZL_nAjDlIA8IMbLnUOC_u6hbC5p8jp60P7JqmcTvWKE9InkBuhxikjlOH4oTTuki5d114zE_Pn1s3Wg'

let app = null
let db = null

if (envId) {
  app = cloudbase.init({
    env: envId,
    region,
    accessKey,
    auth: { detectSessionInUrl: true }
  })
  db = app.rdb()
}

// 填了 envId 才启用云端；否则走本地演示模式
export const cloudbaseEnabled = Boolean(envId)
export { app, db }

// ---------- 鉴权 ----------
// 邮箱密码登录：邮箱已注册用户用密码登录
export function getAuth() {
  if (!cloudbaseEnabled || !app) return null
  return app.auth()
}

// 取当前用户 uid：兼容新版 user.id 与旧版 user.uid 两种字段名
export function getUid(u) {
  return u?.id || u?.uid || null
}

// 邮箱密码登录：已注册用户用密码登录
export async function signInEmail(email, password) {
  const a = getAuth()
  if (!a) throw new Error('未连接到云端')
  const { data, error } = await a.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

// 退出登录
export async function signOutUser() {
  const a = getAuth()
  if (!a) return
  await a.signOut()
}

// 监听登录态变化（新版 onAuthStateChange，回调 (event, session)）
export function onAuthChange(cb) {
  const a = getAuth()
  if (!a) return
  a.onAuthStateChange((_event, session) => cb(session?.user || null))
}

// ---------- 邮箱注册（带密码，官方推荐链路 signUp） ----------
// 走 CloudBase Web SDK 的 signUp + verifyOtp：
//   1) signUp({ email, password }) → SDK 内部发验证码到用户邮箱（走 EMAIL 验证通道，
//      与已能用的 signInWithOtp 同一条路，不受"Web SDK 直接建号"策略限制）
//   2) 拿到 verifyOtp 句柄，data.verifyOtp({ token: 6 位码 }) → 完成注册，
//      密码在注册环节一并写入，之后即可用「邮箱 + 密码」直接登录，无需每次收码。
// 端点路径、鉴权头、CORS 全部交给 SDK 内部处理，不再裸 HTTP 拼头。
let pendingSignUp = null

export async function sendSignUpCode(email, password) {
  const a = getAuth()
  if (!a) throw new Error('未连接到云端')
  const { data, error } = await a.signUp({ email, password })
  if (error) throw error
  if (!data?.verifyOtp) throw new Error('SDK 异常：未返回 verifyOtp 句柄')
  pendingSignUp = data
  return true
}

// 用户填完 6 位码 → 完成注册（密码已在 signUp 阶段写入）
export async function verifySignUpCode(code) {
  if (!pendingSignUp || !pendingSignUp.verifyOtp) {
    throw new Error('会话已过期，请重新获取验证码')
  }
  const { data, error } = await pendingSignUp.verifyOtp({ token: String(code).trim() })
  if (error) throw error
  pendingSignUp = null
  return data
}

// ---------- 重置 / 设置密码（适用于已注册但没密码的账号，或忘记密码） ----------
// 走官方 resetPasswordForEmail 链路（RECOVERY 验证通道）：
//   1) resetPasswordForEmail(email) → 发重置验证码到邮箱，返回 data.updateUser 句柄
//   2) data.updateUser({ nonce: 验证码, password: 新密码 }) → 验码 + 写密码 + 自动登录
// 这是 CloudBase 在 updateUser 禁用 password 后，官方指定的改密方式。
let pendingReset = null

export async function sendResetCode(email) {
  const a = getAuth()
  if (!a) throw new Error('未连接到云端')
  const { data, error } = await a.resetPasswordForEmail(email)
  if (error) throw error
  if (!data?.updateUser) throw new Error('SDK 异常：未返回 updateUser 句柄')
  pendingReset = data
  return true
}

// 填重置码 + 新密码 → 设密并自动登录
export async function confirmReset(email, code, password) {
  if (!pendingReset || !pendingReset.updateUser) {
    throw new Error('会话已过期，请重新获取验证码')
  }
  const { data, error } = await pendingReset.updateUser({
    nonce: String(code).trim(),
    password
  })
  if (error) throw error
  pendingReset = null
  return data
}

// 取消当前验证码流（关弹窗 / 切换模式时调用）
export function cancelAuthFlow() {
  pendingSignUp = null
  pendingReset = null
}
