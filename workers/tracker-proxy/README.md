# Cloudflare Worker Proxy

这个 Worker 用来中转 Tracker.gg 赛季数据，避免把 `Tracker.gg API Key` 直接放进 Electron 客户端。

## 目录

- 入口文件：`src/index.ts`
- 配置文件：`wrangler.jsonc`
- 本地变量示例：`.dev.vars.example`

## 本地开发

1. 安装依赖：

```powershell
npm install
```

2. 复制本地变量模板：

```powershell
Copy-Item .dev.vars.example .dev.vars
```

3. 在 `.dev.vars` 中填入：

```env
TRACKER_GG_API_KEY=你的 Tracker.gg API Key
```

4. 启动本地开发：

```powershell
npm run dev
```

5. 本地访问：

- `http://127.0.0.1:8787/health`
- `http://127.0.0.1:8787/ranked-stats`

## 部署前 secret 配置

部署到 Cloudflare 前，不要上传 `.dev.vars`，而是使用 secret：

```powershell
wrangler login
wrangler secret put TRACKER_GG_API_KEY
```

## 当前接口

### `GET /health`

返回 Worker 健康状态。

### `GET /ranked-stats`

返回 Apex PC 平台当前赛季：

- 大师/猎杀总人数
- 猎杀人数
- 猎杀最低分

当前实现使用以下 Tracker 站内接口：

- `https://api.tracker.gg/api/v1/apex/insights/predator-insights?mode=1&platformSlug=origin`
- `https://api.tracker.gg/api/v1/apex/insights/distribution?platform=origin&field=RankScore`
