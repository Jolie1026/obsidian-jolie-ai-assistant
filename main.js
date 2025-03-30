'use strict';

var obsidian = require('obsidian');

// 默认设置
const DEFAULT_SETTINGS = {
    windowPosition: { x: 100, y: 100 },
    models: [],
    lastModelName: '' // 添加记忆最后选择模型的设置
};

// 全局变量
let floatingWindowInstance = null;
let globalInputContent = '';
let globalPromptContent = '';
let globalOutputContent = '';
// 删除全局变量 lastSelectedModelName，改用设置中的 lastModelName

class FloatingWindowPlugin extends obsidian.Plugin {
    async onload() {
        await this.loadSettings();

        // 添加命令
        this.addCommand({
            id: 'open-floating-window',
            name: '打开浮动窗口',
            callback: () => {
                this.openFloatingWindow();
            }
        });

        // 添加设置选项卡
        this.addSettingTab(new AISettingTab(this.app, this));

        // 注册上下文菜单事件
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                const selection = editor.getSelection();
                if (selection) {
                    menu.addItem((item) => {
                        item.setTitle('AI 助手')
                            .setIcon('bot')
                            .onClick(() => {
                                this.openFloatingWindow(selection, view);
                            });
                    });
                }
            })
        );

        // 注册全局点击事件，实现专注模式（点击外部不关闭窗口）
        this.registerDomEvent(document, 'click', (evt) => {
            // 处理点击事件，确保窗口不会消失
            if (floatingWindowInstance) {
                // 检查点击是否在窗口内部或在具有ai-前缀的元素上
                const isInsideWindow = floatingWindowInstance.containerEl.contains(evt.target);
                const isAIElement = evt.target.className && typeof evt.target.className === 'string' && evt.target.className.includes('ai-');
                
                // 检查是否是输入相关元素
                const isInputElement = evt.target.tagName === 'INPUT' ||
                                      evt.target.tagName === 'TEXTAREA' ||
                                      evt.target.tagName === 'SELECT' ||
                                      evt.target.tagName === 'OPTION' ||
                                      (evt.target.parentElement &&
                                       (evt.target.parentElement.tagName === 'INPUT' ||
                                        evt.target.parentElement.tagName === 'TEXTAREA' ||
                                        evt.target.parentElement.tagName === 'SELECT'));
                
                // 检查是否正在编辑文本
                const isEditing = document.activeElement &&
                                 (document.activeElement.tagName === 'INPUT' ||
                                  document.activeElement.tagName === 'TEXTAREA');
                
                // 如果点击在窗口外部且不是AI元素且不是输入元素且不在编辑状态，才阻止事件冒泡
                if (!isInsideWindow && !isAIElement && !isInputElement && !isEditing) {
                    // 阻止事件冒泡，防止干扰编辑功能
                    evt.stopPropagation();
                }
            }
        });

        console.log('加载浮动窗口插件');
    }

    onunload() {
        // 关闭浮动窗口
        if (floatingWindowInstance) {
            floatingWindowInstance.close();
        }
        console.log('卸载浮动窗口插件');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // 打开浮动窗口
    openFloatingWindow(selectedText = '', view = null) {
        if (!floatingWindowInstance) {
            // 创建新实例
            floatingWindowInstance = new FloatingWindow(this.app, this.settings, this, selectedText, view);
            floatingWindowInstance.open();
        } else {
            // 确保窗口可见
            floatingWindowInstance.setVisible(true);
            // 如果有新的选中文本，更新输入区域
            if (selectedText) {
                floatingWindowInstance.updateInputContent(selectedText);
            }
        }
    }
    
    // 检查模型配置是否有效
    isModelValid(model) {
        return model && 
               model.name && 
               model.endpoint && 
               (model.isOllama || model.apiKey); // 如果是Ollama模型，不需要API密钥
    }
    
    // 获取有效的模型列表
    getValidModels() {
        return this.settings.models.filter(model => this.isModelValid(model));
    }
    
    // AI模型调用方法
    async callAIModel(model, prompt, maxTokens = null) {
        if (!model || !model.endpoint) {
            throw new Error('模型配置不完整');
        }
        
        if (!model.isOllama && !model.apiKey) {
            throw new Error('非Ollama模型需要API密钥');
        }
        
        try {
            // 准备参数
            let params = {};
            let headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            
            // 根据模型类型设置不同的参数和请求头
            if (model.isOllama) {
                // Ollama模型参数 - 使用正确的参数结构
                console.log(`正在调用Ollama模型: ${model.modelName || 'llama2'}`);
                
                // Ollama API格式已修正
                params = {
                    model: model.modelName || 'llama2',
                    prompt: prompt,
                    stream: false,
                    options: {}
                };
                
                // 添加Ollama选项参数（如果有）
                if (model.temperature !== undefined) {
                    params.options.temperature = model.temperature;
                }
                
                if (maxTokens || model.maxTokens) {
                    params.options.num_predict = maxTokens || model.maxTokens;
                }
                
                console.log('Ollama请求参数:', JSON.stringify(params));
            } else {
                // 非Ollama模型(如OpenAI)参数
                console.log(`正在调用API模型: ${model.modelName || 'gpt-3.5-turbo'}`);
                
                params = {
                    messages: [{ role: 'user', content: prompt }],
                    model: model.modelName || 'gpt-3.5-turbo',
                    temperature: model.temperature !== undefined ? model.temperature : 0.7,
                    max_tokens: maxTokens || model.maxTokens || 2000
                };
                
                // 添加API密钥到请求头
                headers['Authorization'] = `Bearer ${model.apiKey}`;
                
                console.log('API请求参数:', JSON.stringify({
                    endpoint: model.endpoint,
                    model: params.model,
                    max_tokens: params.max_tokens,
                    temperature: params.temperature
                }));
            }
            
            // 增加超时设置时间，特别是对于本地模型
            const timeoutDuration = model.isOllama ? 120000 : 60000; // Ollama 2分钟超时，API 1分钟超时
            console.log(`设置API请求超时: ${timeoutDuration/1000}秒`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log('API请求已超时，正在中止请求');
                controller.abort();
            }, timeoutDuration);
            
            try {
                console.log(`正在发送请求到: ${model.endpoint}`);
                // 发送API请求
                const response = await fetch(model.endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(params),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                console.log(`已收到响应: HTTP ${response.status}`);
                
                // 检查响应类型
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    // 如果不是JSON响应，尝试获取文本内容以提供更好的错误信息
                    const textContent = await response.text();
                    console.error('收到非JSON响应:', textContent.substring(0, 200) + '...');
                    throw new Error(`API返回了非JSON响应 (${response.status}): 可能是端点URL错误或认证问题`);
                }
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => null);
                    throw new Error(`API错误 (${response.status}): ${errorData?.error?.message || response.statusText}`);
                }
                
                const data = await response.json();
                console.log('收到API响应数据', model.isOllama ? '(Ollama格式)' : '');
                
                // 根据不同API响应格式提取内容
                let content = '';
                
                if (model.isOllama) {
                    // Ollama格式
                    content = data.response || '';
                    console.log('已从Ollama响应中提取内容');
                    
                    // 如果响应为空，给出更具体的错误
                    if (!content && data.error) {
                        throw new Error(`Ollama错误: ${data.error}`);
                    }
                } else {
                    // OpenAI等格式处理
                    if (data.choices && data.choices[0]) {
                        content = data.choices[0].message?.content || data.choices[0].text || '';
                    }
                    // Anthropic Claude格式
                    else if (data.content) {
                        content = data.content;
                    }
                    // 通用备选
                    else if (data.response) {
                        content = data.response;
                    }
                    // 无法识别的格式
                    else {
                        console.warn('无法识别的API响应格式:', data);
                        throw new Error('无法识别的API响应格式');
                    }
                }
                
                return content;
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error) {
            // 改进错误处理和日志
            if (error.name === 'AbortError') {
                console.error('API请求超时', error);
                if (model.isOllama) {
                    throw new Error('Ollama本地模型请求超时，请检查：\n1. Ollama服务是否正在运行\n2. 模型名称是否正确\n3. 是否已下载所选模型');
                } else {
                    throw new Error('API请求超时，请检查网络连接或稍后重试');
                }
            } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                console.error('网络请求失败:', error);
                if (model.isOllama) {
                    throw new Error('无法连接到Ollama服务，请确认：\n1. Ollama服务已启动 (http://localhost:11434)\n2. 端口设置正确');
                } else {
                    throw new Error('网络请求失败，请检查网络连接或API端点URL是否正确');
                }
            } else {
                console.error('API调用失败:', error);
                throw error;
            }
        }
    }
}

// 浮动窗口实现
class FloatingWindow {
    constructor(app, settings, plugin, selectedText = '', view = null) {
        this.app = app;
        this.settings = settings;
        this.plugin = plugin;
        this.containerEl = null;
        this.selectedText = selectedText;
        this.view = view;
        this.file = view ? view.file : null;
        this.elements = {};
    }

    open() {
        // 创建浮动窗口容器
        this.containerEl = document.createElement('div');
        this.containerEl.className = 'floating-window-container ai-floating-window';
        document.body.appendChild(this.containerEl);

        // 设置容器样式和位置
        this.containerEl.style.position = 'fixed';
        this.containerEl.style.width = '600px';
        this.containerEl.style.backgroundColor = 'var(--background-primary)';
        this.containerEl.style.border = '1px solid var(--background-modifier-border)';
        this.containerEl.style.borderRadius = '5px';
        this.containerEl.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.1)';
        this.containerEl.style.zIndex = '1000';
        this.containerEl.style.left = `${this.settings.windowPosition.x}px`;
        this.containerEl.style.top = `${this.settings.windowPosition.y}px`;
        this.containerEl.style.display = 'flex';
        this.containerEl.style.flexDirection = 'column';
        this.containerEl.style.overflow = 'hidden';

        // 创建标题栏
        const titleBar = document.createElement('div');
        titleBar.className = 'floating-window-title-bar ai-window-header';
        titleBar.style.padding = '10px';
        titleBar.style.backgroundColor = 'var(--background-secondary)';
        titleBar.style.borderBottom = '1px solid var(--background-modifier-border)';
        titleBar.style.display = 'flex';
        titleBar.style.justifyContent = 'space-between';
        titleBar.style.alignItems = 'center';
        titleBar.style.cursor = 'move';
        this.containerEl.appendChild(titleBar);

        // 添加标题
        const title = document.createElement('div');
        title.className = 'ai-window-title';
        title.textContent = 'AI 助手';
        title.style.fontWeight = 'bold';
        titleBar.appendChild(title);

        // 添加关闭按钮
        const closeButton = document.createElement('div');
        closeButton.className = 'ai-window-close-btn';
        closeButton.textContent = '×';
        closeButton.style.cursor = 'pointer';
        closeButton.style.fontSize = '20px';
        closeButton.style.width = '24px';
        closeButton.style.height = '24px';
        closeButton.style.display = 'flex';
        closeButton.style.justifyContent = 'center';
        closeButton.style.alignItems = 'center';
        titleBar.appendChild(closeButton);

        // 获取当前文件信息
        const fileName = this.file ? this.file.basename : '无标题';
        const filePath = this.file ? this.file.parent.path : '/';

        // 生成默认标题
        const defaultTitle = this.generateDefaultTitle(this.selectedText);

        // 创建窗口内容区域
        const contentDiv = document.createElement('div');
        contentDiv.className = 'ai-window-content';
        contentDiv.style.padding = '10px';
        contentDiv.style.overflowY = 'auto';
        contentDiv.style.display = 'flex';
        contentDiv.style.flexDirection = 'column';
        contentDiv.style.gap = '6px';
        this.containerEl.appendChild(contentDiv);

        // 获取有效的模型列表
        const validModels = this.plugin.getValidModels();
        
        // 生成模型选择HTML
        let modelSectionHtml = '';
        if (validModels.length > 0) {
            modelSectionHtml = `
                <div class="ai-section">
                    <label>模型:</label>
                    <div class="ai-model-radio-group">
                        ${validModels.map((model, index) => {
                            // 确定是否应该被选中：优先使用上次选择的模型，如果没有则选择第一个
                            const isChecked = (this.plugin.settings.lastModelName && model.name === this.plugin.settings.lastModelName) || 
                                             (!this.plugin.settings.lastModelName && index === 0);
                            return `<label class="ai-model-radio-label ${isChecked ? 'selected' : ''}">
                                <input type="radio" name="ai-model" value="${model.name}" class="ai-model-radio" ${isChecked ? 'checked' : ''}>
                                <span class="ai-model-radio-text">${model.name}</span>
                            </label>`;
                        }).join('')}
                    </div>
                </div>
            `;
            
            // 如果没有上次选择的模型，记住第一个模型作为默认选择
            if (!this.plugin.settings.lastModelName && validModels.length > 0) {
                this.plugin.settings.lastModelName = validModels[0].name;
                this.plugin.saveSettings(); // 保存设置
                console.log('初始化默认模型:', this.plugin.settings.lastModelName);
            }
        } else {
            modelSectionHtml = `
                <div class="ai-section ai-no-models-warning">
                    <p>未找到有效的AI模型配置。请先在设置中添加并配置模型。</p>
                    <button class="ai-open-settings-btn">打开设置</button>
                </div>
            `;
        }

        // 窗口内容HTML
        contentDiv.innerHTML = `
            ${modelSectionHtml}
            <div class="ai-section">
                <label>输出标题:</label>
                <input type="text" class="ai-title-input" value="${defaultTitle}" placeholder="输入输出文件的标题" style="pointer-events: auto; opacity: 1;">
                <button class="ai-generate-title-btn" ${validModels.length === 0 ? 'disabled' : ''}>生成标题</button>
            </div>
            <div class="ai-section">
                <label>输入内容:</label>
                <textarea class="ai-input-content markdown-editor" placeholder="选中的文本将显示在这里。您可以编辑或添加更多内容，支持Markdown格式。" spellcheck="false">${globalInputContent || this.selectedText}</textarea>
                <button class="ai-append-btn">从文档追加</button>
            </div>
            <div class="ai-section">
                <label>提示词:</label>
                <textarea class="ai-prompt-input markdown-editor" placeholder="输入您对AI的指令，支持Markdown格式" spellcheck="false">${globalPromptContent || this.getDefaultPrompt()}</textarea>
            </div>
            <div class="ai-actions">
                <button class="ai-generate-btn" ${validModels.length === 0 ? 'disabled' : ''}>生成结果</button>
            </div>
            <div class="ai-section">
                <label>输出:</label>
                <textarea class="ai-output-content markdown-editor" placeholder="AI生成的内容将显示在这里，支持Markdown格式" spellcheck="false">${globalOutputContent || ""}</textarea>
            </div>
            <div class="ai-footer-actions">
                <button class="ai-save-btn">保存</button>
                <button class="ai-cancel-btn">取消</button>
            </div>
        `;

        // 保存元素引用
        this.elements = {
            titleInput: contentDiv.querySelector('.ai-title-input'),
            inputContent: contentDiv.querySelector('.ai-input-content'),
            promptInput: contentDiv.querySelector('.ai-prompt-input'),
            outputContent: contentDiv.querySelector('.ai-output-content'),
            generateTitleBtn: contentDiv.querySelector('.ai-generate-title-btn'),
            appendBtn: contentDiv.querySelector('.ai-append-btn'),
            generateBtn: contentDiv.querySelector('.ai-generate-btn'),
            saveBtn: contentDiv.querySelector('.ai-save-btn'),
            cancelBtn: contentDiv.querySelector('.ai-cancel-btn'),
            closeBtn: closeButton
        };

        // 添加事件监听器
        this.setupEventListeners();

        // 添加拖动功能
        this.setupDragBehavior(titleBar);

        // 添加CSS样式
        this.addFloatingWindowStyles();
    }

    // 设置拖动行为
    setupDragBehavior(titleBar) {
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let windowStartX = 0;
        let windowStartY = 0;

        const handleMouseDown = (e) => {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = this.containerEl.getBoundingClientRect();
            windowStartX = rect.left;
            windowStartY = rect.top;

            // 阻止默认行为
            e.preventDefault();
        };

        const handleMouseMove = (e) => {
            if (!isDragging) return;

            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;

            const newX = windowStartX + dx;
            const newY = windowStartY + dy;

            this.containerEl.style.left = `${newX}px`;
            this.containerEl.style.top = `${newY}px`;

            // 更新设置中的位置
            this.settings.windowPosition = { x: newX, y: newY };
        };

        const handleMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                // 保存位置设置
                this.plugin.saveSettings();
            }
        };

        titleBar.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    // 设置窗口可见性
    setVisible(visible) {
        if (this.containerEl) {
            this.containerEl.style.display = visible ? 'block' : 'none';
        }
    }

    // 更新输入内容
    updateInputContent(text) {
        if (this.elements.inputContent) {
            this.elements.inputContent.value = text;
            globalInputContent = text;
        }
    }

    // 设置事件监听器
    setupEventListeners() {
        const { elements } = this;
        
        // 关闭按钮
        elements.closeBtn.addEventListener('click', () => {
            this.close();
        });

        // 取消按钮
        elements.cancelBtn.addEventListener('click', () => {
            this.close();
        });

        // 生成标题按钮
        elements.generateTitleBtn.addEventListener('click', () => {
            this.generateTitle();
        });

        // 追加按钮
        elements.appendBtn.addEventListener('click', () => {
            this.appendFromDocument();
        });

        // 生成结果按钮
        elements.generateBtn.addEventListener('click', () => {
            this.generateResult();
        });

        // 保存按钮
        elements.saveBtn.addEventListener('click', () => {
            this.saveResult();
        });

        // 实时保存输入内容到全局变量
        elements.inputContent.addEventListener('input', (e) => {
            globalInputContent = e.target.value;
            console.log('输入内容已更新:', globalInputContent.substring(0, 20) + '...');
        });
        
        // 实时保存提示词到全局变量
        elements.promptInput.addEventListener('input', (e) => {
            globalPromptContent = e.target.value;
            console.log('提示词已更新:', globalPromptContent.substring(0, 20) + '...');
        });
        
        // 实时保存输出内容到全局变量
        elements.outputContent.addEventListener('input', (e) => {
            globalOutputContent = e.target.value;
            console.log('输出内容已更新:', globalOutputContent.substring(0, 20) + '...');
        });
        
        // 确保标题输入框可编辑
        elements.titleInput.addEventListener('focus', () => {
            elements.titleInput.style.pointerEvents = 'auto';
            elements.titleInput.style.opacity = '1';
            elements.titleInput.style.cursor = 'text';
        });
        
        // 添加失焦事件，确保失去焦点后鼠标仍可正常操作
        elements.titleInput.addEventListener('blur', () => {
            // 保持pointer-events为auto，确保鼠标操作正常
            elements.titleInput.style.pointerEvents = 'auto';
        });
        
        elements.titleInput.addEventListener('click', (e) => {
            // 移除stopPropagation，允许事件正常传播
            elements.titleInput.focus();
        });
        
        // 为单选按钮组添加事件监听
        const modelRadios = this.containerEl.querySelectorAll('input[name="ai-model"]');
        modelRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const modelName = e.target.value;
                console.log('选择的模型已更改为:', modelName);
                
                // 保存当前选择的模型名称到设置并持久化
                this.plugin.settings.lastModelName = modelName;
                this.plugin.saveSettings(); // 保存到磁盘
                
                // 更新选中状态的视觉效果
                const labels = this.containerEl.querySelectorAll('.ai-model-radio-label');
                labels.forEach(label => {
                    if (label.contains(e.target)) {
                        label.classList.add('selected');
                    } else {
                        label.classList.remove('selected');
                    }
                });
            });
        });
        
        // 添加打开设置按钮事件监听（如果存在）
        const openSettingsBtn = this.containerEl.querySelector('.ai-open-settings-btn');
        if (openSettingsBtn) {
            openSettingsBtn.addEventListener('click', () => {
                // 关闭当前窗口
                this.close();
                // 打开设置
                this.app.setting.open();
                // 打开插件设置标签
                this.app.setting.openTabById('aa');
            });
        }
        
        // 确保文本区域可编辑
        [elements.inputContent, elements.promptInput, elements.outputContent].forEach(textarea => {
            // 移除任何可能阻止编辑的属性
            textarea.removeAttribute('readonly');
            textarea.removeAttribute('disabled');
            
            // 添加焦点事件，确保可以接收输入
            textarea.addEventListener('focus', () => {
                textarea.style.pointerEvents = 'auto';
                textarea.style.opacity = '1';
                textarea.style.cursor = 'text';
            });
            
            // 添加点击事件，确保可以获取焦点，但不阻止事件传播
            textarea.addEventListener('click', (e) => {
                // 移除stopPropagation，允许事件正常传播
                textarea.focus();
            });
            
            // 添加失焦事件，确保失去焦点后鼠标仍可正常操作
            textarea.addEventListener('blur', () => {
                // 保持pointer-events为auto，确保鼠标操作正常
                textarea.style.pointerEvents = 'auto';
            });
        });
    }

    // 关闭窗口
    close() {
        try {
            // 在移除窗口前只保存提示词到全局变量，清除其他内容
            if (this.elements) {
                const { promptInput } = this.elements;
                if (promptInput) globalPromptContent = promptInput.value;
                
                // 清除其他内容
                globalInputContent = '';
                globalOutputContent = '';
                
                console.log('窗口关闭前已保存提示词到全局变量，并清除其他内容');
            }
            
            // 移除DOM元素
            if (this.containerEl && this.containerEl.parentNode) {
                this.containerEl.parentNode.removeChild(this.containerEl);
            }
            
            // 移除样式
            const styleEl = document.getElementById('ai-floating-window-styles');
            if (styleEl) {
                document.head.removeChild(styleEl);
            }
            
            // 重置实例引用
            floatingWindowInstance = null;
            
            console.log('浮动窗口已成功关闭');
        } catch (error) {
            console.error('关闭浮动窗口时出错:', error);
        }
    }

    // 添加样式
    addFloatingWindowStyles() {
        const styleEl = document.createElement('style');
        styleEl.id = 'ai-floating-window-styles';
        styleEl.textContent = `
            .ai-floating-window {
                position: fixed;
                width: 600px;
                height: auto;
                background-color: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 5px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                z-index: 1000;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .ai-window-header {
                padding: 10px;
                background-color: var(--background-secondary);
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                border-bottom: 1px solid var(--background-modifier-border);
            }
            .ai-window-title {
                font-weight: bold;
                flex: 1;
            }
            .ai-window-close-btn {
                cursor: pointer;
                font-size: 20px;
                width: 24px;
                height: 24px;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .ai-window-content {
                padding: 10px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .ai-section {
                display: flex;
                flex-direction: column;
                gap: 3px;
            }
            .ai-section label {
                font-weight: bold;
                margin-bottom: 2px;
                font-size: 0.95em;
            }
            
            /* 模型单选按钮组样式 */
            .ai-model-radio-group {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-bottom: 4px;
            }
            
            .ai-model-radio-label {
                display: inline-flex;
                align-items: center;
                background-color: var(--background-secondary);
                border-radius: 4px;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 0.9em;
                border: 1px solid var(--background-modifier-border);
                transition: all 0.2s ease;
            }
            
            .ai-model-radio-label.selected, 
            .ai-model-radio-label:has(input:checked) {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
                border-color: var(--interactive-accent);
            }
            
            .ai-model-radio-label:hover {
                background-color: var(--background-modifier-hover);
            }
            
            .ai-model-radio {
                position: absolute;
                opacity: 0;
                width: 0;
                height: 0;
            }
            
            .ai-model-radio:checked + .ai-model-radio-text {
                font-weight: bold;
            }
            
            /* 无模型警告样式 */
            .ai-no-models-warning {
                background-color: var(--background-modifier-error-rgb);
                opacity: 0.7;
                padding: 10px;
                border-radius: 5px;
                text-align: center;
                margin-bottom: 10px;
            }
            
            .ai-no-models-warning p {
                margin-bottom: 10px;
                font-weight: bold;
            }
            
            .ai-open-settings-btn {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .ai-title-input {
                width: 100%;
                height: 28px;
                padding: 3px 8px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                color: var(--text-normal);
                background: var(--background-primary);
                pointer-events: auto !important;
                opacity: 1 !important;
                cursor: text !important;
                user-select: text !important;
                -webkit-user-select: text !important;
                font-size: 0.95em;
            }
            
            .ai-input-content,
            .ai-prompt-input,
            .ai-output-content {
                width: 100%;
                min-height: 80px;
                padding: 6px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                color: var(--text-normal);
                background: var(--background-primary);
                font-family: var(--font-monospace);
                resize: vertical;
                overflow: auto;
                user-select: text;
                -webkit-user-select: text;
                cursor: text;
            }
            
            /* Markdown编辑器样式 */
            .markdown-editor {
                font-family: var(--font-monospace);
                line-height: 1.5;
                tab-size: 4;
                -moz-tab-size: 4;
                pointer-events: auto !重要;
                opacity: 1 !重要;
                user-select: text !重要;
                -webkit-user-select: text !重要;
                cursor: text !重要;
            }
            
            .markdown-editor:focus {
                outline: none;
                border-color: var(--interactive-accent);
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }
            
            /* 修改输入控件焦点和悬停状态 */
            .ai-model-selector:hover,
            .ai-title-input:hover,
            .ai-input-content:hover,
            .ai-prompt-input:hover,
            .ai-output-content:hover {
                border-color: var(--interactive-hover);
            }
            
            .ai-model-selector:focus,
            .ai-title-input:focus,
            .ai-input-content:focus,
            .ai-prompt-input:focus,
            .ai-output-content:focus {
                border-color: var(--interactive-accent);
                outline: none;
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }
            
            /* 确保下拉框选项可见 */
            .ai-model-selector option {
                background: var(--background-primary);
                color: var(--text-normal);
                padding: 4px;
                pointer-events: auto !重要;
                opacity: 1 !重要;
            }
            
            /* 确保下拉框在打开时正常显示 */
            select.ai-model-selector:focus,
            select.ai-model-selector:active {
                z-index: 9999 !重要;
                position: relative;
            }
            
            .ai-actions,
            .ai-footer-actions {
                display: flex;
                gap: 6px;
                justify-content: flex-end;
                margin-top: 6px;
            }
            
            button {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                padding: 6px 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9em;
            }
            
            button:hover {
                background-color: var(--interactive-accent-hover);
            }
            
            .ai-append-btn,
            .ai-generate-title-btn {
                align-self: flex-end;
            }
            
            .ai-cancel-btn {
                background-color: var(--background-modifier-error);
            }
        `;
        document.head.appendChild(styleEl);
    }

    // AI功能实现
    generateDefaultTitle(text) {
        // 从所选文本的前几个词生成简单标题
        const words = text.split(/\s+/).slice(0, 4);
        return words.join(' ') + '...';
    }

    // 新增：生成带时间戳的默认文件名
    generateTimestampFilename() {
        const now = new Date();
        const timestamp = 
            now.getFullYear().toString().substring(2) + // 年份后两位
            ('0' + (now.getMonth() + 1)).slice(-2) + // 月份，补零
            ('0' + now.getDate()).slice(-2) + // 日期，补零
            ('0' + now.getHours()).slice(-2) + // 小时，补零
            ('0' + now.getMinutes()).slice(-2); // 分钟，补零
        
        return `文件_${timestamp}`;
    }

    getDefaultPrompt() {
        return '请润色，并完善以下文本，同时保留其原始含义：';
    }

    async generateTitle() {
        const { elements } = this;
        
        if (!elements.inputContent.value) {
            new obsidian.Notice('请先提供一些输入内容');
            return;
        }

        const selectedModel = this.getSelectedModel();
        if (!selectedModel) {
            new obsidian.Notice('请先配置并选择一个AI模型');
            return;
        }

        try {
            elements.generateTitleBtn.disabled = true;
            elements.generateTitleBtn.textContent = '生成中...';
            
            const inputText = elements.inputContent.value;
            // 使用更明确的提示，增强对不同模型的适配性
            const prompt = `根据以下内容生成一个简短标题（不超过20个字符）。只返回标题本身，不要添加引号或其他符号。内容：${inputText.substring(0, 500)}`;
            
            const response = await this.plugin.callAIModel(selectedModel, prompt, 50);
            if (response) {
                // 清理生成的标题，去除多余符号和空白
                let title = response.trim();
                title = title.replace(/^["'"【「《]|["'"】」》]$/g, '');
                title = title.replace(/^标题[:：]*/i, '');
                title = title.replace(/^\d+[\.、:：]/, '');
                title = title.trim();
                
                // 如果标题仍然过长，截断它
                if (title.length > 20) {
                    title = title.substring(0, 20) + '...';
                }
                
                // 如果标题为空，使用时间戳文件名
                if (!title) {
                    title = this.generateTimestampFilename();
                }
                
                elements.titleInput.value = title;
            }
        } catch (error) {
            new obsidian.Notice(`生成标题错误: ${error.message}`);
            console.error('生成标题错误:', error);
            
            // 生成错误时，使用默认时间戳文件名
            elements.titleInput.value = this.generateTimestampFilename();
        } finally {
            elements.generateTitleBtn.disabled = false;
            elements.generateTitleBtn.textContent = '生成标题';
        }
    }

    async appendFromDocument() {
        const { elements } = this;
        
        if (!this.view || !this.view.editor) {
            new obsidian.Notice('无法访问文档编辑器');
            return;
        }
        
        // 获取当前选中的文本
        const selectedText = this.view.editor.getSelection();
        
        if (!selectedText) {
            new obsidian.Notice('请先在文档中选择要追加的文本');
            return;
        }
        
        const currentText = elements.inputContent.value;
        
        // 追加选中的文本，并在末尾添加一个换行符
        elements.inputContent.value = currentText
            ? currentText + '\n' + selectedText
            : selectedText;
            
        // 更新全局变量
        globalInputContent = elements.inputContent.value;
    }

    async generateResult() {
        const { elements } = this;
        
        if (!elements.inputContent.value) {
            new obsidian.Notice('请先提供一些输入内容');
            return;
        }

        const selectedModel = this.getSelectedModel();
        if (!selectedModel) {
            new obsidian.Notice('请先配置并选择一个AI模型');
            return;
        }

        try {
            // 显示正在使用的模型信息
            const modelInfo = selectedModel.isOllama 
                ? `Ollama本地模型 "${selectedModel.modelName}"`
                : `API模型 "${selectedModel.modelName}"`;
            console.log(`正在使用${modelInfo}生成内容`);
            
            elements.generateBtn.disabled = true;
            elements.generateBtn.textContent = '生成中...';
            elements.outputContent.value = '处理中...';
            
            const inputText = elements.inputContent.value;
            const prompt = elements.promptInput.value || this.getDefaultPrompt();
            
            const fullPrompt = `${prompt}\n\n${inputText}`;
            
            try {
                const response = await this.plugin.callAIModel(selectedModel, fullPrompt);
                
                if (response) {
                    elements.outputContent.value = response.trim();
                    
                    // 确保输出文本区域可编辑
                    elements.outputContent.removeAttribute('readonly');
                    elements.outputContent.removeAttribute('disabled');
                    elements.outputContent.style.pointerEvents = 'auto';
                    elements.outputContent.style.opacity = '1';
                    elements.outputContent.style.cursor = 'text';
                    
                    // 聚焦到输出区域，方便用户立即编辑
                    setTimeout(() => {
                        elements.outputContent.focus();
                        // 将光标放在文本末尾
                        elements.outputContent.setSelectionRange(
                            elements.outputContent.value.length,
                            elements.outputContent.value.length
                        );
                    }, 100);
                }
            } catch (apiError) {
                // 提供更友好的错误信息
                let errorMessage = apiError.message;
                
                // 检测常见错误模式并提供更具体的建议
                if (errorMessage.includes('非JSON响应')) {
                    errorMessage += '\n\n可能的解决方案:\n1. 检查API端点URL是否正确\n2. 确认API密钥是否有效\n3. 检查网络连接';
                } else if (errorMessage.includes('网络请求失败')) {
                    errorMessage += '\n\n可能的解决方案:\n1. 检查网络连接\n2. 确认API端点URL是否可访问\n3. 检查是否有防火墙或代理限制';
                } else if (errorMessage.includes('超时')) {
                    errorMessage += '\n\n可能的解决方案:\n1. 检查网络连接\n2. 服务器可能响应缓慢，稍后重试\n3. 尝试减少输入文本长度';
                }
                
                new obsidian.Notice(`生成结果错误: ${apiError.message}`);
                console.error('生成结果错误:', apiError);
                elements.outputContent.value = `错误: ${errorMessage}`;
                
                // 确保即使在错误情况下，输出文本区域也是可编辑的
                elements.outputContent.removeAttribute('readonly');
                elements.outputContent.removeAttribute('disabled');
                elements.outputContent.style.pointerEvents = 'auto';
                elements.outputContent.style.opacity = '1';
                elements.outputContent.style.cursor = 'text';
            }
        } catch (error) {
            new obsidian.Notice(`生成结果错误: ${error.message}`);
            console.error('生成结果错误:', error);
            elements.outputContent.value = `错误: ${error.message}`;
            
            // 确保即使在外部错误情况下，输出文本区域也是可编辑的
            elements.outputContent.removeAttribute('readonly');
            elements.outputContent.removeAttribute('disabled');
            elements.outputContent.style.pointerEvents = 'auto';
            elements.outputContent.style.opacity = '1';
            elements.outputContent.style.cursor = 'text';
        } finally {
            elements.generateBtn.disabled = false;
            elements.generateBtn.textContent = '生成结果';
            
            // 确保窗口可见
            this.setVisible(true);
            
            // 最后一次确保输出文本区域可编辑
            elements.outputContent.removeAttribute('readonly');
            elements.outputContent.removeAttribute('disabled');
            elements.outputContent.style.pointerEvents = 'auto';
            elements.outputContent.style.opacity = '1';
            elements.outputContent.style.cursor = 'text';
            
            // 更新全局变量
            globalOutputContent = elements.outputContent.value;
            
            console.log('生成结果完成，确保输出区域可编辑');
        }
    }

    async saveResult() {
        const { elements } = this;
        
        if (!elements.outputContent.value) {
            new obsidian.Notice('没有内容可保存');
            return;
        }

        try {
            const content = elements.outputContent.value;
            
            // 尝试获取用户输入的标题，如果为空或无法编辑，使用默认标题
            let title = elements.titleInput.value || '';
            
            // 检查标题输入框是否被禁用或为空
            const titleInputDisabled = elements.titleInput.disabled || 
                                     elements.titleInput.readOnly || 
                                     elements.titleInput.style.pointerEvents === 'none';
            
            if (titleInputDisabled || !title) {
                title = this.generateTimestampFilename();
                console.log('使用默认时间戳文件名:', title);
            } else if (title.length > 21) {
                // 如果标题太长，使用带时间戳的截断版本
                const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').substring(8, 14);
                title = title.substring(0, 15) + '_' + timestamp;
                console.log('标题过长，已截断并添加时间戳:', title);
            }
            
            const sanitizedTitle = this.sanitizeFilename(title);
            
            // 创建带有.md扩展名的有效文件名
            const filename = sanitizedTitle.endsWith('.md') ? sanitizedTitle : `${sanitizedTitle}.md`;
            
            // 确保我们有一个有效的保存路径
            const targetFolder = this.file ? this.file.parent.path : '/';
            const fullPath = `${targetFolder}/${filename}`;
            
            // 检查文件是否已经存在
            const exists = await this.app.vault.adapter.exists(fullPath);
            if (exists) {
                const confirmOverwrite = await new Promise(resolve => {
                    const modal = new obsidian.Modal(this.app);
                    modal.contentEl.createEl('p', { text: `文件 "${filename}" 已存在。是否覆盖？` });
                    
                    const buttonContainer = modal.contentEl.createDiv();
                    buttonContainer.style.display = 'flex';
                    buttonContainer.style.justifyContent = 'flex-end';
                    buttonContainer.style.gap = '10px';
                    buttonContainer.style.marginTop = '20px';
                    
                    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
                    cancelBtn.onclick = () => {
                        modal.close();
                        resolve(false);
                    };
                    
                    const confirmBtn = buttonContainer.createEl('button', { text: '覆盖' });
                    confirmBtn.style.backgroundColor = 'var(--background-modifier-error)';
                    confirmBtn.onclick = () => {
                        modal.close();
                        resolve(true);
                    };
                    
                    modal.open();
                });
                
                if (!confirmOverwrite) {
                    return;
                }
            }
            
            // 创建或覆盖文件
            await this.app.vault.create(fullPath, content);
            new obsidian.Notice(`已保存至 ${filename}`);
            
            // 打开新创建的文件
            const newFile = this.app.vault.getAbstractFileByPath(fullPath);
            if (newFile && newFile instanceof obsidian.TFile) {
                this.app.workspace.getLeaf().openFile(newFile);
            }
            
            // 清除全局变量
            globalInputContent = '';
            globalPromptContent = '';
            globalOutputContent = '';
            
            // 关闭浮动窗口
            this.close();
        } catch (error) {
            new obsidian.Notice(`保存文件错误: ${error.message}`);
            console.error('保存文件错误:', error);
        }
    }
    
    sanitizeFilename(filename) {
        // 移除文件名中的无效字符
        let sanitized = filename.replace(/[\\/:*?"<>|]/g, '_').trim();
        
        // 如果文件名为空，使用时间戳
        if (!sanitized) {
            sanitized = this.generateTimestampFilename();
        }
        
        // 检查长度，如果太长就截断并添加时间戳以确保唯一性
        if (sanitized.length > 21) {
            const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').substring(8, 14);
            sanitized = sanitized.substring(0, 15) + '_' + timestamp;
        }
        
        return sanitized;
    }
    
    getSelectedModel() {
        // 首先检查是否有lastModelName并且它仍然是有效模型
        if (this.plugin.settings.lastModelName) {
            const validModels = this.plugin.getValidModels();
            const rememberedModel = validModels.find(model => model.name === this.plugin.settings.lastModelName);
            
            if (rememberedModel) {
                // 如果找到了记忆的模型，确保其在UI中被选中
                const radioInput = this.containerEl.querySelector(`input[name="ai-model"][value="${this.plugin.settings.lastModelName}"]`);
                if (radioInput && !radioInput.checked) {
                    radioInput.checked = true;
                    
                    // 更新视觉效果
                    const labels = this.containerEl.querySelectorAll('.ai-model-radio-label');
                    labels.forEach(label => {
                        if (label.contains(radioInput)) {
                            label.classList.add('selected');
                        } else {
                            label.classList.remove('selected');
                        }
                    });
                }
                
                console.log(`使用记忆的模型: ${rememberedModel.name}`);
                return rememberedModel;
            }
        }
        
        // 回退到原来的实现
        const selectedRadio = this.containerEl.querySelector('input[name="ai-model"]:checked');
        
        if (!selectedRadio) {
            // 获取有效的模型列表
            const validModels = this.plugin.getValidModels();
            // 如果没有选中的单选按钮，返回第一个有效模型（如果有的话）
            const firstModel = validModels.length > 0 ? validModels[0] : null;
            
            // 更新lastModelName
            if (firstModel) {
                this.plugin.settings.lastModelName = firstModel.name;
                this.plugin.saveSettings(); // 保存设置
                console.log(`没有选中的模型，使用第一个可用模型: ${firstModel.name}`);
            }
            
            return firstModel;
        }
        
        const selectedModelName = selectedRadio.value;
        // 更新lastModelName
        this.plugin.settings.lastModelName = selectedModelName;
        this.plugin.saveSettings(); // 保存设置
        
        const model = this.plugin.settings.models.find(model => model.name === selectedModelName);
        
        if (model) {
            console.log(`已选择模型: ${model.name}${model.isOllama ? ' (Ollama本地模型)' : ''}`);
            console.log(`模型详情: 端点=${model.endpoint}, 名称=${model.modelName || '未指定'}`);
        }
        
        return model;
    }
}

// 设置选项卡
class AISettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.newModelData = {};
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'AI 文本处理设置' });

        // Model management section
        containerEl.createEl('h3', { text: 'AI 模型管理' });
        
        const modelListContainer = containerEl.createDiv('model-list-container');
        this.renderModelList(modelListContainer);
        
        // Add new model section
        containerEl.createEl('h3', { text: '添加新的 AI 模型' });
        
        const modelForm = containerEl.createDiv('model-form');
        modelForm.setAttribute('id', 'ai-model-form');
        
        // Model name
        new obsidian.Setting(modelForm)
            .setName('模型名称')
            .setDesc('用于识别此模型的友好名称')
            .addText(text => text
                .setPlaceholder('我的 AI 模型')
                .setValue('')
                .onChange(value => {
                    this.newModelData = this.newModelData || {};
                    this.newModelData.name = value;
                }));
        
        // 添加Ollama选项
        const ollamaSetting = new obsidian.Setting(modelForm)
            .setName('Ollama本地模型')
            .setDesc('如果您使用的是本地部署的Ollama模型，请勾选此项（不需要API密钥）')
            .addToggle(toggle => toggle
                .setValue(this.newModelData?.isOllama || false)
                .onChange(value => {
                    this.newModelData = this.newModelData || {};
                    this.newModelData.isOllama = value;
                    
                    // 更新表单UI状态
                    this.updateFormForOllama(modelForm, value);
                }));
        
        ollamaSetting.settingEl.setAttribute('id', 'ollama-toggle-setting');
        
        // Endpoint URL
        const endpointSetting = new obsidian.Setting(modelForm)
            .setName('API 端点')
            .setDesc('AI 模型 API 的 URL')
            .addText(text => {
                text.setPlaceholder('https://api.openai.com/v1/chat/completions')
                    .setValue('')
                    .onChange(value => {
                        this.newModelData = this.newModelData || {};
                        this.newModelData.endpoint = value;
                    });
                return text;
            });
            
        endpointSetting.settingEl.setAttribute('id', 'endpoint-setting');
        
        // Model name parameter
        const modelNameSetting = new obsidian.Setting(modelForm)
            .setName('模型名称参数')
            .setDesc('在 API 请求中使用的模型名称')
            .addText(text => {
                text.setPlaceholder('gpt-3.5-turbo')
                    .setValue('')
                    .onChange(value => {
                        this.newModelData = this.newModelData || {};
                        this.newModelData.modelName = value;
                    });
                return text;
            });
            
        modelNameSetting.settingEl.setAttribute('id', 'model-name-setting');
        
        // API Key
        const apiKeySetting = new obsidian.Setting(modelForm)
            .setName('API 密钥')
            .setDesc('用于认证的 API 密钥')
            .addText(text => {
                text.setPlaceholder('sk-...')
                    .setValue('')
                    .onChange(value => {
                        this.newModelData = this.newModelData || {};
                        this.newModelData.apiKey = value;
                    });
                return text;
            });
            
        apiKeySetting.settingEl.setAttribute('id', 'api-key-setting');
        
        // Ollama模型列表提示
        const ollamaModelsSetting = new obsidian.Setting(modelForm)
            .setName('常用Ollama模型')
            .setDesc('选择一个常用的Ollama模型名称，或在上方输入自定义名称')
            .addDropdown(dropdown => {
                dropdown.addOption('', '-- 选择模型 --')
                dropdown.addOption('llama2', 'Llama 2')
                dropdown.addOption('llama2:13b', 'Llama 2 (13B)')
                dropdown.addOption('llama2:70b', 'Llama 2 (70B)')
                dropdown.addOption('mistral', 'Mistral')
                dropdown.addOption('mistral:7b', 'Mistral (7B)')
                dropdown.addOption('vicuna', 'Vicuna')
                dropdown.addOption('orca-mini', 'Orca Mini')
                dropdown.addOption('codellama', 'Code Llama')
                dropdown.addOption('phi', 'Phi')
                dropdown.addOption('qwen', 'Qwen')
                dropdown.addOption('gemma', 'Gemma')
                dropdown.addOption('neural-chat', 'Neural Chat')
                dropdown.onChange(value => {
                    if (value) {
                        // 更新模型名称输入框
                        const modelNameInput = document.querySelector('#model-name-setting input');
                        if (modelNameInput) {
                            modelNameInput.value = value;
                            // 触发change事件，确保数据更新
                            modelNameInput.dispatchEvent(new Event('input'));
                            this.newModelData.modelName = value;
                        }
                    }
                });
                return dropdown;
            });
            
        ollamaModelsSetting.settingEl.setAttribute('id', 'ollama-models-setting');
        ollamaModelsSetting.settingEl.style.display = 'none'; // 默认隐藏
        
        // Temperature
        new obsidian.Setting(modelForm)
            .setName('温度')
            .setDesc('控制随机性：0 = 确定性，1 = 创造性（0.0-1.0）')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(0.7)
                .setDynamicTooltip()
                .onChange(value => {
                    this.newModelData = this.newModelData || {};
                    this.newModelData.temperature = value;
                }));
        
        // Max tokens
        new obsidian.Setting(modelForm)
            .setName('最大令牌数')
            .setDesc('生成的最大令牌数')
            .addText(text => text
                .setPlaceholder('2000')
                .setValue('2000')
                .onChange(value => {
                    this.newModelData = this.newModelData || {};
                    this.newModelData.maxTokens = parseInt(value) || 2000;
                }));
        
        // Test connection button
        new obsidian.Setting(modelForm)
            .setName('测试连接')
            .setDesc('测试API连接是否正常工作')
            .addButton(button => button
                .setButtonText('测试连接')
                .onClick(async () => {
                    if (!this.newModelData || !this.newModelData.endpoint) {
                        new obsidian.Notice('请先填写API端点');
                        return;
                    }
                    
                    // 非Ollama模型需要API密钥
                    if (!this.newModelData.isOllama && !this.newModelData.apiKey) {
                        new obsidian.Notice('非Ollama模型需要填写API密钥');
                        return;
                    }
                    
                    // 验证Ollama必须提供模型名称
                    if (this.newModelData.isOllama && !this.newModelData.modelName) {
                        new obsidian.Notice('Ollama模型必须指定模型名称');
                        return;
                    }
                    
                    const testBtn = button.buttonEl;
                    const originalText = testBtn.textContent;
                    testBtn.textContent = '测试中...';
                    testBtn.disabled = true;
                    
                    try {
                        // 先检查Ollama服务是否运行
                        if (this.newModelData.isOllama) {
                            const baseUrl = this.newModelData.endpoint.split('/api/')[0];
                            const serviceCheck = await checkOllamaService(baseUrl);
                            if (!serviceCheck.running) {
                                throw new Error(`无法连接到Ollama服务: ${serviceCheck.error || '服务未运行'}`);
                            }
                            
                            console.log('Ollama服务正在运行，可用模型:', 
                                serviceCheck.data?.models?.map(m => m.name).join(', ') || '无法获取模型列表');
                        }
                        
                        // 创建一个简单的测试请求
                        const testModel = {
                            endpoint: this.newModelData.endpoint,
                            apiKey: this.newModelData.apiKey,
                            modelName: this.newModelData.modelName || (this.newModelData.isOllama ? 'llama2' : 'gpt-3.5-turbo'),
                            temperature: 0.7,
                            maxTokens: 10,
                            isOllama: this.newModelData.isOllama
                        };
                        
                        console.log('测试连接使用模型:', testModel.modelName,
                            testModel.isOllama ? '(Ollama本地模型)' : '');
                        
                        // 使用一个非常简短的提示进行测试
                        const testPrompt = "测试连接，请回复'OK'";
                        await this.plugin.callAIModel(testModel, testPrompt, 10);
                        
                        new obsidian.Notice('连接测试成功！API配置有效');
                    } catch (error) {
                        console.error('API测试失败:', error);
                        new obsidian.Notice(`连接测试失败: ${error.message}`);
                    } finally {
                        testBtn.textContent = originalText;
                        testBtn.disabled = false;
                    }
                }));
        
        // Add model button
        new obsidian.Setting(modelForm)
            .addButton(button => button
                .setButtonText('添加模型')
                .setCta()
                .onClick(async () => {
                    if (this.newModelData && this.newModelData.name && this.newModelData.endpoint) {
                        // Check for duplicate names
                        if (this.plugin.settings.models.some(m => m.name === this.newModelData.name)) {
                            new obsidian.Notice('已存在同名模型');
                            return;
                        }
                        
                        this.plugin.settings.models.push(this.newModelData);
                        await this.plugin.saveSettings();
                        
                        // Clear form
                        this.newModelData = {};
                        modelForm.querySelectorAll('input').forEach(input => input.value = '');
                        
                        // Refresh model list
                        this.renderModelList(modelListContainer);
                        
                        new obsidian.Notice('模型添加成功');
                    } else {
                        new obsidian.Notice('请至少提供名称和端点');
                    }
                }));        
        
        // Import/Export section
        containerEl.createEl('h3', { text: '导入/导出设置' });
        
        // Export settings
        new obsidian.Setting(containerEl)
            .setName('导出设置')
            .setDesc('将所有模型配置导出到 JSON 文件')
            .addButton(button => button
                .setButtonText('导出')
                .onClick(() => {
                    const exportData = JSON.stringify(this.plugin.settings, null, 2);
                    const blob = new Blob([exportData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'ai-text-processing-settings.json';
                    a.click();
                    
                    URL.revokeObjectURL(url);
                }));
        
        // Import settings
        new obsidian.Setting(containerEl)
            .setName('导入设置')
            .setDesc('从 JSON 文件导入模型配置')
            .addButton(button => button
                .setButtonText('导入')
                .onClick(() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            try {
                                const text = await file.text();
                                const importedSettings = JSON.parse(text);
                                
                                if (importedSettings && Array.isArray(importedSettings.models)) {
                                    this.plugin.settings = importedSettings;
                                    await this.plugin.saveSettings();
                                    
                                    // Refresh model list
                                    this.renderModelList(modelListContainer);
                                    
                                    new obsidian.Notice('设置导入成功');
                                } else {
                                    new obsidian.Notice('无效的设置文件格式');
                                }
                            } catch (error) {
                                console.error('导入设置错误:', error);
                                new obsidian.Notice('导入设置错误');
                            }
                        }
                    };
                    
                    input.click();
                }));
        
        // 初始化表单状态
        this.updateFormForOllama(modelForm, this.newModelData?.isOllama || false);
    }
    
    // 添加新方法处理Ollama相关表单变化
    updateFormForOllama(formEl, isOllama) {
        // 更新API端点占位符
        const endpointInput = formEl.querySelector('#endpoint-setting input');
        if (endpointInput) {
            endpointInput.placeholder = isOllama ? 
                'http://localhost:11434/api/generate' : 
                'https://api.openai.com/v1/chat/completions';
        }
        
        // 更新模型名称占位符和描述
        const modelNameSetting = formEl.querySelector('#model-name-setting');
        const modelNameInput = formEl.querySelector('#model-name-setting input');
        const modelNameDesc = formEl.querySelector('#model-name-setting .setting-item-description');
        
        if (modelNameSetting && modelNameInput && modelNameDesc) {
            if (isOllama) {
                modelNameInput.placeholder = 'llama2';
                modelNameDesc.textContent = '必填: Ollama模型名称 (例如: llama2, mistral, gemma 等)';
                modelNameSetting.classList.add('important-setting');
            } else {
                modelNameInput.placeholder = 'gpt-3.5-turbo';
                modelNameDesc.textContent = '在 API 请求中使用的模型名称';
                modelNameSetting.classList.remove('important-setting');
            }
        }
        
        // 更新API密钥输入框状态
        const apiKeyInput = formEl.querySelector('#api-key-setting input');
        const apiKeyDesc = formEl.querySelector('#api-key-setting .setting-item-description');
        
        if (apiKeyInput && apiKeyDesc) {
            apiKeyInput.disabled = isOllama;
            apiKeyDesc.textContent = isOllama ? 
                'Ollama本地模型不需要API密钥' : 
                '用于认证的 API 密钥';
                
            if (isOllama) {
                apiKeyInput.placeholder = '本地模型无需密钥';
                apiKeyInput.value = '';
                if (this.newModelData) this.newModelData.apiKey = '';
            } else {
                apiKeyInput.placeholder = 'sk-...';
            }
        }
        
        // 显示/隐藏Ollama模型列表
        const ollamaModelsList = formEl.querySelector('#ollama-models-setting');
        if (ollamaModelsList) {
            ollamaModelsList.style.display = isOllama ? 'block' : 'none';
        }
        
        // 添加CSS样式以突出显示重要设置
        const styleEl = document.getElementById('ai-setting-styles');
        if (!styleEl) {
            const newStyle = document.createElement('style');
            newStyle.id = 'ai-setting-styles';
            newStyle.textContent = `
                .important-setting {
                    background-color: rgba(var(--interactive-accent-rgb), 0.1);
                    border-left: 3px solid var(--interactive-accent);
                    padding-left: 10px !important;
                    border-radius: 4px;
                }
                #ollama-toggle-setting {
                    margin-bottom: 15px;
                    background-color: rgba(var(--interactive-accent-rgb), 0.05);
                    padding: 10px;
                    border-radius: 4px;
                }
            `;
            document.head.appendChild(newStyle);
        }
    }
    
    renderModelList(containerEl) {
        containerEl.empty();
        
        if (!this.plugin.settings.models.length) {
            containerEl.createEl('p', { text: '尚未配置任何模型。请在下方添加新模型。' });
            return;
        }
        
        // Create model list
        this.plugin.settings.models.forEach((model, index) => {
            const modelItem = containerEl.createDiv('model-item');
            modelItem.createEl('h4', { text: model.name + (model.isOllama ? ' (Ollama本地模型)' : '') });
            
            const modelDetails = modelItem.createDiv('model-details');
            modelDetails.createEl('p', { text: `端点: ${model.endpoint}` });
            modelDetails.createEl('p', { text: `模型: ${model.modelName || '未指定'}` });
            if (!model.isOllama) {
                modelDetails.createEl('p', { text: `API密钥: ${model.apiKey ? '****' + model.apiKey.slice(-4) : '未设置'}` });
            }
            modelDetails.createEl('p', { text: `温度: ${model.temperature || 0.7}` });
            modelDetails.createEl('p', { text: `最大令牌数: ${model.maxTokens || 2000}` });
            
            // 编辑和删除按钮保持不变
            const modelControls = modelItem.createDiv('model-controls');
            
            // Edit button
            const editBtn = modelControls.createEl('button', { text: '编辑' });
            editBtn.addEventListener('click', () => {
                // Populate form with model data for editing
                this.newModelData = { ...model };
                
                // Update form values
                const modelForm = this.containerEl.querySelector('#ai-model-form');
                
                const nameInput = modelForm.querySelector('input[placeholder="我的 AI 模型"]');
                if (nameInput) nameInput.value = model.name || '';
                
                const endpointInput = modelForm.querySelector('#endpoint-setting input');
                if (endpointInput) endpointInput.value = model.endpoint || '';
                
                const modelNameInput = modelForm.querySelector('#model-name-setting input');
                if (modelNameInput) modelNameInput.value = model.modelName || '';
                
                const apiKeyInput = modelForm.querySelector('#api-key-setting input');
                if (apiKeyInput) apiKeyInput.value = model.apiKey || '';
                
                const temperatureSlider = modelForm.querySelector('.slider');
                if (temperatureSlider) temperatureSlider.value = model.temperature || 0.7;
                
                const maxTokensInput = modelForm.querySelector('input[placeholder="2000"]');
                if (maxTokensInput) maxTokensInput.value = model.maxTokens?.toString() || '2000';
                
                // 更新Ollama开关状态
                const ollamaToggle = modelForm.querySelector('#ollama-toggle-setting input[type="checkbox"]');
                if (ollamaToggle) {
                    ollamaToggle.checked = model.isOllama || false;
                    
                    // 触发change事件，更新表单状态
                    const event = new Event('change');
                    ollamaToggle.dispatchEvent(event);
                    
                    // 更新表单UI
                    this.updateFormForOllama(modelForm, model.isOllama || false);
                }
                
                // 如果是Ollama模型，尝试从下拉列表中选择匹配的模型
                if (model.isOllama && model.modelName) {
                    const ollamaDropdown = modelForm.querySelector('#ollama-models-setting select');
                    if (ollamaDropdown) {
                        const option = Array.from(ollamaDropdown.options).find(opt => opt.value === model.modelName);
                        if (option) {
                            ollamaDropdown.value = model.modelName;
                        } else {
                            ollamaDropdown.value = ''; // 如果没有匹配项，选择空选项
                        }
                    }
                }
                
                // Scroll to form
                modelForm.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                
                // Change add button to update
                const addButton = this.containerEl.querySelector('button.mod-cta');
                if (addButton) {
                    addButton.textContent = '更新模型';
                    
                    // Store original onClick handler
                    if (!this._originalAddClick) {
                        this._originalAddClick = addButton.onclick;
                    }
                    
                    // Set new onClick handler for updating
                    addButton.onclick = async () => {
                        if (this.newModelData && this.newModelData.name && this.newModelData.endpoint) {
                            // Update model in settings
                            this.plugin.settings.models[index] = this.newModelData;
                            await this.plugin.saveSettings();
                            
                            // Reset form
                            this.newModelData = {};
                            this.containerEl.querySelectorAll('input').forEach(input => input.value = '');
                            
                            // Reset button
                            addButton.textContent = '添加模型';
                            addButton.onclick = this._originalAddClick;
                            
                            // Refresh model list
                            this.renderModelList(containerEl);
                            
                            new obsidian.Notice('模型更新成功');
                        } else {
                            new obsidian.Notice('请至少提供名称和端点');
                        }
                    };
                }
            });
            
            // Delete button
            const deleteBtn = modelControls.createEl('button', { text: '删除' });
            deleteBtn.classList.add('mod-warning');
            deleteBtn.addEventListener('click', async () => {
                // Confirm deletion
                const confirmDelete = await new Promise(resolve => {
                    const modal = new obsidian.Modal(this.app);
                    modal.contentEl.createEl('p', { text: `您确定要删除模型 "${model.name}" 吗？` });
                    
                    const buttonContainer = modal.contentEl.createDiv();
                    buttonContainer.style.display = 'flex';
                    buttonContainer.style.justifyContent = 'flex-end';
                    buttonContainer.style.gap = '10px';
                    buttonContainer.style.marginTop = '20px';
                    
                    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
                    cancelBtn.onclick = () => {
                        modal.close();
                        resolve(false);
                    };
                    
                    const confirmBtn = buttonContainer.createEl('button', { text: '删除' });
                    confirmBtn.classList.add('mod-warning');
                    confirmBtn.onclick = () => {
                        modal.close();
                        resolve(true);
                    };
                    
                    modal.open();
                });
                
                if (confirmDelete) {
                    // 检查是否删除了当前选中的模型
                    if (model.name === this.plugin.settings.lastModelName) {
                        // 如果是，重置lastModelName或设置为另一个有效模型
                        const remainingModels = [...this.plugin.settings.models];
                        remainingModels.splice(index, 1);
                        
                        if (remainingModels.length > 0) {
                            this.plugin.settings.lastModelName = remainingModels[0].name;
                        } else {
                            this.plugin.settings.lastModelName = '';
                        }
                    }
                    
                    // Remove model from settings
                    this.plugin.settings.models.splice(index, 1);
                    await this.plugin.saveSettings();
                    
                    // Refresh model list
                    this.renderModelList(containerEl);
                    
                    new obsidian.Notice('模型删除成功');
                }
            });
        });
        
        // Add some styling
        containerEl.createEl('style', {
            text: `
                .model-item {
                    background-color: var(--background-secondary);
                    border-radius: 5px;
                    padding: 10px;
                    margin-bottom: 10px;
                }
                .model-details {
                    margin: 10px 0;
                }
                .model-details p {
                    margin: 5px 0;
                    font-size: 0.9em;
                }
                .model-controls {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                .model-form {
                    background-color: var(--background-secondary);
                    border-radius: 5px;
                    padding: 10px;
                    margin-bottom: 20px;
                }
            `
        });
    }
}

// 添加一个辅助函数检查Ollama服务是否运行
async function checkOllamaService(endpoint = 'http://localhost:11434') {
    try {
        const response = await fetch(`${endpoint}/api/tags`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
            return { running: true, data: await response.json() };
        }
        return { running: false, error: response.statusText };
    } catch (error) {
        return { running: false, error: error.message };
    }
}

module.exports = FloatingWindowPlugin;