# kh-library（同人作品图书馆）

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
2. 数据库 → 新建 `works` 表（SQL 见 `cloudbase/migrations/`）；安全规则整段替换为 `cloudbase/security-rules.json` 的内容（`{ "read": true, "write": true }`）。
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
- **深浅色主题**：中性灰底 + 雾蓝强调色，偏好存 `localStorage`。

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
│  ├─ security-rules.json  # 数据库安全规则（匿名可读可写）
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
- `status` 字段预留审核：`status=1` 才展示；加审核只需把安全规则改为需登录才写 + 加 `/admin` 页面，前端展示逻辑不动。

---

## 将来加审核（扩展点）

1. `cloudbase/security-rules.json` 改为需要登录才写（`write` 限制为已登录）。
2. 用 CloudBase 鉴权建一个管理员账号。
3. 加一个 `/admin` 页面：列出 `status=0` 的作品，点「通过」改成 1。
   前端展示逻辑（`status=1` 才显示）不用动。

---

## License

本项目仅供学习与非商用同人作品索引使用。所有作品版权归原作者所有，正文均跳转至原发布平台。
