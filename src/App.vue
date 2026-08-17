<script setup>
import { ref, computed, onMounted } from 'vue'
import { getWorks, addWork, updateWork, deleteWork } from './lib/data.js'
import { cloudbaseEnabled } from './lib/cloudbase.js'

const tab = ref('browse') // 'browse' | 'submit' | 'batch'

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
}

function pickTag(t) {
  tag.value = tag.value === t ? '' : t
  load()
}

function toggleExpand(id) {
  expanded.value[id] = !expanded.value[id]
}

// 作品链接：优先用 links 数组，退化到 original_url
function workLinks(w) {
  return w.links && w.links.length
    ? w.links
    : w.original_url
    ? [w.original_url]
    : []
}
function hasMulti(w) {
  return workLinks(w).length > 1
}
function mainLink(w) {
  return workLinks(w)[0] || '#'
}

// ---------- 管理后台（前端口令保护） ----------
// 后端 RLS 已放行匿名改删，这里的前端口令只挡普通访客误删，非安全边界。
const ADMIN_KEY = 'kh_admin_pwd'
const ADMIN_SET = 'kh_admin_pwd_set'
const adminMode = ref(false)
const showPwd = ref(false)
const pwdInput = ref('')
const editingId = ref(null)
const editForm = ref({})
const hasPwd = computed(() => !!localStorage.getItem(ADMIN_SET))

function enterAdmin() {
  const saved = localStorage.getItem(ADMIN_KEY)
  if (!localStorage.getItem(ADMIN_SET)) {
    if (!pwdInput.value.trim()) return
    localStorage.setItem(ADMIN_KEY, pwdInput.value.trim())
    localStorage.setItem(ADMIN_SET, '1')
  } else if (pwdInput.value.trim() !== saved) {
    alert('口令错误')
    pwdInput.value = ''
    return
  }
  adminMode.value = true
  showPwd.value = false
  pwdInput.value = ''
}

function exitAdmin() {
  adminMode.value = false
  editingId.value = null
}

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
  title: '', author: '', original_url: '', summary: '', category: '', tags: ''
})
const msg = ref('')

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
        .filter(Boolean)
    })
    msg.value = '提交成功，已展示在列表里 🎉'
    form.value = { title: '', author: '', original_url: '', summary: '', category: '', tags: '' }
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
  await loadFilters()
  await load()
})
</script>

<template>
  <header>
    <div class="title">
      <span class="logo">
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 2h6a2 2 0 0 1 2 2v8a2 2 0 0 0-2-2H3z" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M3 2v8" stroke="#fff" stroke-width="1.2"/></svg>
      </span>
      kh-library
    </div>
    <div class="tabs">
      <button :class="{ active: tab === 'browse' }" @click="tab = 'browse'">浏览</button>
      <button :class="{ active: tab === 'submit' }" @click="tab = 'submit'">投稿</button>
      <button :class="{ active: tab === 'batch' }" @click="tab = 'batch'">批量导入</button>
      <button class="lock-btn" type="button" @click="adminMode ? exitAdmin() : (showPwd = !showPwd)">
        {{ adminMode ? '退出管理' : '🔒' }}
      </button>
    </div>
    <div v-if="showPwd" class="pwd-bar">
      <input v-model="pwdInput" :placeholder="hasPwd ? '输入管理口令' : '设置管理口令'" @keyup.enter="enterAdmin" />
      <button class="submit-btn small" type="button" @click="enterAdmin">确认</button>
    </div>
  </header>

  <!-- ============ 浏览页 ============ -->
  <section v-if="tab === 'browse'">
    <p v-if="!cloudbaseEnabled" class="hint">
      当前为本地演示模式（数据存你浏览器）。配置 VITE_CLOUDBASE_ENV_ID 即可切换云端、数据统一。
    </p>
    <div class="bar">
      <input v-model="search" placeholder="搜标题 / 作者 / 简介" @keyup.enter="load" />
      <select v-model="category" @change="load">
        <option value="">全部分类</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>
    <div class="chips">
      <span
        v-for="t in tags"
        :key="t"
        class="chip"
        :class="{ active: tag === t }"
        @click="pickTag(t)"
      >#{{ t }}</span>
    </div>

    <div class="grid">
      <div v-for="w in works" :key="w.id" class="card">
        <template v-if="adminMode && editingId === w.id">
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
        </template>
        <template v-else>
          <div class="c-title">{{ w.title }}</div>
          <div class="c-meta">{{ w.author || '佚名' }} · {{ w.category || '未分类' }}</div>
          <div v-if="w.summary" class="c-sum">{{ w.summary }}</div>
          <div class="c-tags"><span v-for="t in (w.tags || [])" :key="t">#{{ t }}</span></div>
          <div class="card-actions">
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
          <div v-if="adminMode" class="admin-actions">
            <button class="link-btn ghost" type="button" @click="startEdit(w)">编辑</button>
            <button class="link-btn danger" type="button" @click="removeWork(w)">删除</button>
          </div>
        </template>
      </div>
    </div>
    <div v-if="!works.length" class="empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#D8D0C7" stroke-width="1.5">
        <rect x="10" y="8" width="28" height="32" rx="3" />
        <path d="M16 16h16M16 22h16M16 28h10" />
      </svg>
      <p>还没有作品</p>
      <span>去「投稿」或「批量导入」加几条吧</span>
    </div>
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
        <input v-model="form.original_url" placeholder="https://..." />
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
</template>
