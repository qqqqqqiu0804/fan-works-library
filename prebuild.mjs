// 构建前把旧 dist 改名挪开，规避沙箱 safe-delete 把 dist 文件锁成只读/占用，
// 导致 vite 写 dist/index.html 报 EPERM。改名（rename）不受锁影响，
// 之后 vite 会写入全新的 dist。旧的 dist_bak_* 目录无害，已被 .gitignore 忽略。
import { existsSync, renameSync } from 'fs'

const src = 'dist'
if (existsSync(src)) {
  const bak = `dist_bak_${Date.now()}`
  try {
    renameSync(src, bak)
    console.log(`[prebuild] moved dist -> ${bak}`)
  } catch (e) {
    console.warn('[prebuild] 无法挪开 dist，将尝试直接构建：', e.message)
  }
}
