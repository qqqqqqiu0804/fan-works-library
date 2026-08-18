// 元数据抓取的前端封装：调用云端云函数 fetchWorkMeta，
// 把粘贴的链接变成「已识别平台 + 可预填的标题/作者/封面/简介」。
import { app } from './cloudbase.js'

export { detectPlatform, PLATFORMS, platformBadge } from './platformDetect.js'

// 调云端函数抓取链接元数据。返回结构：{ code, message, data: { platform, platformLabel, sourceUrl, title, author, coverUrl, summary } }
export async function fetchWorkMeta(url) {
  if (!app) throw new Error('未连接到云端')
  const { result } = await app.callFunction({
    name: 'fetchWorkMeta',
    data: { url },
  })
  return result
}
