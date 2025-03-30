# Jolie AI 助手 (Obsidian插件)

> **注意**：此插件目前尚未被Obsidian社区采纳。这意味着它不会出现在Obsidian的官方插件库中，需要手动安装。

*[English](README.md) | [中文](README.zh-CN.md) | [한국어](README.ko.md)*

## 功能

- 选择文本后通过命令面板或快捷键调用AI处理
- 浮动窗口界面，可拖动和调整大小
- 支持多种AI文本处理功能（摘要、翻译、改写等）
- 可自定义AI处理指令

## 安装

由于此插件尚未被Obsidian社区采纳，您需要手动安装：

1. 下载此仓库中的最新发布版本
2. 将解压后的文件夹复制到您的Obsidian库的插件文件夹中：`<your-vault>/.obsidian/plugins/`
3. 重新启动Obsidian
4. 在Obsidian设置中启用插件（可能需要先关闭"安全模式"）

## 使用方法

1. 选择要处理的文本
2. 使用命令面板（Ctrl/Cmd+P）并搜索"Jolie AI"
3. 选择所需的AI处理功能
4. 在浮动窗口中查看结果
5. 点击"插入"将处理后的文本插入到当前位置

## 配置

在插件设置中，您可以：

- 配置API密钥和端点
- 自定义AI处理指令
- 设置浮动窗口的默认大小和位置
- 自定义快捷键

## 开发

```bash
# 克隆仓库
git clone https://github.com/cnbpm/obsidian-jolie-ai-assistant.git

# 进入目录
cd obsidian-jolie-ai-assistant

# 安装依赖
npm install

# 开发构建
npm run dev
```

## 许可证

[MIT](LICENSE)