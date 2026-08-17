import { cloudbaseEnabled, app, db } from './cloudbase.js'

// ============================================================
// 数据层：对外只暴露 getWorks / addWork 两个函数。
// 连了 CloudBase（PostgreSQL）就走云端，没连就走浏览器 localStorage 演示。
// 上层页面不用关心数据到底存在哪。
// ============================================================

const TABLE = 'works'

const STORE_KEY = 'fan_works_local'

// ---- 本地演示用的种子数据（仅本地模式可见） ----
const seed = [
  {
    id: 1,
    title: '【示例】春日漫步',
    author: '某画师',
    original_url: 'https://example.com/a',
    links: ['https://example.com/a'],
    cover_url: '',
    summary: '本地演示数据。连上 CloudBase 后会被真实数据覆盖。',
    category: '同人图',
    tags: ['治愈', '春'],
    status: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    title: '【示例】星海之下',
    author: '某写手',
    original_url: 'https://example.com/b',
    links: ['https://example.com/b'],
    cover_url: '',
    summary: '另一条演示数据，用来测试搜索和筛选。',
    category: '同人文',
    tags: ['群像', '悲壮'],
    status: 1,
    created_at: new Date().toISOString()
  }
]

function localGet() {
  const raw = localStorage.getItem(STORE_KEY)
  if (!raw) {
    localStorage.setItem(STORE_KEY, JSON.stringify(seed))
    return seed
  }
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function localAdd(work) {
  const list = localGet()
  list.unshift({
    ...work,
    links: work.links && work.links.length ? work.links : (work.original_url ? [work.original_url] : []),
    id: Date.now(),
    status: 1,
    created_at: new Date().toISOString()
  })
  localStorage.setItem(STORE_KEY, JSON.stringify(list))
}

// 匿名登录（安全规则已放行匿名读写，登录可选；失败忽略不影响）
let authReady = null
function ensureAuth() {
  if (!cloudbaseEnabled || !app) return Promise.resolve()
  if (authReady) return authReady
  authReady = app
    .auth()
    .signInAnonymously()
    .catch(() => {})
  return authReady
}

// 标准化一条作品：保证 links 是数组（PG 里存为 jsonb）
function normalize(work) {
  const links = work.links && work.links.length
    ? work.links
    : (work.original_url ? [work.original_url] : [])
  return {
    title: work.title,
    author: work.author || '',
    original_url: work.original_url || links[0] || '',
    links,
    cover_url: work.cover_url || '',
    summary: work.summary || '',
    category: work.category || '',
    tags: work.tags || [],
    status: 1,
    created_at: new Date().toISOString()
  }
}

// 读取作品，支持 搜索 / 分类 / 标签 三个过滤条件
export async function getWorks({ search = '', category = '', tag = '' } = {}) {
  if (cloudbaseEnabled && db) {
    await ensureAuth()
    // PG：postgREST 风格；只取已展示(status=1)的，最多 300 条
    const { data, error } = await db
      .from(TABLE)
      .select('*')
      .eq('status', 1)
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) throw error
    let list = data || []
    // 搜索/筛选在内存里做（数据量不大，省去云端复合查询）
    const kw = search.trim().toLowerCase()
    if (kw) list = list.filter((w) => (w.title + w.author + w.summary).toLowerCase().includes(kw))
    if (category) list = list.filter((w) => w.category === category)
    if (tag) list = list.filter((w) => (w.tags || []).includes(tag))
    return list
  }

  // ---- 本地演示模式 ----
  let list = localGet()
  const kw = search.trim().toLowerCase()
  if (kw) {
    list = list.filter((w) => (w.title + w.author + w.summary).toLowerCase().includes(kw))
  }
  if (category) list = list.filter((w) => w.category === category)
  if (tag) list = list.filter((w) => (w.tags || []).includes(tag))
  return list
}

// 新增作品（无审核版：写入即 status=1 展示）
// work 可含 links: string[]（多章节链接）；单条投稿时 links 取 [original_url]
export async function addWork(work) {
  const w = normalize(work)
  if (cloudbaseEnabled && db) {
    await ensureAuth()
    const { error } = await db.from(TABLE).insert(w)
    if (error) throw error
    return
  }
  localAdd(w)
}
