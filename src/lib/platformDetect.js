// 来源平台识别：从作品链接识别平台，用于自动打标签 + 选图标/徽标。
// 纯函数、零依赖，前端与云端云函数共用同一份逻辑。
// 覆盖同人作品常见托管平台：AO3(及镜像) / LOFTER / B站 / 晋江 / Pixiv / 微博。

export const PLATFORMS = {
  ao3:      { label: 'AO3',    homepage: 'https://archiveofourown.org' },
  lofter:   { label: 'LOFTER', homepage: 'https://www.lofter.com' },
  bilibili: { label: 'B站',    homepage: 'https://www.bilibili.com' },
  jjwxc:    { label: '晋江',   homepage: 'https://www.jjwxc.net' },
  pixiv:    { label: 'Pixiv',  homepage: 'https://www.pixiv.net' },
  weibo:    { label: '微博',   homepage: 'https://weibo.com' },
  other:    { label: '其他',   homepage: '' },
}

// 返回 { platform, label, homepage }
export function detectPlatform(url = '') {
  const u = String(url || '').trim().toLowerCase()
  if (!u) return { platform: 'other', ...PLATFORMS.other }
  if (/ao3-mirror\.cc|archiveofourown\.org/.test(u)) return { platform: 'ao3', ...PLATFORMS.ao3 }
  if (/lofter\.com/.test(u)) return { platform: 'lofter', ...PLATFORMS.lofter }
  if (/bilibili\.com|b23\.tv/.test(u)) return { platform: 'bilibili', ...PLATFORMS.bilibili }
  if (/jjwxc\.net|jjwxc\.com/.test(u)) return { platform: 'jjwxc', ...PLATFORMS.jjwxc }
  if (/pixiv\.net|pximg\.net/.test(u)) return { platform: 'pixiv', ...PLATFORMS.pixiv }
  if (/weibo\.com|weibo\.cn|t\.cn/.test(u)) return { platform: 'weibo', ...PLATFORMS.weibo }
  return { platform: 'other', ...PLATFORMS.other }
}

// 批量识别：用于列表页给每条作品快速打平台徽标（不发起网络请求）
export function platformBadge(url = '') {
  const { platform, label } = detectPlatform(url)
  return { platform, label }
}
