# kh-library

一个轻量的**同人作品索引站**：把散落在微博 / LOFTER / AO3 等平台的同人文集中起来，做成一个可检索、可筛选、带「一键跳转原站」的图书馆。

> 设计理念：站内**不存正文**，只做索引。同人作品的正文始终留在原作者发布的平台，本站负责整理、检索、归档，让读者快速找到并回到原站阅读。

线上示例：`https://kh-library-d8g5r9pxu24e60f0a-1385636270.tcloudbaseapp.com/`

---

## 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 前端 | Vue 3 + Vite | 单页应用，hash 路由，无后端框架 |
| 数据库 | 腾讯云开发 CloudBase **PostgreSQL** | `works` 表，`links` 字段用 `jsonb` 存多章节链接 |
| 静态托管 | CloudBase Static Hosting | 国内节点，默认域名 `*.tcloudbaseapp.com`，免备案可直连 |
| 云函数 | CloudBase 云函数 | `fetchWorkMeta`（投稿时自动抓取原文元数据） |

> 为什么用 CloudBase 而不是 Supabase / Netlify：Supabase 节点在海外，中国大陆浏览器访问其 REST 端点会超时；CloudBase 有国内节点，直连稳定，且静态托管对国内访问友好。

---

## 两种运行模式

- **本地演示模式（默认）**：不填任何密钥也能跑，数据存在浏览器 `localStorage`，只在你这台电脑上。用来看界面、学结构。
- **云端模式**：建一个免费 CloudBase 环境，填好 envId 后，数据进真实 PostgreSQL，所有人访问同一份。

---

## 快速开始（本地演示）

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:5173` 即可。去「投稿」加一条，回到「浏览」就能看到。

---

## 切到云端（让别人也能访问）

详细步骤见 [`cloudbase/setup.md`](cloudbase/setup.md)，要点：

1. 打开 https://console.cloud.tencent.com/tcb 新建环境，复制 **环境 ID**（形如 `kh-library-xxxxxx`）。
2. 数据库 → 依次执行 `cloudbase/migrations/` 下的 SQL：
   - `20260817080636_create_works.sql`：建 `works` 表；
   - `20260817192100_auth_roles_favorites.sql`：加 `author_uid` 列、建 `users`/`favorites` 表、定义 RLS 行级安全策略；
   - `20260818000000_tighten_rls.sql`：收紧 RLS（作品写改删限作者或管理员、收藏限本人、注册强制 `role='user'`）；
   - `20260818200000_sanitize_urls.sql`：建 `trg_sanitize_work_urls` 触发器，强制外链仅 `http(s)`，挡住存储型 XSS。
   
   数据权限完全由这些 migration 里的 RLS policy 控制，配套可读配置见 `cloudbase/security-rules.json`。
3. 复制 `.env.example` 为 `.env`，填入：
   ```
   VITE_CLOUDBASE_ENV_ID=你的环境ID
   ```
4. 重启 `npm run dev`，数据即走云端。

---

## 部署到公网（免费）

构建产物在 `dist/`，上传到 CloudBase 静态托管根目录即可：

```bash
npm run build        # 产物输出到 dist/
```

在 CloudBase 控制台「静态网站托管」上传 `dist/` 目录，或对接 CI 自动部署。部署后在环境变量里加 `VITE_CLOUDBASE_ENV_ID` 即可连云端数据。

---

## 功能一览

- **浏览 / 搜索 / 筛选**：按标题、作者、简介搜索；按分类、标签筛选；「我的收藏」单独视图。
- **投稿**：粘贴原文链接，调用 `fetchWorkMeta` 云函数**自动识别回填**标题 / 作者 / 简介，确认后提交。
- **批量导入**：粘贴微博合集文本（如「网h系列导航」），按 `《标题》` 分段，抓取每个数字 ID 还原成 `https://m.weibo.cn/detail/ID`，一篇下的多个 ID 合并成一作多章节。解析后预览、确认提交。
- **站内阅读页**（`#/work/:id`，hash 路由）：
  - 作品信息（作者 / 分类 / 来源 / 标签 / 简介）
  - 章节目录，点章节**外跳原站**对应章节
  - 「🔗 复制链接」复制的是**原文链接**（与「前往原站阅读」同源），不是本站页面地址
  - 收藏、深浅色主题切换
- **深浅色主题**：中性灰底 + 雾蓝强调色；全站采用磨砂玻璃（frosted glass / glassmorphism）视觉语言——卡片、顶栏、搜索框、弹窗、移动端导航均为半透明 + `backdrop-filter` 模糊，偏好存 `localStorage`。

---

## 站内帮助

首页右上角「?」、阅读页顶栏「帮助」、页脚「帮助」三处均可唤起同一个「使用指南」弹层（读者向说明书：怎么找文、看文、存文、分享、投稿，以及移动端与常见问题）。

- 状态由 `App.vue` 的 `showHelp` 控制，弹层即 `App.vue` 模板里的 `.help-overlay` / `.help-modal`。
- 顶栏「?」按钮为 `.help-btn`（`src/style.css`），阅读页入口为 `.rt-pill.help`，三处共用同一份指南文案（见 `help-body` 内的「kh-library 使用指南」）。

## 反馈

页脚「反馈」唤起联系方式浮层，给出 **bug 修改与使用反馈**的联系邮箱 `baby515151@126.com`。

- 状态由 `App.vue` 的 `showFeedback` 控制，邮箱展示在 `.fb-body` 浮层（`.help-overlay` 复用同一套遮罩样式）。

## 移动端体验

- **底部导航常驻**（≤640px 显示）：首页 / 投稿 / 批量 / 收藏 / 登录（登录后变「我的」，点击进入收藏或账号视图）。由 `App.vue` 的 `.mobile-nav` 渲染，进入阅读页时自动隐藏（`nav-hidden`）。
- **阅读页窄屏排版**：正文字号、行高在 ≤640px 优化（约 16px / 行高 1.85），段落禁横向溢出（`html, body { overflow-x: hidden }`），保证窄屏阅读舒适。对应 `.read-para` 在 `src/style.css` 的响应式规则。
- **顶栏品牌隐藏**：顶栏品牌文字 `kh-library`（`.title`）在 ≤640px 隐藏（`src/style.css` 中 `.title { display: none }`），为完整底部导航让出空间；品牌本身由 `App.vue` 渲染，桌面端正常显示。

## 最近更新

- **前端设计审计与翻新**：用 Impeccable 设计语言对浏览页做 5 维审计（Accessibility / Implementation Integrity / Responsive / Performance / Theming），从 14/20 一路修到 20/20——修了对比度 token 拆分（雾蓝文字色 `#4F6F8B` 过关 AA）、emoji 图标全换线性 SVG、空状态描边、触控目标、字体 `@import` 阻塞、语义色 token 化、浏览器表面（selection / 滚动条 / focus-ring）主题化。
- **视觉 redesign（毛玻璃）**：在保持 AA 对比度底线的前提下，全站改为磨砂玻璃风格——body 加雾蓝柔光背景，卡片 / 顶栏 / 搜索框 / 弹窗 / 移动端导航均为半透明 + `backdrop-filter` 模糊（卡片 22px、modal 30px），并加玻璃高光边与层次阴影。
- **安全加固（6 项雷点收尾）**：
  - 雷 2 收紧 RLS：建表 SQL 入库、作品写改删限作者或管理员、收藏限本人、管理员由 `users.role` 判定且注册时强制 `'user'`。
  - 雷 5 / 雷 6 文档与代码对齐：`status` 死字段清理（保留 DB 列），安全模型与数据约定文档同步。
  - 存储型 XSS 防护：数据库层 `trg_sanitize_work_urls` 触发器强制外链仅 `http(s)`，前端再叠协议白名单校验（anon key 公开，前端校验挡不住直插路径）。
- 新增站内「使用指南」帮助弹层，首页 / 阅读页 / 页脚三入口统一唤起。
- 新增页脚「反馈」浮层，联系方式 `baby515151@126.com`。
- 移动端底部导航补齐「批量」「登录（我的）」等常驻入口，并优化阅读页窄屏排版与顶栏品牌隐藏逻辑。
- **批量导入体验重构**：告别「一个 textarea + 一行提示」的缝合怪。新增导入引导区（下载模板 / 看样例）、状态机（idle→preview→submitting→done）、校验摘要（有效/重复/错误徽标）、进度条、失败不中断（单篇异常计入失败列表继续后续）、批次内去重跳过、错误行与失败明细 CSV 导出、提交中锁按钮防重复提交。方案稿见 `batch-import-ux-optimization.md`。

---

## 目录结构

```
kh-library/
├─ index.html
├─ package.json
├─ vite.config.js
├─ prebuild.mjs            # 构建前的小幅预处理
├─ .env.example            # 复制为 .env 填 CloudBase 环境 ID
├─ cloudbase/
│  ├─ setup.md             # CloudBase 接入步骤
│  ├─ security-rules.json  # 数据库安全规则（与 migration 里的 RLS policy 配套）
│  ├─ migrations/          # 建表 / 初始化 SQL
│  └─ functions/
│     ├─ fetchWorkMeta/     # 抓取原文元数据（标题 / 作者 / 简介）
│     └─ authRegister/      # 邮箱注册 / 登录
└─ src/
   ├─ main.js
   ├─ App.vue              # 浏览 + 投稿 + 批量导入 + 阅读页
   ├─ style.css
   └─ lib/
      ├─ cloudbase.js       # 初始化 SDK + 判断是否启用云端
      ├─ data.js            # getWorks / addWork（云端 PostgreSQL or 本地）
      ├─ meta.js            # fetchWorkMeta 客户端封装
      └─ platformDetect.js  # 平台识别（微博 / LOFTER / AO3 …）
```

---

## 数据约定

- `works.links` 是 **jsonb**，存多章节原文链接数组：`["https://.../1", "https://.../2"]`。
  - ⚠️ 前端从云数据库拿到时可能是 **JSON 字符串**，凡迭代 / 取 `[0]` 前务必先 `JSON.parse` 标准化为数组。
- 多章节作品「复制链接」与「前往原站阅读」目前都指向 `links[0]`（首章）。
- `status` 字段（smallint，默认 1）**已弃用**：审核设计已移除，前端不再读写该字段；保留列仅为向后兼容，新环境可忽略。

---

## 审核功能（已决定不做）

本站定位为「自己人和粉丝使用的索引站」，不需要审核流程。`status` 字段已弃用移除，所有投稿写入即公开展示；修改 / 删除权限仅限作者本人或管理员（数据权限见 migration 里的 RLS policy 与 `cloudbase/security-rules.json`）。如未来确实需要审核，再单独评估实现。

## 安全模型（XSS / 越权防护）

- **越权**：改 / 删作品受 RLS 限制（`author_uid = auth.uid() OR is_admin()`），收藏受 `uid = auth.uid()` 限制；管理员由 `users.role='admin'` 判定（注册时 `BEFORE INSERT` 触发器强制为 `'user'`，前端无法自提权限）。
- **存储型 XSS**：外链（`original_url` / `links` / `cover_url`）在数据库层由触发器 `trg_sanitize_work_urls` 强制只能是 `http(s)`，自动剔除 `javascript:` / `data:` / `vbscript:` 等伪协议；前端提交时再做一次协议白名单校验给出友好提示。之所以必须做在数据库层：CloudBase 的 anon accessKey 是公开的（写在前端代码里），任何人都能直接调 postgREST 接口插数据，前端校验挡不住这条路径。已实测：用 anon key 直接插入 `javascript:alert(...)`，落库后会被清空为安全链接。
- **已知限制（暂未做）**：投稿无验证码 / 频控（任何人都可匿名投稿，存在垃圾数据风险）；`fetchWorkMeta` 云函数对传入 URL 仅校验 `http(s)` 未做内网地址封禁（SSRF 面较小，因只回传解析出的元数据、不回传响应体）；搜索在内存做、最多覆盖 300 条（数据量上来后下推数据库）。

---

## License

本项目仅供学习与非商用同人作品索引使用。所有作品版权归原作者所有，正文均跳转至原发布平台。
