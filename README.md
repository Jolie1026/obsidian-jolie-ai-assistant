# Jolie AI Assistant for Obsidian

> **Note**: This plugin is currently not accepted by the Obsidian community. This means it won't appear in Obsidian's official plugin repository and requires manual installation.

*[English](README.md) | [中文](README.zh-CN.md) | [한국어](README.ko.md)*

## Features

- Invoke AI processing on selected text via command palette or hotkeys
- Floating window interface, draggable and resizable
- Support for multiple AI text processing functions (summarization, translation, rewriting, etc.)
- Customizable AI processing instructions

## Installation

Since this plugin is not yet accepted by the Obsidian community, you need to install it manually:

1. Download the latest release from this repository
2. Extract and copy the folder to your Obsidian vault's plugin folder: `<your-vault>/.obsidian/plugins/`
3. Restart Obsidian
4. Enable the plugin in Obsidian settings (you may need to turn off "Safe mode" first)

## Usage

1. Select the text you want to process
2. Use the command palette (Ctrl/Cmd+P) and search for "Jolie AI"
3. Choose the desired AI processing function
4. View the results in the floating window
5. Click "Insert" to place the processed text at the current position

## Configuration

In the plugin settings, you can:

- Configure API keys and endpoints
- Customize AI processing instructions
- Set default size and position for the floating window
- Customize hotkeys

## Development

```bash
# Clone repository
git clone https://github.com/cnbpm/obsidian-jolie-ai-assistant.git

# Navigate to directory
cd obsidian-jolie-ai-assistant

# Install dependencies
npm install

# Development build
npm run dev
```

## License

[MIT](LICENSE)