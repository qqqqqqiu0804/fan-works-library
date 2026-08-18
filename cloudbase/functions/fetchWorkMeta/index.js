// 云函数 fetchWorkMeta（Event Function）
// 入参：event.url  （一条作品外链）
// 出参：{ code, message, data: { platform, platformLabel, sourceUrl, title, author, coverUrl, summary } }
//
// 做法：服务端 fetch 页面 → 用 cheerio 解析 OG / Twitter / <title> 等元数据 →
// 结合平台识别正则，归一化成统一结构返回。
// 抓取失败（反爬 / 登录墙 / 超时）也不报错，只返回已识别的平台，让前端回退手动填写。
//
// 注意：不要回传 event / context / process.env（可能含平台临时凭证）。

const cheerio = require('cheerio')

function detectPlatform(url) {
  const u = String(url || '').toLowerCase()
  if (/ao3-mirror\.cc|archiveofourown\.org/.test(u)) return 'ao3'
  if (/lofter\.com/.test(u)) return 'lofter'
  if (/bilibili\.com|b23\.tv/.test(u)) return 'bilibili'
  if (/jjwxc\.net|jjwxc\.com/.test(u)) return 'jjwxc'
  if (/pixiv\.net|pximg\.net/.test(u)) return 'pixiv'
  if (/weibo\.com|weibo\.cn|t\.cn/.test(u)) return 'weibo'
  return 'other'
}

const LABELS = {
  ao3: 'AO3', lofter: 'LOFTER', bilibili: 'B站', jjwxc: '晋江', pixiv: 'Pixiv', weibo: '微博', other: '其他',
}

function absolutize(src, base) {
  if (!src) return ''
  try {
    return new URL(src, base).href
  } catch (e) {
    return src
  }
}

function decodeEntities(s) {
  if (!s) return ''
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function metaText($, name) {
  let v =
    $(`meta[property="og:${name}"]`).attr('content') ||
    $(`meta[name="og:${name}"]`).attr('content') ||
    $(`meta[name="twitter:${name}"]`).attr('content')
  return v ? decodeEntities(v) : ''
}

function stripAO3TitleSuffix(title) {
  return title
    .replace(/\s*-\s*\[\s*Archive of Our Own\s*\]\s*$/i, '')
    .replace(/\s*-\s*Archive of Our Own\s*$/i, '')
    .replace(/\s*\|\s*Archive of Our Own\s*$/i, '')
    .trim()
}

// AO3 页面结构比较规律：
//   标题：<h2 class="title heading">作品名</h2>
//   作者：<a rel="author" href="/users/xxx">xxx</a>（嵌在 <h3 class="byline heading"> 里）
//   简介：<div class="summary module"><blockquote class="userstuff"><p>...</p></blockquote></div>
// <title> 通常是 "作品名 - [Archive of Our Own]"，所以兜底时要去掉尾巴。
function extractAO3($) {
  // 标题：优先读页内主标题
  let title = ''
  const h2 = $('h2.title.heading').first()
  if (h2.length) {
    title = decodeEntities(h2.text())
  } else {
    title = stripAO3TitleSuffix(decodeEntities($('title').first().text()))
  }

  // 作者：先找 <a rel="author">，没有则读 byline 并去掉前缀 "by "
  let author = ''
  const authorLink = $('a[rel="author"]').first()
  if (authorLink.length) {
    author = decodeEntities(authorLink.text())
  } else {
    const byline = $('h3.byline.heading').first()
    if (byline.length) {
      author = decodeEntities(byline.text().replace(/^by\s+/i, '').trim())
    }
  }

  // 简介：AO3 的 summary module 里的 blockquote.userstuff
  let summary = ''
  const summaryBlock = $('.summary.module blockquote.userstuff, .summary blockquote.userstuff, blockquote.userstuff.summary').first()
  if (summaryBlock.length) {
    summary = decodeEntities(summaryBlock.text())
  }

  return { title, author, summary, coverUrl: '' }
}

function extractGeneric($, baseUrl) {
  return {
    title: metaText($, 'title') || decodeEntities($('title').first().text()),
    author:
      metaText($, 'author') ||
      metaText($, 'article:author') ||
      decodeEntities($('meta[name="author"]').attr('content') || ''),
    coverUrl: absolutize(metaText($, 'image'), baseUrl),
    summary: metaText($, 'description'),
  }
}

// 导出内部函数，方便本地单元测试
exports.extractAO3 = extractAO3
exports.extractGeneric = extractGeneric
exports.stripAO3TitleSuffix = stripAO3TitleSuffix
exports.decodeEntities = decodeEntities

exports.main = async (event) => {
  const url = event && event.url
  if (!url || !/^https?:\/\//i.test(url)) {
    return { code: -1, message: '缺少合法的 url 参数', data: null }
  }

  const platform = detectPlatform(url)
  const base = { platform, platformLabel: LABELS[platform], sourceUrl: url }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const html = await resp.text()
    const $ = cheerio.load(html)

    const extracted = platform === 'ao3'
      ? extractAO3($)
      : extractGeneric($, url)

    return {
      code: 0,
      message: 'ok',
      data: {
        ...base,
        title: extracted.title || '',
        author: extracted.author || '',
        coverUrl: extracted.coverUrl || '',
        summary: extracted.summary || '',
      },
    }
  } catch (e) {
    // 抓取失败：仍返回已识别的平台，让前端回退手动填写
    return {
      code: 0,
      message: 'fetched_partial:' + (e && e.message ? e.message : 'unknown'),
      data: { ...base, title: '', author: '', coverUrl: '', summary: '' },
    }
  }
}
