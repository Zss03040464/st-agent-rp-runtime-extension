/**
 * Agent RP Runtime — SillyTavern Extension
 * Phase I4: Runtime dry-run hooks. Injects visible floating panel.
 * Does NOT intercept generation, listen to generation events,
 * write back messages, or call real model API.
 */

import {
    executeReadonlyScan,
} from './readonly-reader.js';

import {
    getBridgeInputForDryRun,
    formatDryRunResult,
} from './dry-run.js';

const EXTENSION_ID = 'agent-rp-runtime';
const EXTENSION_NAME = 'Agent RP Runtime';

const DEFAULT_SETTINGS = Object.freeze({
    enabled: false,
    dryRun: true,
    scenarioId: '',
    debug: false,
});

let settings = { ...DEFAULT_SETTINGS };
let lastReadonlyResult = null;
let panelCollapsed = false;

console.log(`[${EXTENSION_NAME}] extension index.js loaded`);

// ============================================================
// SillyTavern context (same as before)
// ============================================================

function getContext() {
    try {
        return SillyTavern.getContext();
    } catch {
        return null;
    }
}

function loadSettings(ctx) {
    try {
        const saved = ctx.extensionSettings?.[EXTENSION_ID];
        if (saved && typeof saved === 'object') {
            settings = { ...DEFAULT_SETTINGS, ...saved };
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] loadSettings failed:`, e);
    }
}

function saveSettings(ctx) {
    try {
        ctx.extensionSettings[EXTENSION_ID] = { ...settings };
        if (typeof ctx.saveSettingsDebounced === 'function') {
            ctx.saveSettingsDebounced();
        }
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] saveSettings failed:`, e);
    }
}

// ============================================================
// Read-only scan (DOM-based fallback)
// ============================================================

/**
 * Read SillyTavern state from the DOM when internal context is unavailable.
 * Safe: no write, no events, no API keys.
 */
function domReadonlyScan() {
    const result = {
        ctxAvailable: false,
        timestamp: Date.now(),
        url: window.location.href,
        documentTitle: document.title,
        messageCount: 0,
        messageElements: 0,
        userInput: '',
        chatContainerFound: false,
        warnings: [],
    };

    try {
        // URL check
        result.url = window.location.href;
        result.documentTitle = document.title;

        // Try common SillyTavern chat container selectors
        const chatSelectors = [
            '#chat', '.chat', '[data-chat]',
            '.messages', '#messages', '.message',
            '.mes', '[class*="mes_"]', '.chat_message',
        ];

        for (const sel of chatSelectors) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
                result.messageElements = els.length;
                result.chatContainerFound = true;
                break;
            }
        }

        // Try to find textarea / input
        const ta = document.querySelector('textarea#send_textarea, textarea.form-control, textarea[data-i18n]');
        if (ta) {
            result.userInput = ta.value ? ta.value.substring(0, 80) : '(empty)';
        } else {
            const inp = document.querySelector('input[type="text"]#send_textarea, input.send_textarea');
            if (inp) {
                result.userInput = inp.value ? inp.value.substring(0, 80) : '(empty)';
            }
        }

        // Detect SillyTavern specific elements
        if (document.getElementById('chat')) {
            result.chatContainerFound = true;
            const chatChildren = document.getElementById('chat').children.length;
            result.messageCount = chatChildren;
        }
    } catch (e) {
        result.warnings.push(`DOM scan error: ${e.message}`);
    }

    return result;
}

// ============================================================
// Floating Panel DOM Injection
// ============================================================

function injectFloatingPanel() {
    if (document.getElementById('agent-rp-runtime-panel')) {
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'agent-rp-runtime-panel';
    panel.className = 'arr-floating-panel';

    panel.innerHTML = `
        <div class="arr-panel-header">
            <span class="arr-panel-title">Agent RP Runtime</span>
            <span class="arr-panel-badge" id="arr_panel_badge">loaded</span>
            <button class="arr-panel-toggle" id="arr_panel_toggle" title="收起/展开">−</button>
        </div>
        <div class="arr-panel-body" id="arr_panel_body">
            <div class="arr-panel-actions">
                <button id="arr_btn_refresh" class="arr-btn">刷新只读数据</button>
                <button id="arr_btn_dryrun" class="arr-btn">运行 Dry-Run</button>
            </div>
            <div class="arr-panel-output" id="arr_panel_output">
                <div class="arr-placeholder">点击「刷新只读数据」查看当前上下文摘要。</div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);
    mountPanelEvents();
    console.log(`[${EXTENSION_NAME}] visible panel mounted`);
}

function mountPanelEvents() {
    // Toggle collapse
    const toggle = document.getElementById('arr_panel_toggle');
    if (toggle) {
        toggle.addEventListener('click', function () {
            const body = document.getElementById('arr_panel_body');
            if (body) {
                panelCollapsed = !panelCollapsed;
                body.style.display = panelCollapsed ? 'none' : '';
                toggle.textContent = panelCollapsed ? '+' : '−';
            }
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('arr_btn_refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefreshData);
    }

    // Dry-run button
    const dryrunBtn = document.getElementById('arr_btn_dryrun');
    if (dryrunBtn) {
        dryrunBtn.addEventListener('click', handleDryRun);
    }
}

// ============================================================
// Update Panel Output
// ============================================================

function setPanelOutput(text) {
    const output = document.getElementById('arr_panel_output');
    if (output) {
        output.innerHTML = `<pre class="arr-panel-pre">${escapeHtml(text)}</pre>`;
    }
}

function setPanelError(msg) {
    const output = document.getElementById('arr_panel_output');
    if (output) {
        output.innerHTML = `<div class="arr-panel-error">${escapeHtml(msg)}</div>`;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// Handlers
// ============================================================

async function handleRefreshData() {
    console.log(`[${EXTENSION_NAME}] read-only refresh clicked`);

    const ctx = getContext();

    if (ctx) {
        // Real SillyTavern context available — use readonly-reader.js
        try {
            const result = await executeReadonlyScan();
            lastReadonlyResult = result;

            if (settings.debug) {
                console.log(`[${EXTENSION_NAME}] Read-only scan result:`, result);
            }

            const lines = [];
            lines.push(`SillyTavern context: available`);
            lines.push(`URL: ${window.location.href}`);
            lines.push(`Loaded at: ${new Date(result.timestamp).toLocaleTimeString()}`);
            lines.push('');

            if (result.chat?.available) {
                lines.push(`─ Chat ─`);
                lines.push(`  Messages: ${result.chat.messageCount}`);
                lines.push(`  User: ${result.chat.roleDistribution.user} | Assistant: ${result.chat.roleDistribution.assistant}`);
                lines.push(`  Total chars: ${result.chat.totalChars}`);
                if (result.chat.lastUserInputPreview) {
                    lines.push(`  Last user: ${result.chat.lastUserInputPreview}`);
                }
                if (result.chat.lastAssistantOutputPreview) {
                    lines.push(`  Last AI: ${result.chat.lastAssistantOutputPreview}`);
                }
            }

            if (result.character?.available) {
                lines.push('');
                lines.push(`─ Character ─`);
                lines.push(`  Name: ${result.character.name}`);
                lines.push(`  Description: ${result.character.descriptionLength} chars`);
            }

            if (result.persona?.available) {
                lines.push('');
                lines.push(`─ Persona ─`);
                lines.push(`  User: ${result.persona.userName || '(unset)'}`);
                lines.push(`  Description: ${result.persona.personaDescriptionLength} chars`);
            }

            if (result.worldInfo?.available) {
                lines.push('');
                lines.push(`─ World Info ─`);
                lines.push(`  Source: ${result.worldInfo.source}`);
                if (result.worldInfo.totalEntries !== undefined) {
                    lines.push(`  Entries: ${result.worldInfo.totalEntries} (enabled: ${result.worldInfo.enabledEntries})`);
                }
            }

            setPanelOutput(lines.join('\n'));
        } catch (e) {
            setPanelError(`Read-only scan failed: ${e.message}`);
        }
    } else {
        // No SillyTavern context — use DOM-based fallback
        const domResult = domReadonlyScan();
        lastReadonlyResult = domResult;

        const lines = [];
        lines.push(`SillyTavern context: unavailable (DOM fallback)`);
        lines.push(`URL: ${domResult.url}`);
        lines.push(`Loaded at: ${new Date(domResult.timestamp).toLocaleTimeString()}`);
        lines.push('');
        lines.push(`─ DOM State ─`);
        lines.push(`  Message elements found: ${domResult.messageElements}`);
        lines.push(`  Chat container: ${domResult.chatContainerFound ? 'yes' : 'no'}`);
        lines.push(`  User input: ${domResult.userInput || '(empty)'}`);

        if (domResult.warnings.length > 0) {
            lines.push('');
            lines.push(`─ Warnings ─`);
            for (const w of domResult.warnings) {
                lines.push(`  ${w}`);
            }
        }

        setPanelOutput(lines.join('\n'));
    }

    // Also update the settings pane if it exists
    const readTimestamp = document.getElementById('arr_read_timestamp');
    if (readTimestamp) {
        readTimestamp.textContent = new Date().toLocaleTimeString();
    }
}

async function handleDryRun() {
    console.log(`[${EXTENSION_NAME}] dry-run clicked`);

    const ctx = getContext();

    try {
        const bridgeInput = getBridgeInputForDryRun(lastReadonlyResult);
        const isBundleLoaded = false;

        if (settings.debug) {
            console.log(`[${EXTENSION_NAME}] Dry-run button clicked. Bundle loaded: ${isBundleLoaded}`);
        }

        const lines = [];
        lines.push(`─ Dry-Run Result ─`);
        lines.push(`  Scenario: ${settings.scenarioId || '(unset)'}`);
        lines.push(`  User input: ${(bridgeInput.userInput || '(empty)').substring(0, 80)}`);
        lines.push(`  Messages: ${(bridgeInput.chat || []).length}`);
        lines.push(`  Character: ${bridgeInput.character?.name || '(unknown)'}`);
        lines.push('');
        lines.push(`─ Status ─`);
        lines.push(`  didWriteBack: false`);
        lines.push(`  didCallModel: false`);
        lines.push(`  runtimeBundleLoaded: false`);
        lines.push(`  fallbackDryRun: true`);
        lines.push('');
        lines.push(`─ Info ─`);
        lines.push(`  Dry-run 当前在浏览器端使用 fallback 模式。`);
        lines.push(`  TypeScript Runtime Core 需要在 I5 通过 esbuild 打包后`);
        lines.push(`  才能在浏览器中执行完整 pipeline。`);

        if (bridgeInput._source) {
            lines.push(`  Data source: ${bridgeInput._source}`);
        }

        setPanelOutput(lines.join('\n'));
    } catch (e) {
        setPanelError(`Dry-run 失败: ${e.message}`);
    }

    // Also update settings pane if it exists
    const dryrunTimestamp = document.getElementById('arr_dryrun_timestamp');
    if (dryrunTimestamp) {
        dryrunTimestamp.textContent = new Date().toLocaleTimeString();
    }
}

// ============================================================
// SillyTavern Settings Pane Registration (secondary)
// ============================================================

async function registerSettingsPane(ctx) {
    try {
        const html = await ctx.renderExtensionTemplateAsync(
            'third-party/agent-rp-runtime',
            'settings'
        );
        const $html = $(html);

        $html.find('#arr_enabled')
            .prop('checked', settings.enabled)
            .on('change', function () {
                settings.enabled = $(this).prop('checked');
                saveSettings(ctx);
            });

        $html.find('#arr_dry_run')
            .prop('checked', settings.dryRun)
            .on('change', function () {
                settings.dryRun = $(this).prop('checked');
                saveSettings(ctx);
            });

        $html.find('#arr_scenario_id')
            .val(settings.scenarioId)
            .on('change', function () {
                settings.scenarioId = $(this).val();
                saveSettings(ctx);
            });

        $html.find('#arr_debug')
            .prop('checked', settings.debug)
            .on('change', function () {
                settings.debug = $(this).prop('checked');
                saveSettings(ctx);
            });

        $('#extensions_settings').append($html);

        console.log(`[${EXTENSION_NAME}] Settings pane registered`);
    } catch (e) {
        console.warn(`[${EXTENSION_NAME}] registerSettingsPane failed (non-critical):`, e);
    }
}

// ============================================================
// Bootstrap
// ============================================================

function bootstrap() {
    // Always inject the floating panel (primary UI)
    if (document.body) {
        injectFloatingPanel();
    } else {
        document.addEventListener('DOMContentLoaded', injectFloatingPanel);
    }

    // Try SillyTavern integration (secondary)
    const ctx = getContext();
    if (ctx) {
        loadSettings(ctx);
        registerSettingsPane(ctx);
        console.log(`[${EXTENSION_NAME}] SillyTavern context found, settings pane registered`);
    } else {
        console.log(`[${EXTENSION_NAME}] SillyTavern context not available (panel only mode)`);
    }

    console.log(`[${EXTENSION_NAME}] Extension loaded (Phase I4 — visible panel mounted, not intercepting generation)`);
}

// Wait for DOM then bootstrap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
