import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// 定义插件设置接口
interface AITextProcessingSettings {
	apiKey: string;
	apiEndpoint: string;
	defaultInstructions: string;
	floatingWindowWidth: number;
	floatingWindowHeight: number;
}

// 默认设置值
const DEFAULT_SETTINGS: AITextProcessingSettings = {
	apiKey: '',
	apiEndpoint: 'https://api.openai.com/v1/completions',
	defaultInstructions: '请总结以下文本：',
	floatingWindowWidth: 400,
	floatingWindowHeight: 300
}

export default class AITextProcessingPlugin extends Plugin {
	settings: AITextProcessingSettings;

	async onload() {
		await this.loadSettings();

		// 添加处理选中文本的命令
		this.addCommand({
			id: 'process-selected-text-with-ai',
			name: 'Process selected text with AI',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection();
				if (selectedText) {
					this.processTextWithAI(selectedText, editor);
				} else {
					new Notice('No text selected');
				}
			}
		});

		// 添加设置选项卡
		this.addSettingTab(new AITextProcessingSettingTab(this.app, this));
	}

	onunload() {
		// 插件卸载时的清理工作
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async processTextWithAI(text: string, editor: Editor) {
		// 打开浮动窗口显示处理结果
		const modal = new AITextProcessingModal(this.app, text, (result: string) => {
			// 回调函数，插入处理后的文本
			editor.replaceSelection(result);
		}, this.settings);
		
		modal.open();
	}
}

// 浮动窗口模态框
class AITextProcessingModal extends Modal {
	text: string;
	onSubmit: (result: string) => void;
	settings: AITextProcessingSettings;
	result: string = '';
	
	constructor(app: App, text: string, onSubmit: (result: string) => void, settings: AITextProcessingSettings) {
		super(app);
		this.text = text;
		this.onSubmit = onSubmit;
		this.settings = settings;
	}

	onOpen() {
		const {contentEl} = this;
		
		contentEl.createEl('h2', {text: 'AI Text Processing'});
		
		// 创建输入区域显示原始文本
		contentEl.createEl('h3', {text: 'Original Text:'});
		const originalTextArea = contentEl.createEl('textarea', {
			attr: {
				rows: '5',
				readonly: 'true',
				style: 'width: 100%; resize: none;'
			}
		});
		originalTextArea.value = this.text;
		
		// 创建指令输入
		contentEl.createEl('h3', {text: 'Instructions:'});
		const instructionsInput = contentEl.createEl('input', {
			attr: {
				type: 'text',
				style: 'width: 100%;'
			}
		});
		instructionsInput.value = this.settings.defaultInstructions;
		
		// 创建处理按钮
		const processButton = contentEl.createEl('button', {
			text: 'Process with AI',
			attr: {
				style: 'margin-top: 10px; margin-bottom: 10px;'
			}
		});
		
		// 创建结果显示区域
		contentEl.createEl('h3', {text: 'Result:'});
		const resultArea = contentEl.createEl('textarea', {
			attr: {
				rows: '10',
				style: 'width: 100%; resize: vertical;'
			}
		});
		
		// 创建操作按钮
		const buttonContainer = contentEl.createEl('div', {
			attr: {
				style: 'display: flex; justify-content: space-between; margin-top: 10px;'
			}
		});
		
		const insertButton = buttonContainer.createEl('button', {text: 'Insert'});
		const cancelButton = buttonContainer.createEl('button', {text: 'Cancel'});
		
		// 绑定事件
		processButton.addEventListener('click', async () => {
			try {
				// 这里应该是实际调用AI API的代码
				// 由于这只是一个示例，我们使用模拟的结果
				processButton.disabled = true;
				processButton.textContent = 'Processing...';
				
				// 模拟API调用延迟
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				// 模拟的处理结果
				this.result = `AI处理结果: ${instructionsInput.value}\n\n${this.text}`;
				resultArea.value = this.result;
				
				processButton.disabled = false;
				processButton.textContent = 'Process with AI';
			} catch (error) {
				new Notice('Error processing text with AI');
				console.error(error);
				
				processButton.disabled = false;
				processButton.textContent = 'Process with AI';
			}
		});
		
		insertButton.addEventListener('click', () => {
			this.onSubmit(this.result || resultArea.value);
			this.close();
		});
		
		cancelButton.addEventListener('click', () => {
			this.close();
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

// 设置选项卡
class AITextProcessingSettingTab extends PluginSettingTab {
	plugin: AITextProcessingPlugin;

	constructor(app: App, plugin: AITextProcessingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'AI Text Processing Settings'});

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Enter your AI service API key')
			.addText(text => text
				.setPlaceholder('Enter API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API Endpoint')
			.setDesc('Enter the API endpoint URL')
			.addText(text => text
				.setPlaceholder('https://api.example.com/v1/completions')
				.setValue(this.plugin.settings.apiEndpoint)
				.onChange(async (value) => {
					this.plugin.settings.apiEndpoint = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Instructions')
			.setDesc('Default instructions for AI processing')
			.addText(text => text
				.setPlaceholder('Please summarize the following text:')
				.setValue(this.plugin.settings.defaultInstructions)
				.onChange(async (value) => {
					this.plugin.settings.defaultInstructions = value;
					await this.plugin.saveSettings();
				}));
	}
}
