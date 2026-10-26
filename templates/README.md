# 社区模板

这里收集使用 SIGNAL 创作的配置。页面中的“贡献模板”入口指向本说明。

## 如何投稿

1. 在页面完成配置，点击“导出配置”，保存 JSON 文件。
2. [提交模板投稿 Issue](https://github.com/Lylighte/signal-replica/issues/new?template=template-submission.md)，填写模板名称、简介、作者署名和主页链接，并上传 JSON。可以附上截图、GIF 或作品 BV 链接。
3. 维护者确认后，将配置收录到本目录，并保留作者署名。

也可以直接提交 Pull Request。每个模板使用一个目录：

```text
templates/
  your-template-name/
    config.json
    README.md
    preview.png      # 可选，也可以使用 preview.gif
```

目录名使用小写英文、数字和连字符。`config.json` 使用页面直接导出的配置，无需手工修改；`README.md` 写明模板名称、效果简介、作者署名、主页及所需外部素材。

## 使用收录的配置

下载对应的 `config.json`，在页面点击“导入配置”。本目录收录不代表自动加入页面内置模板库。

配置不包含本机导入的音频、字体和图片文件；如使用这些素材，请在说明中提供来源及重新载入方法。只提交可公开分享的内容，外部素材按其各自授权使用。

更多提交说明见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
