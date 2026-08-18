<script setup>
import { ref, computed, onMounted } from 'vue'
import { getWorks, addWork, updateWork, deleteWork, upsertUser, getFavorites, addFavorite, removeFavorite } from './lib/data.js'
import { cloudbaseEnabled, signInEmail, sendSignUpCode, verifySignUpCode, sendResetCode, confirmReset, cancelAuthFlow, signOutUser, onAuthChange, getAuth, getUid } from './lib/cloudbase.js'
import { detectPlatform, fetchWorkMeta } from './lib/meta.js'

const tab = ref('browse') // 'browse' | 'submit' | 'batch'
const showHelp = ref(false) // 站内帮助面板

// ---------- 浏览页状态 ----------
const works = ref([])
const search = ref('')
const category = ref('')
const tag = ref('')
const categories = ref([])
const tags = ref([])
const expanded = ref({})

async function loadFilters() {
  const all = await getWorks({})
  categories.value = [...new Set(all.map((w) => w.category).filter(Boolean))]
  const set = new Set()
  all.forEach((w) => (w.tags || []).forEach((t) => set.add(t)))
  tags.value = [...set]
}

async function load() {
  works.value = await getWorks({
    search: search.value,
    category: category.value,
    tag: tag.value
  })
  resetPage()
}

function pickTag(t) {
  tag.value = tag.value === t ? '' : t
  load()
}

function toggleExpand(id) {
  expanded.value[id] = !expanded.value[id]
}

// 作品链接：优先用 links 数组，退化到 original_url。
// 注意：云端 PG 的 links 列可能以 JSON 字符串（"[\"url\"]"）形式返回，
// 必须先解析成真数组，否则会把字符串当数组，[0] 取到首个字符导致链接失效。
function workLinks(w) {
  if (!w) return []
  let links = w.links
  if (typeof links === 'string') {
    try { links = JSON.parse(links) } catch { links = [] }
  }
  if (!Array.isArray(links)) links = []
  return links.length ? links : (w.original_url ? [w.original_url] : [])
}
function hasMulti(w) {
  return workLinks(w).length > 1
}
function mainLink(w) {
  return workLinks(w)[0] || '#'
}

// ---------- 登录与角色 ----------
// 角色三档：visitor（匿名游客）/ user（邮箱登录普通用户）/ admin（管理员）
// 后端 RLS 对所有角色放行（提交即展示的初衷），这里的角色只驱动 UI 显示哪些按钮。
const user = ref(null) // { uid, email, role } 或 null（游客）
const isAdmin = computed(() => user.value?.role === 'admin')
const isLoggedIn = computed(() => !!user.value)
const favorites = ref(new Set())
const showFavOnly = ref(false)

// 登录弹窗状态
const showAuth = ref(false)
const showFeedback = ref(false) // 反馈联系方式浮层
const authMode = ref('login') // 'login' | 'register' | 'reset'
const authEmail = ref('')
const authPassword = ref('')
const authMsg = ref('')
const authBusy = ref(false)
// 注册/重置两步：先填邮箱(注册还要密码)拿码，再填码完成
const authStep = ref('input') // 'input'（填邮箱/密码）| 'code'（填验证码）
const authCode = ref('')        // 注册验证码
const authResetCode = ref('')   // 重置验证码
const authNewPassword = ref('') // 重置时设的新密码
const authSending = ref(false)

// 只认"真账号"（有 email 的邮箱登录用户）；匿名用户 email 为空，视为游客
async function loadUserRole(u) {
  if (!u || !u.email) {
    user.value = null
    return
  }
  const uid = getUid(u)
  try {
    const role = await upsertUser(uid, u.email)
    user.value = { uid, email: u.email, role }
  } catch {
    user.value = { uid, email: u.email, role: 'user' }
  }
  await loadFavorites()
}

async function loadFavorites() {
  if (!user.value) {
    favorites.value = new Set()
    return
  }
  try {
    const ids = await getFavorites(user.value.uid)
    favorites.value = new Set(ids)
  } catch {
    favorites.value = new Set()
  }
}

// 注册 / 重置 第 1 步：发验证码
async function sendCode() {
  authMsg.value = ''
  if (!authEmail.value.includes('@')) {
    authMsg.value = '邮箱格式不对'
    return
  }
  if (authMode.value === 'register' && authPassword.value.length < 6) {
    authMsg.value = '密码至少 6 位'
    return
  }
  authSending.value = true
  try {
    if (authMode.value === 'register') {
      // 注册：带密码的 signUp，验证码验证后密码一并写入
      await sendSignUpCode(authEmail.value.trim(), authPassword.value)
      authMsg.value = '验证码已发送到邮箱，请查收并填入下方（10 分钟内有效）。'
    } else {
      // 重置密码：发重置验证码
      await sendResetCode(authEmail.value.trim())
      authMsg.value = '重置验证码已发送到邮箱，请查收并填入下方。'
    }
    authStep.value = 'code'
  } catch (e) {
    let detail = e?.message || e?.msg || e?.error?.message || e?.code || e?.error
    if (!detail && typeof e === 'object') detail = JSON.stringify(e)
    authMsg.value = '发送验证码失败：' + (detail || e || '未知错误')
  } finally {
    authSending.value = false
  }
}

// 注册第 2 步 / 登录 / 重置第 2 步：完成对应操作
async function doAuth() {
  authMsg.value = ''
  if (authMode.value === 'login') {
    if (!authEmail.value.includes('@') || authPassword.value.length < 6) {
      authMsg.value = '邮箱格式或密码（至少 6 位）不对'
      return
    }
  } else if (authMode.value === 'register' && authStep.value === 'code') {
    if (!authCode.value || authCode.value.trim().length < 4) {
      authMsg.value = '请填写收到的验证码'
      return
    }
  } else if (authMode.value === 'reset' && authStep.value === 'code') {
    if (!authResetCode.value || authResetCode.value.trim().length < 4) {
      authMsg.value = '请填写邮箱里的重置验证码'
      return
    }
    if (authNewPassword.value.length < 6) {
      authMsg.value = '新密码至少 6 位'
      return
    }
  }
  authBusy.value = true
  try {
    if (authMode.value === 'register' && authStep.value === 'code') {
      // 注册：verifyOtp 内部完成注册并登录
      const data = await verifySignUpCode(authCode.value.trim())
      const u = data?.user || null
      if (u) await loadUserRole(u)
      // 探测刚注册的账号是否真的能用密码登录；不能（部分环境下 signUp 的密码未落盘）
      // 就无缝切到「设置密码」流程，复用刚填的密码，只多收一次邮箱验证码
      await ensurePasswordSet()
      return
    }
    if (authMode.value === 'reset' && authStep.value === 'code') {
      // 重置密码：验码 + 写密码 + 自动登录
      const data = await confirmReset(
        authEmail.value.trim(),
        authResetCode.value.trim(),
        authNewPassword.value
      )
      const u = data?.user || null
      if (u) await loadUserRole(u)
      closeAuth()
      return
    }
    // 登录（邮箱 + 密码）
    const res = await signInEmail(authEmail.value.trim(), authPassword.value)
    const u = res?.user || null
    if (u) await loadUserRole(u)
    closeAuth()
  } catch (e) {
    let detail = e?.message || e?.msg || e?.error?.message || e?.code || e?.error
    if (!detail && typeof e === 'object') detail = JSON.stringify(e)
    const raw = String(detail || e || '').toLowerCase()
    // CloudBase 对「已注册但未设密码」的账号会返回这条英文，自动切换到重置/设密流程
    if (raw.includes('first login') && raw.includes('password update')) {
      switchAuthMode('reset')
      authMsg.value = '该账号尚未设置登录密码，已自动切换到「设置密码」流程。点击「获取重置验证码」，用邮箱验证后即可设置密码。'
    } else {
      authMsg.value = '操作失败：' + (detail || e || '未知错误')
    }
  } finally {
    authBusy.value = false
  }
}

function closeAuth() {
  cancelAuthFlow()
  showAuth.value = false
  authEmail.value = ''
  authPassword.value = ''
  authCode.value = ''
  authResetCode.value = ''
  authNewPassword.value = ''
  authStep.value = 'input'
}

// 注册成功后确保账号具备「邮箱 + 密码」登录能力：
// 先尝试用刚设的密码登录，成功说明密码已生效；失败（多为 password update required，
// 即 signUp 传入的密码在部分 CloudBase 环境下未落盘）则复用刚填的密码，
// 自动发重置验证码，引导用户完成一次密码设置（仅多收一次邮箱验证码）。
async function ensurePasswordSet() {
  const email = authEmail.value.trim()
  const pwd = authPassword.value
  try {
    const res = await signInEmail(email, pwd)
    if (res?.user) {
      await loadUserRole(res.user)
      closeAuth()
      return
    }
  } catch (e) {
    // 密码未生效，继续走设密流程
  }
  // 复用刚填的密码，进入重置 / 设密流程
  authNewPassword.value = pwd
  authPassword.value = ''
  authCode.value = ''
  try {
    await sendResetCode(email)
  } catch (e2) {
    authMsg.value = '账号已创建，但设置密码失败：' + (e2?.message || e2 || '未知错误')
    return
  }
  authMode.value = 'reset'
  authStep.value = 'code'
  authMsg.value = '账号已创建并登录 ✅ 但检测到该账号尚未启用密码登录，请查收邮箱验证码填入下方完成设置（密码已为你填好）。'
}

// 切换登录/注册/重置模式时重置状态
function switchAuthMode(m) {
  authMode.value = m
  authStep.value = 'input'
  authCode.value = ''
  authResetCode.value = ''
  authNewPassword.value = ''
  authMsg.value = ''
  cancelAuthFlow()
}

async function doLogout() {
  await signOutUser().catch(() => {})
  user.value = null
  favorites.value = new Set()
}

// 谁能编辑/删除：管理员任意；普通用户仅限自己投稿（author_uid 匹配）
function canEdit(w) {
  if (isAdmin.value) return true
  if (isLoggedIn.value && w.author_uid && w.author_uid === user.value.uid) return true
  return false
}

function toggleFav(w) {
  if (!user.value) {
    showAuth.value = true
    return
  }
  const id = w.id
  if (favorites.value.has(id)) {
    removeFavorite(user.value.uid, id)
      .then(() => { const s = new Set(favorites.value); s.delete(id); favorites.value = s })
      .catch((e) => alert('取消收藏失败：' + e.message))
  } else {
    addFavorite(user.value.uid, id)
      .then(() => { const s = new Set(favorites.value); s.add(id); favorites.value = s })
      .catch((e) => alert('收藏失败：' + e.message))
  }
}

// 浏览页按"我的收藏"筛选
const displayWorks = computed(() => {
  if (!showFavOnly.value) return works.value
  return works.value.filter((w) => favorites.value.has(w.id))
})

// 加载更多（分页）：每次多展示一屏
const PAGE_SIZE = 9
const page = ref(1)
const visibleWorks = computed(() => displayWorks.value.slice(0, page.value * PAGE_SIZE))
function loadMore() { page.value++ }
function goGrid() {
  page.value = 1
  document.getElementById('grid-top')?.scrollIntoView({ behavior: 'smooth' })
}
function resetPage() { page.value = 1 }

// 顶部滚动进度条
const scrollProgress = ref(0)
function onScroll() {
  const h = document.documentElement.scrollHeight - window.innerHeight
  scrollProgress.value = h > 0 ? Math.min(1, window.scrollY / h) : 0
}

// ---------- 深浅色主题（对齐 Obsidian 极简风） ----------
const theme = ref('light')
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
  theme.value = t
}
function toggleTheme() {
  const next = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  try { localStorage.setItem('kh-theme', next) } catch {}
}

// ---------- 复制链接 + toast ----------
const toastMsg = ref('')
let toastTimer = null
function showToast(m) {
  toastMsg.value = m
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 1800)
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy'); showToast('原文链接已复制 ✓') }
  catch { showToast('复制失败，请手动复制地址栏链接') }
  document.body.removeChild(ta)
}
function copyLink() {
  const url = mainLink(currentWork.value)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => showToast('原文链接已复制 ✓')).catch(() => fallbackCopy(url))
  } else {
    fallbackCopy(url)
  }
}

// ---------- 站内阅读页（hash 路由 #/work/:id） ----------
// 不引入 vue-router：刷新可保持，也不动静态托管 SPA 配置。
const routeWorkId = ref('')
function parseHash() {
  const m = location.hash.match(/^#\/work\/(.+)$/)
  routeWorkId.value = m ? decodeURIComponent(m[1]) : ''
}
const currentWork = computed(() => works.value.find((w) => String(w.id) === routeWorkId.value) || null)

// 阅读器交互状态：当前章高亮、正文字号、章节折叠、阅读主题
const activeChapter = ref(0)
const readerFont = ref(18)
const expandedChapters = ref(false)
const readerTheme = ref('default')
const chapterBtns = computed(() => {
  if (!currentWork.value) return []
  const n = workLinks(currentWork.value).length
  if (n <= 8 || expandedChapters.value) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: 8 }, (_, i) => i)
})
function openWork(w) {
  activeChapter.value = 0
  expandedChapters.value = false
  readerFont.value = 18
  readerTheme.value = 'default'
  location.hash = '#/work/' + encodeURIComponent(w.id)
}
function closeWork() {
  history.replaceState(null, '', location.pathname + location.search)
  routeWorkId.value = ''
}
// 点章节：高亮并前往该章原站（站内不存正文，正文在外部平台）
function goChapter(ci) {
  if (!currentWork.value) return
  activeChapter.value = ci
  const links = workLinks(currentWork.value)
  if (links[ci]) window.open(links[ci], '_blank', 'noopener')
  document.getElementById('read-body')?.scrollIntoView({ behavior: 'smooth' })
}
function prevChapter() {
  if (activeChapter.value > 0) goChapter(activeChapter.value - 1)
}
function nextChapter() {
  const n = currentWork.value ? workLinks(currentWork.value).length : 0
  if (activeChapter.value < n - 1) goChapter(activeChapter.value + 1)
}
function changeFont(d) {
  readerFont.value = Math.min(24, Math.max(14, readerFont.value + d))
}
function goChapterList() {
  document.getElementById('read-chapterbar')?.scrollIntoView({ behavior: 'smooth' })
}

// ---------- 作品编辑 / 删除（受 canEdit 控制） ----------
const editingId = ref(null)
const editForm = ref({})

function startEdit(w) {
  editingId.value = w.id
  editForm.value = {
    title: w.title,
    author: w.author || '',
    original_url: w.original_url || (w.links && w.links[0]) || '',
    category: w.category || '',
    tags: (w.tags || []).join(' '),
    summary: w.summary || ''
  }
}

async function saveEdit() {
  const id = editingId.value
  try {
    await updateWork(id, {
      title: editForm.value.title,
      author: editForm.value.author,
      original_url: editForm.value.original_url,
      category: editForm.value.category,
      tags: editForm.value.tags
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      summary: editForm.value.summary
    })
    editingId.value = null
    await loadFilters()
    await load()
  } catch (e) {
    alert('保存失败：' + e.message)
  }
}

function cancelEdit() {
  editingId.value = null
}

async function removeWork(w) {
  if (!confirm(`确定删除《${w.title}》？此操作不可恢复`)) return
  try {
    await deleteWork(w.id)
    await loadFilters()
    await load()
  } catch (e) {
    alert('删除失败：' + e.message)
  }
}


// ---------- 单条投稿 ----------
const form = ref({
  title: '', author: '', original_url: '', summary: '', category: '', tags: '', cover_url: ''
})
const msg = ref('')

// 链接识别 + 元数据抓取状态
const metaState = ref({ loading: false, platformLabel: '', error: '' })
// 实时识别平台（纯正则，不联网，输入即显示徽标）
const detected = computed(() => detectPlatform(form.value.original_url))

// 调云端函数抓取外链元数据，预填表单（只在字段为空时填，避免覆盖已填内容）
async function fetchMeta() {
  const url = form.value.original_url.trim()
  if (!/^https?:\/\//i.test(url)) {
    metaState.value = { loading: false, platformLabel: '', error: '请先填写合法的原链接' }
    return
  }
  metaState.value = { loading: true, platformLabel: '', error: '' }
  try {
    const res = await fetchWorkMeta(url)
    if (res && res.code === 0 && res.data) {
      const d = res.data
      metaState.value.platformLabel = d.platformLabel || ''
      if (d.title && !form.value.title) form.value.title = d.title
      if (d.author && !form.value.author) form.value.author = d.author
      if (d.coverUrl && !form.value.cover_url) form.value.cover_url = d.coverUrl
      if (d.summary && !form.value.summary) form.value.summary = d.summary
    } else {
      metaState.value.error = (res && res.message) || '未获取到元数据'
    }
  } catch (e) {
    metaState.value.error = '识别失败：' + (e?.message || e)
  } finally {
    metaState.value.loading = false
  }
}

async function submit() {
  msg.value = ''
  if (!form.value.title || !form.value.original_url) {
    msg.value = '标题和原链接是必填项'
    return
  }
  try {
    await addWork({
      title: form.value.title,
      author: form.value.author,
      original_url: form.value.original_url,
      summary: form.value.summary,
      category: form.value.category,
      tags: form.value.tags
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      cover_url: form.value.cover_url
    })
    msg.value = '提交成功，已展示在列表里 🎉'
    form.value = { title: '', author: '', original_url: '', summary: '', category: '', tags: '', cover_url: '' }
    metaState.value = { loading: false, platformLabel: '', error: '' }
    tab.value = 'browse'
    await loadFilters()
    await load()
  } catch (e) {
    msg.value = '提交失败：' + e.message
  }
}

// ---------- 批量导入 ----------
const batchText = ref('')
const batchPreview = ref([])
const batchCategory = ref('')
const batchTags = ref('')
const batchMsg = ref('')

// 微博链接提取：优先认完整 URL，其次 16 位详情 ID，短数字（如 20133）判无效。
// 真实详情 ID 是 16 位数字（或 base62 短码）；合集原文里的序号不是 ID，不能拿来拼链接。
const URL_RE = /https?:\/\/(?:m\.)?weibo\.com\/(?:detail\/)?[\w]+\/[\w]+|https?:\/\/m\.weibo\.cn\/detail\/[\w]+|https?:\/\/t\.cn\/[\w]+/gi
const DETAIL_ID_RE = /\b(\d{16})\b/g
const SHORT_ID_RE = /(\d{4,15})\b/g

function extractLinks(text) {
  const links = []
  const invalid = []
  const urlHits = []
  for (const m of text.matchAll(URL_RE)) {
    links.push(m[0])
    urlHits.push(m[0])
  }
  const urlText = urlHits.join(' ')
  // 16 位详情 ID：但若它已出现在某条完整 URL 里（如 weibo.com/uid/MID），不再重复加
  for (const m of text.matchAll(DETAIL_ID_RE)) {
    if (!urlText.includes(m[1])) links.push(`https://m.weibo.cn/detail/${m[1]}`)
  }
  // 4~15 位短数字：合集里的序号，不是合法 ID，标红提示用户补真实链接
  for (const m of text.matchAll(SHORT_ID_RE)) {
    if (!urlText.includes(m[1])) invalid.push(m[1])
  }
  return { links: [...new Set(links)], invalid: [...new Set(invalid)] }
}

// 解析「网h系列导航」式文本，支持两种手机复制格式：
// 1. 旧格式：按《标题》分段，段内提取真实链接 / 16 位 ID；支持标题跨行。
// 2. 新格式：【系列标题🔗】数字 开头，接着 1.0 29939：http://t.cn/... 条目；
//    链接可能在本行也可能在下一条；短数字（如 29939）不是合法 ID，只取 URL。
function parseBatch(text) {
  const items = []
  let current = null
  let titleBuffer = null // 标题跨行时的缓冲
  let seriesTitle = ''   // 【系列标题】
  let pendingVersion = null // 1.0 29939： 这种，等下一行 URL

  const flush = () => { if (current) { items.push(current); current = null } }
  const newItem = (title) => { flush(); current = { title, links: [], invalid: [] } }
  const feed = (line) => {
    const ex = extractLinks(line)
    current.links.push(...ex.links)
    current.invalid.push(...ex.invalid)
  }
  const pushVersion = (title, line) => {
    const ex = extractLinks(line)
    if (ex.links.length || ex.invalid.length || !line.trim()) {
      items.push({ title, links: ex.links, invalid: ex.invalid })
    }
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    // 新格式：系列标题行 【新网h系列🔗】32257
    const seriesMatch = line.match(/【([^】]+)】/)
    if (seriesMatch) {
      seriesTitle = seriesMatch[1].replace(/[🔗\s]+$/g, '').replace(/\s+\d+$/g, '').trim()
      continue
    }

    // 新格式：版本条目 1.0 29939：http://t.cn/...  或  1.0 29939：
    const versionMatch = line.match(/^(\d+(?:\.\d+)?)\s+\d+\s*[：:]\s*(.*)$/)
    if (versionMatch) {
      const version = versionMatch[1]
      const rest = versionMatch[2]
      const title = seriesTitle ? `${seriesTitle} ${version}` : version
      if (rest) {
        pushVersion(title, rest)
        pendingVersion = null
      } else {
        pendingVersion = title
      }
      continue
    }

    // 上一行版本条目没给链接，本行补 URL
    if (pendingVersion) {
      pushVersion(pendingVersion, line)
      pendingVersion = null
      continue
    }

    // 旧格式：标题跨行
    if (titleBuffer !== null) {
      const close = line.indexOf('》')
      if (close >= 0) {
        titleBuffer += line.slice(0, close)
        newItem(titleBuffer.trim())
        feed(line.slice(close + 1))
        titleBuffer = null
      } else {
        titleBuffer += line
      }
      continue
    }

    // 旧格式：《标题》
    const m = line.match(/《([^》]*)》?/)
    if (m) {
      const title = m[1]
      if (line.includes('》')) {
        newItem(title.trim())
        feed(line.slice(m.index + m[0].length))
      } else {
        titleBuffer = title
      }
      continue
    }

    // 无《》：可能是链接行 / ID 行 / 说明文字
    if (current) feed(line)
  }
  flush()
  if (pendingVersion) pushVersion(pendingVersion, '') // 最后还在等 URL，空占位提示
  return items
    .map((it) => ({
      title: it.title,
      links: [...new Set(it.links)],
      invalid: [...new Set(it.invalid)]
    }))
    .filter((it) => it.title) // 保留标题，链接无效也显示出来提示用户
}

function doParse() {
  batchMsg.value = ''
  const items = parseBatch(batchText.value)
  batchPreview.value = items
  const valid = items.filter((it) => it.links.length)
  const bad = items.filter((it) => !it.links.length)
  if (!items.length) {
    batchMsg.value = '没解析到任何作品，检查下格式（需要《标题》和真实链接 / 16 位 ID）'
  } else if (bad.length) {
    batchMsg.value = `解析到 ${items.length} 篇：${valid.length} 篇有有效链接，${bad.length} 篇只有无效数字（已标红）。确认提交时只会提交有有效链接的，无效篇请补真实 weibo 链接。`
  } else {
    batchMsg.value = `解析到 ${items.length} 篇，全部有效，确认无误后点「确认提交」`
  }
}

async function submitBatch() {
  const items = batchPreview.value.filter((it) => it.links.length)
  if (!items.length) {
    batchMsg.value = '没有有效链接可提交，请给每篇补上真实 weibo 链接（或 16 位详情 ID）'
    return
  }
  const commonTags = batchTags.value
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  batchMsg.value = `提交中… 0/${items.length}`
  let ok = 0
  for (const it of items) {
    try {
      await addWork({
        title: it.title,
        original_url: it.links[0],
        links: it.links,
        category: batchCategory.value || '同人文',
        tags: commonTags
      })
      ok++
      batchMsg.value = `提交中… ${ok}/${items.length}`
    } catch (e) {
      batchMsg.value = `第 ${ok + 1} 篇「${it.title}」失败：${e.message}`
      return
    }
  }
  batchMsg.value = `✅ 成功提交 ${ok}/${items.length} 篇`
  batchPreview.value = []
  batchText.value = ''
  await loadFilters()
  await load()
}

onMounted(async () => {
  // 应用保存的主题偏好
  try { applyTheme(localStorage.getItem('kh-theme') || 'light') } catch { applyTheme('light') }
  const a = getAuth()
  if (a) {
    onAuthChange((u) => loadUserRole(u))
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('hashchange', parseHash)
  onScroll()
  parseHash()
  await loadFilters()
  await load()
})
</script>

<template>
  <div class="progress-bar" :style="{ transform: `scaleX(${scrollProgress})` }"></div>
  <header v-show="!currentWork">
    <div class="nav-inner">
      <div class="title">
        <span class="logo">
          <svg width="16" height="16" viewBox="0 0 14 14"><path d="M3 2h6a2 2 0 0 1 2 2v8a2 2 0 0 0-2-2H3z" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M3 2v8" stroke="#fff" stroke-width="1.4"/></svg>
        </span>
        kh-library
      </div>
      <button class="add-pill" type="button" @click="tab = 'submit'">＋ 添加作品</button>
      <div class="tabs">
        <button :class="{ active: tab === 'browse' }" @click="tab = 'browse'">首页</button>
        <button :class="{ active: tab === 'submit' }" @click="tab = 'submit'">投稿</button>
        <button :class="{ active: tab === 'batch' }" @click="tab = 'batch'">批量导入</button>
        <button v-if="!isLoggedIn" class="login-btn" type="button" @click="showAuth = true">登录</button>
        <div v-else class="user-box">
          <span class="user-email">{{ user.email }}</span>
          <span class="role-badge" :class="user.role">{{ user.role === 'admin' ? '管理员' : '用户' }}</span>
          <button class="login-btn ghost" type="button" @click="doLogout">退出</button>
        </div>
      </div>
      <button class="theme-toggle" type="button" @click="toggleTheme" :title="theme === 'dark' ? '切换浅色' : '切换深色'">{{ theme === 'dark' ? '☀' : '🌙' }}</button>
      <button class="help-btn" type="button" @click="showHelp = true" title="使用指南">?</button>
    </div>
  </header>

  <!-- ============ 站内阅读页 ============ -->
  <section v-if="currentWork" class="read-view" :class="{ 'reading-sepia': readerTheme === 'sepia' }">
    <!-- 顶栏 -->
    <div class="read-topbar">
      <div class="rt-left">
        <button class="rt-back" type="button" @click="closeWork" title="返回图书馆">←</button>
        <span class="rt-title">{{ currentWork.title }}</span>
      </div>
      <div class="rt-right">
        <button class="rt-pill copy" type="button" @click="copyLink" title="复制原文链接">🔗 复制链接</button>
        <span v-if="detectPlatform(currentWork.original_url).platform !== 'other'" class="rt-pill src">{{ detectPlatform(currentWork.original_url).label }}</span>
        <button class="rt-pill fav" :class="{ active: favorites.has(currentWork.id) }" type="button" @click="toggleFav(currentWork)">★ {{ favorites.has(currentWork.id) ? '已收藏' : '收藏' }}</button>
        <button class="rt-pill theme" type="button" @click="readerTheme = readerTheme === 'sepia' ? 'default' : 'sepia'" title="切换阅读主题">主题</button>
        <button class="rt-pill help" type="button" @click="showHelp = true" title="使用指南">帮助</button>
      </div>
    </div>

    <!-- 主体 + 右侧大纲 -->
    <div class="read-layout">
    <div class="read-main">
    <!-- 作品信息 -->
    <div class="read-metahead">
      <h1 class="read-bigtitle">{{ currentWork.title }}</h1>
      <div class="read-chips">
        <span class="rc">✍ {{ currentWork.author || '佚名' }}</span>
        <span v-if="detectPlatform(currentWork.original_url).platform !== 'other'" class="rc type">{{ detectPlatform(currentWork.original_url).label }}</span>
        <span v-if="currentWork.category" class="rc">{{ currentWork.category }}</span>
        <span class="rc">{{ workLinks(currentWork).length > 1 ? '共 ' + workLinks(currentWork).length + ' 章' : '单篇作品' }}</span>
      </div>
    </div>

    <!-- 章节选择 -->
    <div id="read-chapterbar" class="read-chapterbar" v-if="workLinks(currentWork).length > 1">
      <button
        v-for="ci in chapterBtns"
        :key="ci"
        class="ch-chip"
        :class="{ active: ci === activeChapter }"
        type="button"
        @click="goChapter(ci)"
      >第 {{ ci + 1 }} 章</button>
      <button v-if="workLinks(currentWork).length > 8 && !expandedChapters" class="ch-chip more" type="button" @click="expandedChapters = true">
        +{{ workLinks(currentWork).length - 8 }} 章
      </button>
    </div>

    <!-- 正文容器（站内展示简介，完整正文在原站） -->
    <div id="read-body" class="read-body">
      <div class="read-content" :style="{ fontSize: readerFont + 'px' }">
        <template v-if="currentWork.summary">
          <p class="read-summary-label">内容简介</p>
          <p class="read-para">{{ currentWork.summary }}</p>
        </template>
        <p v-else class="read-empty">本文托管于 {{ detectPlatform(currentWork.original_url).label || '外部平台' }}，站内展示作品信息，完整正文请前往原站阅读。</p>
        <a class="read-origin" :href="mainLink(currentWork)" target="_blank" rel="noopener">前往原站阅读 ↗</a>
      </div>
    </div>
    </div>

    <!-- 右侧大纲 TOC（多章显示章节，单篇显示作品信息） -->
    <aside class="read-toc">
      <template v-if="workLinks(currentWork).length > 1">
        <div class="toc-title">章节目录</div>
        <ul class="toc-list">
          <li v-for="ci in workLinks(currentWork).length" :key="ci - 1">
            <button class="toc-item" :class="{ active: (ci - 1) === activeChapter }" type="button" @click="goChapter(ci - 1)">
              第 {{ ci }} 章
            </button>
          </li>
        </ul>
      </template>
      <div v-else class="toc-about">
        <div class="toc-title">作品信息</div>
        <div class="about-row">✍ {{ currentWork.author || '佚名' }}</div>
        <div class="about-row" v-if="currentWork.category">📂 {{ currentWork.category }}</div>
        <div class="about-row" v-if="detectPlatform(currentWork.original_url).platform !== 'other'">🔗 {{ detectPlatform(currentWork.original_url).label }}</div>
        <div class="about-tags" v-if="currentWork.tags && currentWork.tags.length">
          <span v-for="t in currentWork.tags" :key="t">#{{ t }}</span>
        </div>
      </div>
    </aside>
    </div>

    <!-- 底部阅读条 -->
    <div class="read-bottombar" v-if="workLinks(currentWork).length > 1">
      <button class="rb-btn" type="button" :disabled="activeChapter === 0" @click="prevChapter">← 上一章</button>
      <span class="rb-count">第 {{ activeChapter + 1 }} / {{ workLinks(currentWork).length }} 章</span>
      <button class="rb-btn primary" type="button" :disabled="activeChapter === workLinks(currentWork).length - 1" @click="nextChapter">下一章 →</button>
      <div class="rb-set">
        <button class="rb-icon" type="button" @click="changeFont(-1)" title="缩小字号">A−</button>
        <button class="rb-icon" type="button" @click="changeFont(1)" title="放大字号">A＋</button>
        <button class="rb-icon" type="button" @click="goChapterList" title="目录">≡</button>
      </div>
    </div>
    <div class="read-bottombar single" v-else>
      <a class="rb-btn primary full" :href="mainLink(currentWork)" target="_blank" rel="noopener">前往原站阅读 ↗</a>
      <div class="rb-set">
        <button class="rb-icon" type="button" @click="changeFont(-1)" title="缩小字号">A−</button>
        <button class="rb-icon" type="button" @click="changeFont(1)" title="放大字号">A＋</button>
        <button class="rb-icon" type="button" @click="readerTheme = readerTheme === 'sepia' ? 'default' : 'sepia'" title="主题">主题</button>
      </div>
    </div>
  </section>

  <!-- ============ 浏览页 ============ -->
  <section v-else-if="tab === 'browse'">
    <p v-if="!cloudbaseEnabled" class="hint">
      当前为本地演示模式（数据存你浏览器）。配置 VITE_CLOUDBASE_ENV_ID 即可切换云端、数据统一。
    </p>

    <div class="hero">
      <h1>把喜欢的文，都收进这座小图书馆</h1>
      <p class="hero-sub">从微博、LOFTER 到各处——这里是你一个人的图书馆。</p>
      <button class="hero-cta" type="button" @click="goGrid">随便逛逛 ↓</button>
    </div>

    <div class="bar">
      <input v-model="search" placeholder="搜标题 / 作者 / 简介" @keyup.enter="load" />
      <select v-model="category" @change="load">
        <option value="">全部分类</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <button v-if="isLoggedIn" class="fav-toggle" :class="{ active: showFavOnly }" type="button" @click="showFavOnly = !showFavOnly">★ 我的收藏</button>
    </div>

    <div class="filterbar">
      <div class="chips">
        <button class="fchip" :class="{ active: !tag }" type="button" @click="tag=''; load()">全部</button>
        <button
          v-for="t in tags"
          :key="t"
          class="fchip"
          :class="{ active: tag === t }"
          type="button"
          @click="pickTag(t)"
        >#{{ t }}</button>
      </div>
      <div class="sort">最新 ↓</div>
    </div>

    <div id="grid-top" class="section-head">
      <h2>全部作品</h2>
      <span class="count">共 {{ displayWorks.length }} 篇 · 已收藏 {{ favorites.size }} 篇</span>
    </div>

    <div class="grid">
      <div v-for="w in visibleWorks" :key="w.id" class="card">
        <template v-if="editingId === w.id">
          <div class="c-body">
            <div class="edit-form">
              <input v-model="editForm.title" placeholder="标题" />
              <input v-model="editForm.author" placeholder="作者" />
              <input v-model="editForm.original_url" placeholder="原链接" />
              <input v-model="editForm.category" placeholder="分类" />
              <input v-model="editForm.tags" placeholder="标签（空格分隔）" />
              <textarea v-model="editForm.summary" placeholder="简介"></textarea>
              <div class="edit-actions">
                <button class="submit-btn small primary" type="button" @click="saveEdit">保存</button>
                <button class="submit-btn small ghost" type="button" @click="cancelEdit">取消</button>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <button class="fav-btn" :class="{ active: favorites.has(w.id) }" type="button" :title="favorites.has(w.id) ? '取消收藏' : '收藏'" @click="toggleFav(w)">★</button>
          <div class="c-body">
            <div class="c-title">{{ w.title }}</div>
            <span v-if="detectPlatform(w.original_url).platform !== 'other'" class="badge plat">{{ detectPlatform(w.original_url).label }}</span>
            <div class="c-meta">{{ w.author || '佚名' }} · {{ w.category || '未分类' }}</div>
            <div v-if="w.summary" class="c-sum">{{ w.summary }}</div>
            <div class="c-tags"><span v-for="t in (w.tags || [])" :key="t">#{{ t }}</span></div>
            <div class="card-actions">
              <button class="link-btn ghost" type="button" @click="openWork(w)">详情 →</button>
              <template v-if="hasMulti(w)">
                <button class="link-btn ghost" type="button" @click="toggleExpand(w.id)">
                  {{ expanded[w.id] ? '收起' : `展开 ${workLinks(w).length} 章` }}
                </button>
                <transition name="chapters-expand">
                  <ol v-if="expanded[w.id]" class="chapters">
                    <li v-for="(l, i) in workLinks(w)" :key="i">
                      <a :href="l" target="_blank" rel="noopener">第 {{ i + 1 }} 章 ↗</a>
                    </li>
                  </ol>
                </transition>
              </template>
              <a v-else class="link-btn" :href="mainLink(w)" target="_blank" rel="noopener">打开链接 ↗</a>
            </div>
            <div v-if="canEdit(w)" class="admin-actions">
              <button class="link-btn ghost" type="button" @click="startEdit(w)">编辑</button>
              <button class="link-btn danger" type="button" @click="removeWork(w)">删除</button>
            </div>
          </div>
          <!-- 悬停预览气泡 -->
          <div class="card-preview">
            <div class="cp-body">
              <div class="cp-title">{{ w.title }}</div>
              <div class="cp-meta">{{ w.author || '佚名' }} · {{ w.category || '未分类' }}</div>
              <div v-if="w.summary" class="cp-sum">{{ w.summary }}</div>
              <div class="cp-tags"><span v-for="t in (w.tags || [])" :key="t">#{{ t }}</span></div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <button v-if="visibleWorks.length < displayWorks.length" class="loadmore" type="button" @click="loadMore">加载更多 ↓</button>

    <div v-if="!displayWorks.length" class="empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#D8C7E8" stroke-width="1.5">
        <rect x="10" y="8" width="28" height="32" rx="3" />
        <path d="M16 16h16M16 22h16M16 28h10" />
      </svg>
      <p>还没有作品</p>
      <span>去「投稿」或「批量导入」加几条吧</span>
    </div>

    <footer class="site-footer">
      <div class="f-brand">kh-library</div>
      <div>用 ♥ 收藏你喜欢的每一篇 · Powered by kh-library</div>
      <div>
        <a href="#" @click.prevent="tab = 'submit'">投稿</a>
        <a href="#" @click.prevent="showHelp = true">帮助</a>
        <a href="#" @click.prevent="showFeedback = true">反馈</a>
        <a href="#" @click.prevent="tab = 'batch'">批量</a>
      </div>
    </footer>
  </section>

  <!-- ============ 单条投稿 ============ -->
  <section v-else-if="tab === 'submit'">
    <form @submit.prevent="submit">
      <div class="field">
        <label>标题 *</label>
        <input v-model="form.title" placeholder="作品名" />
      </div>
      <div class="field">
        <label>作者</label>
        <input v-model="form.author" placeholder="原作者 / 画师" />
      </div>
      <div class="field">
        <label>原链接 *</label>
        <div class="url-row">
          <input v-model="form.original_url" placeholder="https://..." />
          <button type="button" class="mini-btn" :disabled="metaState.loading || !form.original_url" @click="fetchMeta">
            {{ metaState.loading ? '识别中…' : '识别并填充' }}
          </button>
        </div>
        <div class="meta-hint">
          <span v-if="detected.platform !== 'other'" class="badge">来源：{{ detected.label }}</span>
          <span v-if="metaState.platformLabel && metaState.platformLabel !== detected.label" class="badge ok">抓到：{{ metaState.platformLabel }}</span>
          <span v-if="metaState.error" class="badge err">{{ metaState.error }}</span>
        </div>
      </div>
      <div class="field">
        <label>分类</label>
        <input v-model="form.category" placeholder="如：同人图 / 同人文" />
      </div>
      <div class="field">
        <label>标签（空格或逗号分隔）</label>
        <input v-model="form.tags" placeholder="如：治愈 春" />
      </div>
      <div class="field">
        <label>简介</label>
        <textarea v-model="form.summary" placeholder="一句话介绍"></textarea>
      </div>
      <button class="submit-btn" type="submit">提交</button>
      <p class="msg">{{ msg }}</p>
    </form>
  </section>

  <!-- ============ 批量导入 ============ -->
  <section v-else>
    <p class="hint">
      把微博合集文本整段粘进来，点「解析预览」。支持两种手机复制格式：
      <br/>① <code>《标题》 真实weibo链接</code>（程序按《标题》分段）；
      <br/>② <code>【系列标题】</code> + <code>1.0 29939：http://t.cn/xxxxx</code>（链接也可能在下一行，程序按版本自动拆成条目）。
      <br/>认得到完整链接就直接用（<code>weibo.com/uid/mid</code> / <code>m.weibo.cn/detail/xxx</code> / <code>t.cn/xxx</code> 均可）；
      只有 <b>16 位详情 ID</b> 才会被还原成 <code>https://m.weibo.cn/detail/ID</code>。像 <code>20133 / 29939</code> 这种短数字是合集序号，会被判<b>无效并标红</b>，不会生成死链。
    </p>
    <div class="field">
      <label>合集文本</label>
      <textarea v-model="batchText" placeholder="粘贴你的网h系列导航文本…" style="min-height:160px"></textarea>
    </div>
    <div class="batch-row">
      <input v-model="batchCategory" placeholder="统一分类（默认：同人文）" />
      <input v-model="batchTags" placeholder="统一标签（空格分隔，可空）" />
    </div>
    <div class="batch-actions">
      <button class="submit-btn small" type="button" @click="doParse">解析预览</button>
      <button
        class="submit-btn small primary"
        type="button"
        :disabled="!batchPreview.filter(it => it.links.length).length"
        @click="submitBatch"
      >确认提交 {{ batchPreview.filter(it => it.links.length).length }} 篇</button>
    </div>

    <div v-if="batchPreview.length" class="preview">
      <div v-for="(it, i) in batchPreview" :key="i" class="preview-item">
        <div class="pi-title">《{{ it.title }}》· {{ it.links.length }} 章
          <span v-if="it.invalid.length" class="pi-warn">⚠ 无效ID：{{ it.invalid.join('、') }}</span>
        </div>
        <div class="pi-links">
          <a v-for="(l, j) in it.links" :key="j" :href="l" target="_blank" rel="noopener">{{ l }}</a>
        </div>
        <div v-if="!it.links.length" class="pi-warn">无有效链接，需补真实 weibo 链接</div>
      </div>
    </div>

    <p class="msg">{{ batchMsg }}</p>
  </section>

  <!-- ============ 登录弹窗 ============ -->
  <div v-if="showAuth" class="auth-overlay" @click.self="closeAuth">
    <div class="auth-modal">
      <div class="auth-tabs" v-if="authMode !== 'reset'">
        <button :class="{ active: authMode === 'login' }" type="button" @click="switchAuthMode('login')">登录</button>
        <button :class="{ active: authMode === 'register' }" type="button" @click="switchAuthMode('register')">注册</button>
      </div>
      <div class="auth-tabs" v-else>
        <button class="active" type="button" @click="switchAuthMode('login')">← 返回登录</button>
      </div>

      <input v-model="authEmail" placeholder="邮箱" :disabled="authStep === 'code'" />

      <!-- 注册：设密码（必填，≥6 位） -->
      <input
        v-if="authMode === 'register'"
        v-model="authPassword"
        type="password"
        placeholder="设密码（至少 6 位）"
        :disabled="authStep === 'code'"
        @keyup.enter="doAuth"
      />
      <p v-if="authMode === 'register' && authStep === 'input'" class="auth-pwd-hint">密码至少 6 位，建议同时包含字母和数字</p>
      <!-- 登录：填密码（必填） -->
      <input
        v-if="authMode === 'login'"
        v-model="authPassword"
        type="password"
        placeholder="密码（至少 6 位）"
        @keyup.enter="doAuth"
      />

      <!-- 注册第 1 步：发码 -->
      <template v-if="authMode === 'register' && authStep === 'input'">
        <button class="submit-btn" type="button" :disabled="authSending" @click="sendCode">
          {{ authSending ? '发送中…' : '获取邮箱验证码' }}
        </button>
      </template>

      <!-- 注册第 2 步：填码完成 -->
      <template v-if="authMode === 'register' && authStep === 'code'">
        <input v-model="authCode" placeholder="邮箱收到的 6 位验证码" @keyup.enter="doAuth" />
        <button class="submit-btn" type="button" :disabled="authBusy" @click="doAuth">注册并登录</button>
        <button class="link-btn" type="button" @click="switchAuthMode('register')">重新获取验证码</button>
      </template>

      <!-- 登录 -->
      <template v-if="authMode === 'login'">
        <button class="submit-btn" type="button" :disabled="authBusy" @click="doAuth">登录</button>
        <button class="link-btn" type="button" @click="switchAuthMode('reset')">忘记密码？</button>
      </template>

      <!-- 重置密码：第 1 步发码 -->
      <template v-if="authMode === 'reset' && authStep === 'input'">
        <button class="submit-btn" type="button" :disabled="authSending" @click="sendCode">
          {{ authSending ? '发送中…' : '获取重置验证码' }}
        </button>
      </template>
      <!-- 重置密码：第 2 步填码 + 新密码 -->
      <template v-if="authMode === 'reset' && authStep === 'code'">
        <input v-model="authResetCode" placeholder="邮箱收到的重置验证码" @keyup.enter="doAuth" />
        <input v-model="authNewPassword" type="password" placeholder="设新密码（至少 6 位）" @keyup.enter="doAuth" />
        <p class="auth-pwd-hint">新密码至少 6 位，建议同时包含字母和数字</p>
        <button class="submit-btn" type="button" :disabled="authBusy" @click="doAuth">确认重置并登录</button>
        <button class="link-btn" type="button" @click="switchAuthMode('reset')">重新获取验证码</button>
      </template>

      <p v-if="authMsg" class="auth-msg">{{ authMsg }}</p>
      <p class="auth-hint">注册即设置密码，之后可用「邮箱 + 密码」直接登录；已注册但没设过密码的账号，点登录页「忘记密码？」用邮箱验证码补设。</p>
    </div>
  </div>

  <!-- ============ 移动端底部导航 ============ -->
  <nav class="mobile-nav" :class="{ 'nav-hidden': currentWork }">
    <button :class="{ active: currentWork || tab === 'browse' }" type="button" @click="currentWork ? closeWork() : (tab = 'browse')">
      <span class="mi">🏠</span>首页
    </button>
    <button :class="{ active: tab === 'submit' }" type="button" @click="tab = 'submit'">
      <span class="mi">➕</span>投稿
    </button>
    <button :class="{ active: showFavOnly }" type="button" @click="isLoggedIn ? (showFavOnly = !showFavOnly) : (showAuth = true)">
      <span class="mi">⭐</span>收藏
    </button>
    <button :class="{ active: isLoggedIn }" type="button" @click="isLoggedIn ? null : (showAuth = true)">
      <span class="mi">👤</span>我的
    </button>
  </nav>

  <!-- ============ 站内帮助 ============ -->
  <div v-if="showHelp" class="help-overlay" @click.self="showHelp = false">
    <div class="help-modal">
      <div class="help-head">
        <span>使用指南</span>
        <button class="help-close" type="button" @click="showHelp = false">✕</button>
      </div>
      <div class="help-body">
        <h2>kh-library 使用指南</h2>
        <p class="help-lead">这是给<strong>逛馆读者</strong>看的说明书——怎么找文、看文、存文、分享文、投稿。</p>

        <h3>一、这个站是什么</h3>
        <p>kh-library 是一个<strong>同人作品索引馆</strong>。站里不放正文，只收录每篇作品的<strong>基本信息</strong>（标题、作者、简介、标签、原站链接）。想看完整内容，点「前往原站阅读」会跳到 AO3 / 微博 / LOFTER 等<strong>原发布平台</strong>。一句话：它是个“图书馆目录”，不是“图书馆书库”。</p>

        <h3>二、怎么找文</h3>
        <ul>
          <li><strong>按标签筛选</strong>：顶部一排标签，点一下只看这类；点「全部」取消筛选。</li>
          <li><strong>按收藏筛选</strong>：登录后会出现「★ 我的收藏」，点一下只看你收藏过的。</li>
          <li><strong>悬停预览</strong>：鼠标移到卡片上，会浮出简介前两句和标签，不用点进去也能快速判断。</li>
        </ul>

        <h3>三、怎么看文</h3>
        <p>点任意卡片 → 进入<strong>阅读页</strong>。阅读页上半部分是作品信息；关键按钮 <strong>「前往原站阅读 ↗」</strong> 在新标签页打开这篇文的原站链接，正文在那边看。多章节作品右侧会列出章节目录，当前章高亮，点任意章直接跳原站对应章节。</p>

        <h3>四、复制链接（分享）</h3>
        <p>阅读页顶栏有 <strong>「🔗 复制链接」</strong> 按钮，点一下复制的是<strong>这篇文的原站链接</strong>（和「前往原站阅读」点出去的是同一个）。粘到微信 / QQ / 微博，对方点开就是原文。复制成功右下角会弹「原文链接已复制 ✓」。</p>

        <h3>五、收藏</h3>
        <p>卡片右下角和阅读页顶栏都有 <strong>★</strong>，点一下收藏、再点取消。登录后可用「★ 我的收藏」把列表筛成只显示收藏过的篇目。收藏数据跟着账号，换设备登录仍在。</p>

        <h3>六、主题与护眼</h3>
        <ul>
          <li><strong>全站深浅色</strong>：顶栏的日/月图标切换，偏好会自动记住。</li>
          <li><strong>阅读主题</strong>：在阅读页点「主题」，可在默认 / 护眼（米黄）之间切换。</li>
        </ul>

        <h3>七、投稿</h3>
        <p>觉得某篇好文没收录？自己来加：切到「投稿」页，把<strong>原站链接</strong>粘进「原文链接」框，点 <strong>「识别并填充」</strong>，系统会自动抓取标题、作者、简介、标签帮你填好。检查后点「提交」即可进馆。想一次加很多篇，用「批量导入」。</p>

        <h3>八、移动端</h3>
        <p>手机上底部有一排快捷入口（投稿、收藏等）。阅读页在窄屏会自动收起右侧章节栏、把操作收进底部条。</p>

        <h3>九、常见问题</h3>
        <dl>
          <dt>为什么不能直接在站里看正文？</dt>
          <dd>版权与平台规则所限，站里只做索引。正文永远在原站，点「前往原站阅读」即可。</dd>
          <dt>复制出来的链接打不开？</dt>
          <dd>那通常是原站链接本身失效/被删（原平台的事）。复制的是原文地址，原站改了我们改不了。</dd>
          <dt>我收藏的文没了？</dt>
          <dd>收藏跟账号走。没登录或换号会看不到；清了浏览器数据也可能丢。</dd>
          <dt>标签点不动 / 列表空白？</dt>
          <dd>硬刷一下（Ctrl+Shift+R）清掉旧缓存；还不行就反馈给站长。</dd>
        </dl>
      </div>
    </div>
  </div>

  <!-- ============ 反馈浮层 ============ -->
  <div v-if="showFeedback" class="help-overlay" @click.self="showFeedback = false">
    <div class="help-modal">
      <div class="help-head">
        <span>反馈</span>
        <button class="help-close" type="button" @click="showFeedback = false">✕</button>
      </div>
      <div class="help-body fb-body">
        <p>bug 修改和使用反馈，请联系：</p>
        <p class="fb-email"><a href="mailto:baby515151@126.com">baby515151@126.com</a></p>
      </div>
    </div>
  </div>

  <!-- 复制链接 toast -->
  <div class="toast" :class="{ show: toastMsg }">{{ toastMsg }}</div>
</template>
