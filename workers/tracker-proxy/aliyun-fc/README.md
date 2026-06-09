# Aliyun FC Upload Package

这个目录是阿里云函数计算 `FC` 的独立上传版本，保留了与 Cloudflare Worker 相同的接口：

- `GET /health`
- `GET /ranked-stats`

## 目录说明

- `index.js`：HTTP 服务入口，默认监听 `9000` 端口
- `package.json`：阿里云 FC 启动脚本，使用 `npm run start`
- `.env.example`：可选环境变量示例

## 控制台推荐配置

- 运行环境：`Node.js 20` 或 `Node.js 18`
- 代码上传方式：`通过 ZIP 包上传代码`
- 启动命令：`npm run start`
- 监听端口：`9000`
- 最小实例数：`0`
- 单实例并发度：`20`
- 执行超时时间：`60`

## 环境变量

- `TRACKER_GG_API_KEY`

如果不配置 `TRACKER_GG_API_KEY`，接口会直接走 `apexranked.com` 数据源。
如果配置了 `TRACKER_GG_API_KEY`，会优先尝试 `tracker.gg`，失败后自动回退到 `apexranked.com`。

## 打包 ZIP

在当前目录执行：

```powershell
Compress-Archive -Path .\* -DestinationPath ..\tracker-proxy-aliyun-fc-upload.zip -Force
```

生成后的 ZIP 可直接上传到阿里云函数计算。
