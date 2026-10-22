# SIGNAL

交互式数字演出网页。可编辑选项和数字，调整画面参数，预览滚动动画，并直接在浏览器中导出带原版音乐的 MP4 或 PNG 视频帧序列。

## 功能

- 自定义或预设选项、同屏或单画面预览，支持导入和导出配置。
- 自定义选项自动保存在本机，刷新后恢复；可一键恢复默认内容。
- 播放控制、时间轴定位、全屏和静音切换。
- 可调节数字、间距、光晕、扫描线、曲面和动画参数。
- 浏览器端逐帧导出 H.264 / AAC MP4，支持 30 / 60 FPS、16:9（1920 × 1080）和 4:3（1440 × 1080）。
- 可指定导出起止时间，并选择是否包含经过精确裁剪和时间轴补偿的原版音轨 `dist/assets/audio.wav`。
- 导出前按当前分辨率、帧率检查编码能力；提供百分比进度、取消、错误提示、结果容器校验和资源释放。
- 导出 16:9 或 4:3 的 PNG 帧序列 ZIP，支持 1–120 FPS，单次最多 5000 帧。
- 页面使用本地 Saira 字体和 `audio.wav` 音轨。

MP4 使用与预览相同的 `SignalRenderer` 和确定性逐帧时间控制，不是实时屏幕录制。视频与音频均以所选片段的 0 秒为起点，末帧和 AAC padding 会裁到指定结束时间。

## 本地运行

安装 Node.js 后运行：

```bash
npm install
npm test
npm start
```

然后打开 <http://127.0.0.1:4173/>。`localhost` 属于浏览器认可的安全环境，可以使用 WebCodecs。

更新 Mediabunny 相关依赖后，需要重新生成随静态站点发布的浏览器 bundle：

```bash
npm run build:vendor
```

普通启动或 Pages 部署无需现场打包；生成结果已包含在 `dist/vendor/`。

## 浏览器兼容性与限制

- MP4 导出需要安全环境（HTTPS 或 `localhost`）、WebCodecs H.264 编码、Web Worker、WebAssembly 和 Web Audio。页面会在开始逐帧渲染前检查当前 1080p / FPS 配置，不支持时会明确停止，不会生成伪 MP4。
- 建议使用最新版 Chrome、Edge 或 Safari。具体 H.264 编码能力仍取决于操作系统、硬件和浏览器媒体组件；Firefox、Linux 以及部分移动设备上的支持可能不同，应以页面的运行时检查为准。
- AAC 由随站点发布的 Mediabunny AAC 浏览器扩展生成，并通过固定预卷及 MP4 edit list 处理编码延迟；音轨按源 WAV 样本裁剪，容器展示时长与所选片段一致。
- 1080p、60 FPS 或较长片段会占用较多内存。MP4 在内存中完成封装后才下载；内存较小的设备可改用 30 FPS、缩短片段、关闭音轨或选择 PNG ZIP。取消任务会停止后续帧并释放编码器和离屏画布，但浏览器清理已提交的编码工作可能需要短暂时间。

`npm test` 会检查导出时间轴、WAV 样本裁剪、MP4 容器与 H.264/AAC 轨道、帧率、展示时长和取消清理流程。Node.js 测试不会替代真实浏览器的硬件/系统编码器验证；发布前仍建议在目标 Chrome、Edge、Safari 环境中手动下载并播放以下组合：30 / 60 FPS、16:9 / 4:3、有声 / 静音、非零起点裁剪，以及导出中途取消。

## GitHub Pages

仓库已包含 Pages 自动部署工作流。将 `main` 分支推送到 GitHub 后，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。部署完成后，项目页地址为 <https://lylighte.github.io/signal-replica/>。

网页静态文件位于 `dist/`，工作流会直接发布该目录。MP4 渲染、H.264/AAC 编码和封装全部在用户浏览器内完成，不依赖后端服务器、本地 FFmpeg 或服务端转码。

## 技术

应用主体使用原生 HTML、CSS、JavaScript 和 Canvas。MP4 容器与编码管线采用 Mediabunny 1.62.0 及 `@mediabunny/aac-encoder` 1.62.0；二者固定打包在 `dist/vendor/mediabunny.js`，因此 GitHub Pages 不需要 Node.js 运行时或 CDN。

SIGNAL 项目本身继续采用 MIT License，原许可证和原作者信息保持不变。Saira 字体依 SIL Open Font License 随仓库提供。Mediabunny 与 AAC 扩展使用 Mozilla Public License 2.0，第三方 bundle 的说明和许可证分别位于 `dist/vendor/README.md` 与 `dist/vendor/MPL-2.0.txt`。

仓库代码由 GPT-6 Astra 完成。
