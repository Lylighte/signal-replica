# SIGNAL

交互式数字演出网页。可编辑选项和数字，调整画面参数，预览滚动动画，并导出 PNG 视频帧序列。

## 功能

- 自定义或预设选项、同屏或单画面预览，支持导入和导出配置。
- 播放控制、时间轴定位、全屏和静音切换。
- 可调节数字、间距、光晕、扫描线、曲面和动画参数。
- 导出 16:9 或 4:3 的 PNG 帧序列 ZIP，支持 1–120 FPS，单次最多 5000 帧。
- 页面使用本地 Saira 字体和 `audio.wav` 音轨。

## 本地运行

安装 Node.js 后，在仓库目录运行 `npm start`，再打开 <http://127.0.0.1:4173/>。

## GitHub Pages

仓库已包含 Pages 自动部署工作流。将 `main` 分支推送到 GitHub 后，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。部署完成后，项目页地址为 <https://lylighte.github.io/signal-replica/>。

网页静态文件位于 `dist/`，工作流会直接发布该目录。

## 技术

原生 HTML、CSS、JavaScript 和 Canvas；无需安装网页依赖。Saira 字体依 SIL Open Font License 随仓库提供。

仓库代码由 GPT-6 Astra 完成。
