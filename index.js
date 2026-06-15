const EXTENSION_NAME = 'Agent RP Runtime';
let lastReadonlyResult = null;
let panelCollapsed = false;

console.log(`[${EXTENSION_NAME}] extension index.js loaded`);

function safeText(value, max = 80) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function scanPage() {
    const result = {
        timestamp: Date.now(),
        url: window.location.href,
        title: document.title,
        chatFound: false,
        messageCount: 0,
        messageElements: 0,
        userInputPreview: '',
        lastMessagePreview: '',
        warnings: [],
    };

    try {
        const chat = document.querySelector('#chat');
        const messages = [...document.querySelectorAll('#chat .mes, .mes, .message, .chat_message')];
        result.chatFound = Boolean(chat || messages.length);
        result.messageElements = messages.length;
        result.messageCount = chat?.children?.length || messages.length;
        result.lastMessagePreview = safeText(messages.at(-1)?.innerText || messages.at(-1)?.textContent || '', 120);

        const input = document.querySelector('textarea#send_textarea, textarea[name="send_textarea"], #send_textarea, textarea');
        result.userInputPreview = safeText(input?.value || '', 120);
    } catch (e) {
        result.warnings.push(e.message);
    }

    return result;
}

function bridgeInputFromScan(result) {
    return {
        userInput: result?.userInputPreview || '',
        chat: [],
        character: null,
        source: result ? 'dom-scan' : 'placeholder',
    };
}

function formatDryRun(bridgeInput) {
    return [
        'Dry-run result',
        `userInput: ${bridgeInput.userInput || '(empty)'}`,
        `source: ${bridgeInput.source}`,
        'didWriteBack: false',
        'didCallModel: false',
        'runtimeBundleLoaded: false',
        'fallbackDryRun: true',
    ].join('\n');
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

function setPanelOutput(text) {
    const output = document.getElementById('arr_panel_output');
    if (output) output.innerHTML = `<pre class="arr-panel-pre">${escapeHtml(text)}</pre>`;
}

function setPanelError(text) {
    const output = document.getElementById('arr_panel_output');
    if (output) output.innerHTML = `<div class="arr-panel-error">${escapeHtml(text)}</div>`;
}

function handleRefreshData() {
    console.log(`[${EXTENSION_NAME}] read-only refresh clicked`);
    try {
        const result = scanPage();
        lastReadonlyResult = result;
        setPanelOutput([
            'Read-only scan',
            `url: ${result.url}`,
            `title: ${result.title}`,
            `chatFound: ${result.chatFound}`,
            `messageCount: ${result.messageCount}`,
            `messageElements: ${result.messageElements}`,
            `userInputPreview: ${result.userInputPreview || '(empty)'}`,
            `lastMessagePreview: ${result.lastMessagePreview || '(empty)'}`,
            `warnings: ${result.warnings.length ? result.warnings.join('; ') : 'none'}`,
        ].join('\n'));
    } catch (e) {
        setPanelError(`Read-only scan failed: ${e.message}`);
    }
}

function handleDryRun() {
    console.log(`[${EXTENSION_NAME}] dry-run clicked`);
    try {
        setPanelOutput(formatDryRun(bridgeInputFromScan(lastReadonlyResult)));
    } catch (e) {
        setPanelError(`Dry-run failed: ${e.message}`);
    }
}

function mountPanelEvents() {
    const toggle = document.getElementById('arr_panel_toggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const body = document.getElementById('arr_panel_body');
            if (!body) return;
            panelCollapsed = !panelCollapsed;
            body.style.display = panelCollapsed ? 'none' : '';
            toggle.textContent = panelCollapsed ? '+' : '-';
        });
    }

    document.getElementById('arr_btn_refresh')?.addEventListener('click', handleRefreshData);
    document.getElementById('arr_btn_dryrun')?.addEventListener('click', handleDryRun);
}

function injectFloatingPanel() {
    if (document.getElementById('agent-rp-runtime-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'agent-rp-runtime-panel';
    panel.className = 'arr-floating-panel';
    panel.innerHTML = `
        <div class="arr-panel-header">
            <span class="arr-panel-title">Agent RP Runtime</span>
            <span class="arr-panel-badge" id="arr_panel_badge">loaded</span>
            <button class="arr-panel-toggle" id="arr_panel_toggle" title="toggle">-</button>
        </div>
        <div class="arr-panel-body" id="arr_panel_body">
            <div class="arr-panel-actions">
                <button id="arr_btn_refresh" class="arr-btn">刷新只读数据</button>
                <button id="arr_btn_dryrun" class="arr-btn">运行 Dry-Run</button>
            </div>
            <div class="arr-panel-output" id="arr_panel_output">
                <div class="arr-placeholder">点击刷新只读数据查看摘要。</div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);
    mountPanelEvents();
    console.log(`[${EXTENSION_NAME}] visible panel mounted`);
}

function bootstrap() {
    try {
        injectFloatingPanel();
        console.log(`[${EXTENSION_NAME}] Extension loaded (self-contained browser entrypoint)`);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] bootstrap failed:`, e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
    bootstrap();
}
