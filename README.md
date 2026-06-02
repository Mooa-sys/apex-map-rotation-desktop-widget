# Apex map

一个用于 Windows 桌面的 Apex Legends 排位地图轮换小组件。

应用使用本地地图轮换配置计算当前排位地图、下一张地图和倒计时，不依赖外部接口。适合放在桌面上快速查看当前排位地图。

## 功能

- 显示当前 Apex 排位地图和本轮结束时间。
- 显示下一张即将轮换的排位地图。
- 每分钟自动刷新地图轮换数据。
- 支持简洁模式，方便作为桌面小窗常驻。
- 支持中文 / English 界面切换，并会记住上次选择。
- 支持从应用内添加桌面快捷方式，便携版无需安装也可以固定入口。
- 使用本地配置维护地图池和轮换顺序。

## 下载与运行

1. 在 GitHub Release 下载 `Apex map.exe`。
2. 双击运行即可，不需要安装。
3. 当前便携版未做代码签名，首次运行时 Windows 可能显示 SmartScreen 或未知发布者提示。

## 开发

先安装依赖：

```powershell
npm install
```

启动开发环境：

```powershell
npm run dev
```

## 检查与构建

执行类型检查并构建：

```powershell
npm run build
```

从 SVG 生成 Windows 图标：

```powershell
npm run generate:icon
```

打包 Windows 目录版本：

```powershell
npm run package:win
```

打包 Windows 便携版：

```powershell
npm run package:portable
```

正式 Windows 打包使用 `build/icon.ico`。可编辑源文件优先使用 `build/icon.svg`；如果不存在，则使用 `build/icon_256.svg` 生成 ICO。替换 SVG 后运行 `npm run generate:icon` 即可重新生成 ICO。

## 地图轮换配置

地图轮换数据维护在 `src/shared/mapConfig.ts`。

当排位地图池发生变化时，通常只需要更新以下配置：

- `allMaps`：所有支持的地图、中文名和对应背景样式。
- `rankedRotationConfig.rankedMapNames`：当前排位轮换中的三张地图，按轮换顺序填写。
- `rankedRotationConfig.anchor`：已知轮换起点时间，对应 `rankedMapNames` 中第一张地图的开始时间。
- `rankedRotationConfig.slotMinutes`：每张地图持续时间，当前默认值为 270 分钟。
- `rankedRotationConfig.upcomingCount`：界面中预计算的后续地图数量。

当前配置以 `2026-05-25 16:00` 作为锚点，轮换顺序为：

```text
Broken Moon -> Storm Point -> Olympus
```

## 项目结构

```text
src/main       Electron 主进程
src/preload    预加载脚本，提供渲染进程访问接口
src/renderer   React 渲染层和样式
src/shared     地图轮换配置与计算逻辑
test           Vitest 测试
```

## 技术栈

- Electron
- electron-vite
- React
- TypeScript
- Vitest

## License

MIT
