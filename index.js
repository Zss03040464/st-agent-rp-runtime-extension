const EXTENSION_NAME = 'Agent RP Runtime';
let lastReadonlyResult = null;
let lastDryRunText = '';
let lastWritePreview = null;
let panelCollapsed = false;
const WRITE_CONFIRM_ENABLED = false;

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

function buildWritePreview() {
    const now = new Date().toLocaleTimeString();
    const source = lastDryRunText || 'Dry-run result is empty. Run Dry-Run first.';
    return {
        createdAt: now,
        candidate: [
            '[Agent RP Runtime preview only]',
            'This text is not inserted into chat.',
            '',
            source,
        ].join('\n'),
        checks: [
            'manualTriggerOnly: true',
            'secondConfirmRequired: true',
            'autoGenerateBlocked: true',
            'realInsertBlocked: true',
            'didWriteBack: false',
        ],
    };
}

function formatWritePreview(preview) {
    return [
        'Write-back safety preview',
        `createdAt: ${preview.createdAt}`,
        '',
        'Candidate preview:',
        preview.candidate,
        '',
        'Safety checks:',
        ...preview.checks.map(x => `  ${x}`),
        '',
        'Confirm button status: disabled',
        'Reason: I5 only defines the safety gate. Real insertion is not enabled.',
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
        lastDryRunText = formatDryRun(bridgeInputFromScan(lastReadonlyResult));
        setPanelOutput(lastDryRunText);
    } catch (e) {
        setPanelError(`Dry-run failed: ${e.message}`);
    }
}

function handleWritePreview() {
    console.log(`[${EXTENSION_NAME}] write preview clicked`);
    try {
        lastWritePreview = buildWritePreview();
        setPanelOutput(formatWritePreview(lastWritePreview));
        const confirm = document.getElementById('arr_btn_confirm_write');
        if (confirm) confirm.disabled = !WRITE_CONFIRM_ENABLED;
    } catch (e) {
        setPanelError(`Write preview failed: ${e.message}`);
    }
}

function handleConfirmWrite() {
    console.log(`[${EXTENSION_NAME}] confirm write clicked but blocked`);
    setPanelOutput([
        'Write-back blocked',
        'didWriteBack: false',
        'Reason: confirm write is intentionally disabled in I5 safety gate.',
        'No chat content was changed.',
    ].join('\n'));
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
    document.getElementById('arr_btn_preview_write')?.addEventListener('click', handleWritePreview);
    document.getElementById('arr_btn_confirm_write')?.addEventListener('click', handleConfirmWrite);
}

function injectFloatingPanel() {
    if (document.getElementById('agent-rp-runtime-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'agent-rp-runtime-panel';
    panel.className = 'arr-floating-panel';
    panel.innerHTML = `
        <div class="arr-panel-header">
            <span class="arr-panel-title">Agent RP Runtime</span>
            <span class="arr-panel-badge" id="arr_panel_badge">I5-safe</span>
            <button class="arr-panel-toggle" id="arr_panel_toggle" title="toggle">-</button>
        </div>
        <div class="arr-panel-body" id="arr_panel_body">
            <div class="arr-panel-actions">
                <button id="arr_btn_refresh" class="arr-btn">刷新只读数据</button>
                <button id="arr_btn_dryrun" class="arr-btn">运行 Dry-Run</button>
            </div>
            <div class="arr-panel-actions">
                <button id="arr_btn_preview_write" class="arr-btn">写回预览</button>
                <button id="arr_btn_confirm_write" class="arr-btn" disabled>确认写回</button>
            </div>
            <div class="arr-panel-output" id="arr_panel_output">
                <div class="arr-placeholder">I5 安全层：可预览写回，但确认写回默认禁用。</div>
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
        console.log(`[${EXTENSION_NAME}] Extension loaded (I5 safety gate, no real write-back)`);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] bootstrap failed:`, e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
    bootstrap();
}
