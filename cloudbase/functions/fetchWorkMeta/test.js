// fetchWorkMeta 本地测试：验证 AO3 元数据提取逻辑
const assert = require('assert')
const cheerio = require('cheerio')
const {
  main,
  extractAO3,
  stripAO3TitleSuffix,
  decodeEntities,
} = require('./index.js')

// ---------- 1. 纯本地 Mock：模拟用户截图中的 AO3 页面 ----------
function buildMock({ title, author, summary, hasH2 = true }) {
  const h2 = hasH2 ? `<h2 class="title heading">${title}</h2>` : ''
  const byline = `<h3 class="byline heading">by <a rel="author" href="/users/${author}/pseuds/${author}">${author}</a></h3>`
  const summaryBlock = summary
    ? `<div class="summary module"><h3 class="heading">Summary:</h3><blockquote class="userstuff"><p>${summary}</p></blockquote></div>`
    : ''
  return `
<!DOCTYPE html>
<html>
<head><title>${title} - [Archive of Our Own]</title></head>
<body>
<div id="main" class="work">
  ${h2}
  ${byline}
  ${summaryBlock}
</div>
</body>
</html>`
}

console.log('--- Test 1: 本地 Mock AO3 ---')
const html1 = buildMock({ title: 'SN48', author: 'kurobanana', summary: 'A short summary.' })
const res1 = extractAO3(cheerio.load(html1))
assert.strictEqual(res1.title, 'SN48', `标题应为 SN48，得到 ${res1.title}`)
assert.strictEqual(res1.author, 'kurobanana', `作者应为 kurobanana，得到 ${res1.author}`)
assert.strictEqual(res1.summary, 'A short summary.', `简介应为 A short summary.，得到 ${res1.summary}`)
assert.strictEqual(res1.coverUrl, '')
console.log('✅ Mock 通过：', JSON.stringify(res1, null, 2))

// ---------- 2. 测试 title 后缀剥离（兜底 <title>） ----------
console.log('\n--- Test 2: title 后缀剥离 ---')
assert.strictEqual(stripAO3TitleSuffix('SN48 - [Archive of Our Own]'), 'SN48')
assert.strictEqual(stripAO3TitleSuffix('Work Title - Archive of Our Own'), 'Work Title')
assert.strictEqual(stripAO3TitleSuffix('Work Title | Archive of Our Own'), 'Work Title')
assert.strictEqual(stripAO3TitleSuffix('Work Title'), 'Work Title')
console.log('✅ 后缀剥离通过')

// ---------- 3. 没有 h2 标题时，用 <title> 兜底 ----------
console.log('\n--- Test 3: 无 h2，用 <title> 兜底 ---')
const html3 = buildMock({ title: 'Fallback Title', author: 'someone', summary: '', hasH2: false })
const res3 = extractAO3(cheerio.load(html3))
assert.strictEqual(res3.title, 'Fallback Title')
assert.strictEqual(res3.author, 'someone')
console.log('✅ 兜底通过：', JSON.stringify(res3, null, 2))

// ---------- 4. 没有 <a rel="author"> 时，读 byline ----------
console.log('\n--- Test 4: 无 author link，读 byline ---')
const html4 = `
<!DOCTYPE html>
<html><head><title>T - [Archive of Our Own]</title></head>
<body><div class="work"><h2 class="title heading">T</h2><h3 class="byline heading">by another_writer</h3></div></body>
</html>`
const res4 = extractAO3(cheerio.load(html4))
assert.strictEqual(res4.author, 'another_writer')
console.log('✅ byline 兜底通过：', JSON.stringify(res4, null, 2))

// ---------- 5. 调用 main 走完整流程（本地网络，可能失败） ----------
async function testMain() {
  console.log('\n--- Test 5: main() 真实网络请求 ---')
  // 选一个 AO3 上公开存在的 work（低概率 404）。若网络不通会进入 catch，属于环境限制。
  const url = 'https://archiveofourown.org/works/12345678'
  try {
    const result = await main({ url })
    console.log('main() 返回：', JSON.stringify(result, null, 2))
    if (result.code === 0 && result.data.title) {
      console.log('✅ main() 成功提取到 AO3 元数据')
    } else {
      console.log('⚠️ main() 未提取到内容（可能网络/反爬/页面不存在）:', result.message)
    }
  } catch (e) {
    console.log('⚠️ main() 网络请求失败（环境限制）:', e.message)
  }
}

testMain().then(() => {
  console.log('\n--- 全部本地测试通过 ---')
}).catch((e) => {
  console.error('\n--- 测试失败 ---', e)
  process.exit(1)
})
