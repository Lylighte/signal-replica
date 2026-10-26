# SIGNAL Studio

SIGNAL Studio 是基于开源项目 [SIGNAL Replica](https://github.com/Lylighte/signal-replica) 独立维护的增强 Fork。项目保留原版的 Canvas 视觉、滚轮动画、故障效果、参数编辑与播放方式，并在此基础上扩展浏览器端视频导出和 Studio 编辑能力。

所有编辑、解码、逐帧渲染、H.264/AAC 编码、MP4 封装和 GIF 编码都在用户浏览器内完成；GitHub Pages、Cloudflare Pages 等静态托管不需要后端、数据库、付费 API 或本地 FFmpeg。

| 项目 | 信息 |
| --- | --- |
| Original Project | [SIGNAL Replica](https://github.com/Lylighte/signal-replica) |
| Original Author | [Lylighte](https://github.com/Lylighte) |
| Fork Maintainer | [chujiamo](https://github.com/chujiamo) |
| Fork Repository | [github.com/chujiamo/signal-replica](https://github.com/chujiamo/signal-replica) |
| Website | [signal-replica.zengqizhi.eu.org](https://signal-replica.zengqizhi.eu.org/) |
| License | [MIT License](LICENSE)；第三方组件与素材见下方许可证说明 |

## Credits & Acknowledgements

> **Original Project & Credits**
>
> This project is based on [SIGNAL Replica](https://github.com/Lylighte/signal-replica), originally created by [Lylighte](https://github.com/Lylighte).
>
> Special thanks to Lylighte for creating and open-sourcing the original project, which provided the foundation for this enhanced version.
>
> This is an independently maintained fork and is not affiliated with or officially endorsed by the original author.

衷心感谢 Lylighte 开发并开源原版 SIGNAL Replica。本 Fork 的维护与扩展由 chujiamo 独立进行，不代表原作者发布、参与维护或为本增强版本背书。

## 功能与贡献范围

### 原版 SIGNAL Replica（Lylighte）

原版项目为本 Fork 提供了核心视觉与交互基础，包括：

- 原生 HTML、CSS、JavaScript 与 Canvas 实现的 SIGNAL 数字演出和确定性动画渲染。
- 自定义与预设选项、最多 8 个选项的数据验证，以及同屏和单画面预览。
- 内容与画面参数编辑、配置导入/导出、本地保存、播放、时间轴定位、全屏和静音控制。
- 数字滚轮、文字选择、光晕、扫描线、曲面和故障效果。
- 16:9 / 4:3 PNG 帧序列 ZIP 导出、本地 Saira 字体和随项目提供的原版音轨。
- 当前 `upstream/main` 继续新增彩色 GIF 导出、可调 RGB 色差、五阶段向上抖动和有限视口移动端布局；本增强版已将这些能力同步到 Studio 项目渲染与三格式导出链路。

### 本 Fork 新增与扩展（chujiamo 维护）

以下能力是在原版基础上由本 Fork 独立增加或扩展的功能。

#### 内容与布局

- 支持 1–16 个选项，保留前导零和 1–4 位数字；选项可新增、删除、排序并导入旧版配置。
- 支持单项聚焦、轮播、分页，以及自动、2×2、3×3、4×4 网格。
- 支持布局间距、页码和顺序调整。密集布局会自动分页或提示可读性风险；超过四项时，每个面板独立显示自己的选择动画，避免在小面板内重复挤入 16 个标签。
- 支持 16:9、4:3、1:1、9:16，以及居中裁剪、自适应缩放、智能重排。预览与导出调用同一套布局和渲染逻辑。
- 桌面端预览会在有限视口内自适应，编辑区独立滚动；移动端和矮横屏会压缩控制区，并按四种画幅正确约束预览尺寸。

#### 动画与时间轴

- 动画总时长不再固定为约 17.5 秒，可分别调整入场、选择、滚动、稳定、故障、退场阶段。
- 可视化关键帧轨道支持新增、选择、复制、删除和拖动。
- 可为数字、标签、选项位置/缩放/透明度、图层位置/缩放/旋转/透明度/文字和故障强度设置关键帧。
- 支持 Linear、Ease In、Ease Out、Ease In Out；播放头可精确定位，时间轴可缩放。
- 预览与离线导出都使用项目时间到原版 SIGNAL 时间的确定性映射，不读取实时录屏时间。

#### 音乐与 Beat Sync

- 可切换原版 `dist/assets/audio.wav`、自定义音乐或无音轨。
- 可导入浏览器能够解码的 MP3、WAV、FLAC、M4A/AAC、Ogg/Opus、WebM 等音频；实际格式支持取决于浏览器媒体组件。
- 支持 0–400% 音量、静音、源音频裁剪、项目时间轴起止、循环、淡入和淡出。
- 导出时按 PCM 采样边界裁剪和重排，非零导出起点也会重置为文件时间 0，AAC 编码延迟由 MP4 edit list 修正。
- Beat Sync 支持手动 BPM、偏移、1/2/4 细分、节拍标记和强度；可触发闪屏、数字跳动、RGB 分离和震动。
- 可对已导入的音乐执行本地 Web Audio 节拍估算；分析结果会写回可编辑的 BPM/偏移，而不是隐藏修改。

#### 外观、字体与图层

- 数字、文字、光晕、背景、扫描线和故障颜色分别可调，支持 HEX、RGB、RGBA 与 `linear-gradient(...)`。
- 支持按时间触发的 RGB 色差、条带偏移和五阶段向上抖动；它们可与 Beat Sync 的 RGB 分离和震动叠加，并同时作用于图层和最终合成画面。
- 内置原版、纯白、粉色、紫色、青色、赛博霓虹、RGB 主题；自定义主题可保存在本机并导入、导出或删除。
- 数字和文字可分别载入 TTF、OTF、WOFF、WOFF2，并调整字号、字重、字距、描边和阴影。导出会等待字体实际就绪，失败时停止而不会悄悄回退。
- 支持文字及 PNG/JPEG/WebP/SVG 图片图层，可调位置、尺寸、旋转、透明度、层级、混合模式、遮罩、发光和入退场动画；图层参与预览和最终逐帧导出。
- 用户选择的音乐、字体和图片只保留在当前浏览器内存中，不会上传。

#### 项目、模板、分享与批量

- 完整项目使用 `signal-studio` v2 JSON；旧版 v1、旧设置对象和单独选项数组会迁移，并保留当前项目中旧文件没有提供的新字段。
- 内置原版 SIGNAL、音游成绩、系统启动、身份认证、数字倒计时五种模板。
- 当前项目可保存为本机模板；模板支持应用、复制、删除、JSON 导入和导出。
- 分享链接把经过清理的项目 JSON 写入 URL Fragment，不需要服务器。生成前会报告长度；超过建议的 8000 字符时会提示改用 JSON 文件。
- 分享数据会移除二进制内容、Blob URL、资源标识和本地文件路径，但保留关键帧路径等项目结构。
- 批量队列可加入当前项目，或按每行 `标签|数字` 生成替换任务；支持进度、全部取消、失败重试、文件名模板和 ZIP 打包。
- UI 固定串行编码高负载任务，避免多个 4K 编码器同时占用内存。应用不会静默降低用户选择的规格；超过帧数、像素总量或约 1 GiB 浏览器缓冲预算的任务会在大规模分配前明确拒绝。

#### MP4、PNG ZIP 与 GIF 导出

导出窗口默认选择 MP4，同时保留 PNG 帧序列 ZIP，并提供彩色 GIF。

| 档位 | 16:9 | 4:3 | 1:1 | 9:16 |
| --- | --- | --- | --- | --- |
| 1080p | 1920×1080 | 1440×1080 | 1080×1080 | 1080×1920 |
| 2K / QHD | 2560×1440 | 1920×1440 | 1440×1440 | 1440×2560 |
| 4K UHD | 3840×2160 | 2880×2160 | 2160×2160 | 2160×3840 |

- MP4 支持 30、60、90、120、144、165 FPS，H.264 视频和可选 AAC 音频。
- 提供节省空间、均衡、高画质、最高画质预设，也可输入 1–1000 Mbps 自定义视频码率。
- 先按分辨率、帧率、码率和 H.264 Level 调用实际编码能力检查；不支持的组合会禁用开始按钮并给出明确原因。
- `SignalRenderer` 直接创建目标像素尺寸的导出 Canvas；2K/4K 不是把 1080p 结果二次放大。
- MP4 时间范围采用半开区间，帧数按所选恒定帧率生成；封装后再次检查 H.264/AAC 轨道、画幅、名义帧率和展示时长，不会把 WebM 或损坏数据伪装成 `.mp4`。
- PNG ZIP 支持相同分辨率与画幅、1–165 FPS，包含结束时刻帧，单次最多 5000 帧，并附带 `manifest.json`。
- GIF 支持四种画幅和同一套布局、关键帧、主题、字体与图层。最高 720p，提供标准、压缩、高压缩、极限四档；默认 240p / 6 FPS / 32 色，极限档默认 90p / 4 FPS / 16 色。
- GIF 使用跨帧自适应调色板，合并重复帧并只编码变化区域；GIF 不包含音轨。
- 三种导出均提供百分比进度、取消、错误状态和离屏 Canvas/编码器/对象 URL 清理。

## 使用方式

1. 默认右侧编辑栏与原版 SIGNAL Replica 一致，可直接编辑内容和画面参数；点击编辑栏底部低调的“高级功能”入口，可在独立面板中设置动画与布局、关键帧、外观与字体、音频与 Beat Sync、图层与 Logo、模板、分享和批量导出。
2. 用预览播放或拖动播放头检查任意时间。
3. 点击“导出…”，选择 MP4、PNG ZIP 或 GIF，并设置时间范围、画幅与适配方式。
4. MP4 可继续选择分辨率、帧率、画质/码率和音轨；PNG ZIP 可选分辨率与 1–165 FPS；GIF 可选尺寸与压缩档位。检查通过后点击生成，完成后浏览器直接下载文件。

## 本地运行与静态部署

需要 Node.js 20 或更新版本：

```bash
npm install
npm test
npm start
```

然后打开 <http://127.0.0.1:4173/>。`localhost` 是浏览器认可的安全环境，可以使用 WebCodecs。

更新 Mediabunny 版本后才需要重新生成随站点发布的浏览器 bundle：

```bash
npm run build:vendor
```

平时启动和部署不需要现场打包；`dist/vendor/` 已包含运行时文件。

- GitHub Pages：仓库的 Actions 工作流直接发布 `dist/`。
- Cloudflare Pages：将静态输出目录设为 `dist`，无需构建命令。
- Astro：把 `dist/` 的内容完整放入 `public/signal-replica/`，通过 `/signal-replica/` 访问；模块、字体、音频和 vendor bundle 都使用相对路径。

## 浏览器兼容性与限制

- MP4 导出要求 HTTPS 或 `localhost`，以及 WebCodecs H.264、Web Worker、WebAssembly、Web Audio 和 Canvas。建议使用当前版本 Chrome、Edge 或 Safari；Firefox、Linux、移动设备及企业受管环境的编码能力可能不同，页面运行时检查是最终依据。
- PNG ZIP 与 GIF 不依赖 WebCodecs，可在缺少 H.264 编码能力的浏览器中使用；实际 Canvas、字体和图片解码能力仍以当前浏览器为准。
- 当前视频容器只实现 H.264/AAC MP4；没有用其他编码器静默替代。AAC 目前支持单声道或双声道输入。
- 浏览器是否能解码 MP3、FLAC、M4A 等由系统和浏览器决定。扩展名被接受不代表该设备一定有对应解码器，失败时会显示具体错误。
- 项目 JSON、模板和分享链接只保存本地资源的安全元数据，不嵌入音频、字体或图片内容。重新载入项目或在另一台设备打开时，需要重新选择这些本地文件；缺少资源时导出会停止并提示。
- 4K、竖屏 4K、90–165 FPS、长时间动画、大量图层或 16 项同屏会显著增加编码时间、文件大小、内存和显存占用。应用会预警并执行硬性资源预算，不会静默降低分辨率、帧率或码率。
- MP4 在内存中完成封装后下载；单次 MP4/ZIP 缓冲预算限制为约 1 GiB，MP4 另限制最多 120000 帧，PNG/GIF 另限制像素帧总量。PNG 与批量打包底层使用 ZIP32，也不支持超过 4 GiB。
- 单个自定义音频、字体、图片分别限制为 128 MiB、64 MiB、64 MiB；解码后音频限制为 512 MiB，图片限制为单边 16384 像素且总像素不超过约 64 MP。
- 取消会立即停止提交新帧并释放应用持有的资源，但浏览器清理已经提交到硬件编码器的工作可能需要短暂时间。
- 自动节拍检测是本地启发式估算，复杂节奏、变速或弱起拍音乐应手动核对 BPM 和偏移。

## 测试

```bash
npm test
```

自动化测试覆盖项目 v1→v2 迁移与 JSON 安全、图层名称 XSS、16 项布局、四画幅移动端容器、关键帧插值、图层、主题、字体、模板、Beat Sync、音乐裁剪/循环/淡入淡出、批量音频资源绑定、批量取消与 ZIP、六档 MP4 帧率、十二种输出尺寸、H.264 Level、AAC 轨道、容器时长、资源预算与清理，以及 GIF LZW、调色板、重复帧、变化区域裁切、RGB 色差和抖动包络。

Node.js 测试不能替代真实浏览器的硬件/系统编码器验证。发布前仍应在目标 Chrome、Edge、Safari 上检查设备能承受的最高档规格，并覆盖自定义音乐、非零起点裁剪、图片/字体图层、批量任务和中途取消。

## 技术实现

应用主体使用原生 HTML、CSS、JavaScript 和 Canvas。预览与三种导出共用 `SignalRenderer`、项目时间映射、布局、关键帧、Beat Sync、色差/抖动和图层模块。MP4 管线采用 Mediabunny 1.62.0 与 `@mediabunny/aac-encoder` 1.62.0；GIF 由本地调色板、LZW 和帧差编码模块生成。

## License / 开源许可证

- 原始 [SIGNAL Replica](https://github.com/Lylighte/signal-replica) 项目采用 [MIT License](LICENSE)。本 Fork 基于该 MIT 许可代码进行修改和再发布，项目代码继续遵循仓库中的 MIT License。
- 原作者版权声明 **`Copyright (c) 2026 Lylighte`** 已完整保留在根目录 [`LICENSE`](LICENSE) 中；本 Fork 不删除、覆盖或替代该声明。
- 本 Fork 是由 [chujiamo](https://github.com/chujiamo) 独立维护的衍生版本，与 Lylighte 无隶属关系，也未获得原作者的官方认可或背书。
- Saira 字体版权归 The Saira Project Authors 所有，按 **SIL Open Font License 1.1** 提供，完整条款见 [`dist/assets/OFL.txt`](dist/assets/OFL.txt)。
- Mediabunny 1.62.0 与 `@mediabunny/aac-encoder` 1.62.0 按 **Mozilla Public License 2.0** 分发；来源与构建说明见 [`dist/vendor/README.md`](dist/vendor/README.md)，许可证全文见 [`dist/vendor/MPL-2.0.txt`](dist/vendor/MPL-2.0.txt)。AAC 扩展中包含其上游说明所述的 FFmpeg AAC 编码器 WebAssembly 构建。
- MIT License 不应被理解为自动覆盖仓库中的所有第三方字体、音频、图片或其他媒体素材。特别是 `dist/assets/audio.wav`，本仓库未提供单独的素材许可证说明；如需复制、再分发或用于公开/商业作品，请自行确认其来源、授权范围和适用权利。
- 用户自行导入的音乐、字体和图片不会上传到服务器，也不因被本项目加载而改变其原有版权或许可条件；使用者应确保自己拥有相应使用权。

有关代码使用、复制、修改与分发的完整条件，请以仓库根目录的 [`LICENSE`](LICENSE) 以及各第三方组件随附的许可证文件为准。
