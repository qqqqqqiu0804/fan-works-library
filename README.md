# 同人作品图书馆（Serverless 版）

静态前端（Vue 3 + Vite）+ 云数据库（腾讯云开发 CloudBase）。前端免费托管在 Netlify，数据存 CloudBase（国内节点，粉丝在国内可直接投稿，不再出现「Failed to fetch / 点提交没动静」）。提交即展示，无审核；已预留 `status` 字段，将来加审核只需加字段+登录页。

> 为什么用 CloudBase 而不是 Supabase：Supabase 节点在海外，中国大陆浏览器访问其 REST 端点会超时，导致投稿失败。CloudBase 有国内节点，直连稳定。

## 两种运行模式

- **本地演示模式**（默认）：不填任何密钥也能跑，数据存在浏览器 localStorage，只在你这台电脑上。用来看界面、学结构。
- **云端模式**：建一个免费 CloudBase 环境，填好 envId 后，数据进真数据库，所有人访问同一份。

## 本地跑起来（演示模式）

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173 即可。去「投稿」加一条，回到「浏览」就能看到。

## 切到云端（让别人也能访问）

详细步骤见 `cloudbase/setup.md`，要点：

1. 打开 https://console.cloud.tencent.com/tcb 新建环境，复制 **环境 ID**（形如 `fan-library-7g3k2q9p`）。
2. 数据库 → 新建集合 `works`；安全规则整段替换为 `cloudbase/security-rules.json` 的内容（`{ "read": true, "write": true }`）。
3. 复制 `.env.example` 为 `.env`，填入：
   ```
   VITE_CLOUDBASE_ENV_ID=你的环境ID
   ```
4. 重启 `npm run dev`，数据即走云端。

## 部署到公网（免费）

把本目录推到 GitHub，在 Netlify 导入仓库，构建命令 `npm run build`、输出目录 `dist`。部署后在 Environment variables 里加 `VITE_CLOUDBASE_ENV_ID` 即可。

## 批量导入

「批量导入」页签支持粘贴微博合集文本（如「网h系列导航」）：按 `《标题》` 分段，抓取每个数字 ID 还原成 `https://m.weibo.cn/detail/ID`，一篇下的多个 ID 合并成一作多章节。解析后预览、确认提交。

## 将来加审核（扩展点）

1. `cloudbase/security-rules.json` 改为需要登录才写（`write` 限制为已登录）。
2. 用 CloudBase 鉴权建一个管理员账号。
3. 加一个 `/admin` 页面：列出 `status=0` 的作品，点「通过」改成 1。
   前端展示逻辑（`status=1` 才显示）不用动。

## 目录结构

```
fan-works-library/
├─ index.html
├─ package.json
├─ vite.config.js
├─ .env.example          # 复制为 .env 填 CloudBase 环境 ID
├─ cloudbase/
│  ├─ setup.md           # CloudBase 接入步骤
│  └─ security-rules.json# 数据库安全规则（匿名可读可写）
└─ src/
   ├─ main.js
   ├─ App.vue            # 浏览 + 投稿 + 批量导入 三个页签
   ├─ style.css
   └─ lib/
      ├─ cloudbase.js     # 初始化 SDK + 判断是否启用云端
      └─ data.js          # getWorks / addWork（云端 or 本地）
```
