/**
 * Agent RP Runtime — SillyTavern Extension
 * Phase I4: Runtime dry-run hooks. Does NOT intercept generation,
 * listen to generation events, write back messages, or call real model API.
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

/**
 * Format a readable summary from the scan result.
 */
function formatScanResult(result) {
    const lines = [];

    if (!result.ctxAvailable) {
        lines.push('SillyTavern context not available.');
        return lines.join('\n');
    }

    // Chat summary
    const chat = result.chat;
    if (chat.available) {
        lines.push('── 聊天 ──');
        lines.push(`消息总数: ${chat.messageCount}`);
        lines.push(`角色分布: 用户=${chat.roleDistribution.user} / Assistant=${chat.roleDistribution.assistant} / System=${chat.roleDistribution.system}`);
        lines.push(`总字符数: ${chat.totalChars}`);
        if (chat.lastUserInputPreview) {
            lines.push(`最近用户输入(前80字): ${chat.lastUserInputPreview}`);
        }
        if (chat.lastAssistantOutputPreview) {
            lines.push(`最近AI回复(前80字): ${chat.lastAssistantOutputPreview}`);
        }
    } else {
        lines.push(`── 聊天 ── 不可用: ${chat.reason || 'unknown'}`);
    }

    // Character summary
    const chara = result.character;
    lines.push('');
    lines.push('── 角色 ──');
    if (chara.available) {
        lines.push(`名称: ${chara.name}`);
        lines.push(`描述: ${chara.descriptionSummary}... (共${chara.descriptionLength}字)`);
        lines.push(`性格: ${chara.personalitySummary}... (共${chara.personalityLength}字)`);
        lines.push(`场景: ${chara.scenarioSummary}... (共${chara.scenarioLength}字)`);
        lines.push(`开场白: ${chara.firstMesLength}字`);
        lines.push(`对话示例: ${chara.mesExampleLength}字`);
        lines.push(`系统提示词: ${chara.systemPromptLength}字`);
        if (chara.hasCharacterBook) {
            lines.push(`内嵌世界书: 是`);
        }
    } else {
        lines.push(`不可用: ${chara.reason || 'unknown'}`);
    }

    // Persona summary
    const persona = result.persona;
    lines.push('');
    lines.push('── 用户 Persona ──');
    if (persona.available) {
        lines.push(`用户名: ${persona.userName || '(未设置)'}`);
        lines.push(`Persona描述: ${persona.personaDescriptionSummary}... (共${persona.personaDescriptionLength}字)`);
        lines.push(`Persona数量: ${persona.personaCount}`);
    } else {
        lines.push(`不可用: ${persona.reason || 'unknown'}`);
    }

    // World info summary
    const wi = result.worldInfo;
    lines.push('');
    lines.push('── 世界书/世界信息 ──');
    if (wi.available) {
        lines.push(`来源: ${wi.source}`);
        if (wi.totalEntries !== undefined) {
            lines.push(`条目总数: ${wi.totalEntries}`);
            lines.push(`已启用: ${wi.enabledEntries}`);
            lines.push(`常驻: ${wi.constantEntries}`);
        }
        if (wi.worldName) {
            lines.push(`世界书名: ${wi.worldName}`);
        }
    } else {
        lines.push(`不可用: ${wi.reason || 'unknown'}`);
    }

    // Scenario summary
    const sc = result.scenario;
    lines.push('');
    lines.push('── Scenario ──');
    if (sc.available) {
        lines.push(`scenarioId: ${sc.scenarioId || '(未设置)'}`);
        lines.push(`world_info: ${sc.worldInfo || '(未设置)'}`);
    } else {
        lines.push(`不可用: ${sc.reason || 'unknown'}`);
    }

    return lines.join('\n');
}

/**
 * Handle refresh button click.
 */
async function handleRefreshData() {
    const ctx = getContext();
    if (!ctx) {
        $('#arr_read_status').html('<span class="arr-read-placeholder">SillyTavern context not available。</span>');
        return;
    }

    try {
        const result = await executeReadonlyScan();
        lastReadonlyResult = result;

        if (settings.debug) {
            console.log(`[${EXTENSION_NAME}] Read-only scan result:`, result);
        }

        // Format and display the summary
        const formatted = formatScanResult(result);
        $('#arr_read_status').html(`<pre class="arr-read-pre">${$('<span>').text(formatted).html()}</pre>`);

        // Timestamp
        const time = new Date(result.timestamp);
        $('#arr_read_timestamp').text(time.toLocaleTimeString());

        // Hide errors
        $('#arr_read_errors').hide();

        // Bridge input preview
        if (result.bridgeInputPreview && result.bridgeInputPreview.available !== false) {
            const previewJson = JSON.stringify(result.bridgeInputPreview, null, 2);
            $('#arr_bridge_preview_content').text(previewJson);
            $('#arr_bridge_preview').show();
        } else {
            $('#arr_bridge_preview').hide();
        }
    } catch (e) {
        const errMsg = `读取失败: ${e?.message || e}`;
        console.error(`[${EXTENSION_NAME}] ${errMsg}`);
        $('#arr_read_errors').text(errMsg).show();
        $('#arr_read_status').html('<span class="arr-read-placeholder">读取失败，详见错误区域。</span>');
    }
}

/**
 * Handle dry-run button click.
 * In I4, the browser extension cannot load TS Runtime Core directly.
 * This shows the bundle status message and current bridge input preview.
 */
async function handleDryRun() {
    const ctx = getContext();

    try {
        const bridgeInput = getBridgeInputForDryRun(lastReadonlyResult);
        const isBundleLoaded = false; // TS Runtime Core not bundled yet

        if (settings.debug) {
            console.log(`[${EXTENSION_NAME}] Dry-run button clicked. Bundle loaded: ${isBundleLoaded}`);
            console.log(`[${EXTENSION_NAME}] Bridge input source: ${bridgeInput._source}`);
        }

        // Display status
        const formatted = formatDryRunResult(null, []);
        $('#arr_dryrun_status').html(`<pre class="arr-read-pre">${$('<span>').text(formatted).html()}</pre>`);

        // Show bridge input preview
        const previewJson = JSON.stringify({
            _bundleLoaded: isBundleLoaded,
            _bundleNote: 'TS Runtime Core 尚未打包到浏览器扩展。需要在 I5 前引入 bundler。',
            _source: bridgeInput._source,
            userInputPreview: bridgeInput.userInput ? bridgeInput.userInput.substring(0, 80) : '(空)',
            userName: bridgeInput.userName || '(空)',
            chatMessageCount: (bridgeInput.chat || []).length,
            characterName: bridgeInput.character?.name || '(空)',
            worldInfoAvailable: !!bridgeInput.worldInfo,
            personaAvailable: !!bridgeInput.persona,
            scenarioId: settings.scenarioId || '(未设置)',
        }, null, 2);
        $('#arr_dryrun_output_content').text(previewJson);
        $('#arr_dryrun_output').show();

        // Timestamp
        const time = new Date();
        $('#arr_dryrun_timestamp').text(time.toLocaleTimeString());

        // Hide errors
        $('#arr_dryrun_errors').hide();
    } catch (e) {
        const errMsg = `Dry-run 失败: ${e?.message || e}`;
        console.error(`[${EXTENSION_NAME}] ${errMsg}`);
        $('#arr_dryrun_errors').text(errMsg).show();
    }
}

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

        // Refresh data button
        $html.find('#arr_refresh_data').on('click', handleRefreshData);

        // Dry-run button
        $html.find('#arr_run_dryrun').on('click', handleDryRun);

        $('#extensions_settings').append($html);

        console.log(`[${EXTENSION_NAME}] Settings pane registered (Phase I4 — dry-run hooks)`);
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] registerSettingsPane failed:`, e);
    }
}

(function () {
    function bootstrap() {
        const ctx = getContext();
        if (!ctx) {
            console.warn(`[${EXTENSION_NAME}] SillyTavern context not available`);
            return;
        }

        loadSettings(ctx);
        registerSettingsPane(ctx);

        console.log(`[${EXTENSION_NAME}] Extension loaded (Phase I4 — dry-run hooks, not intercepting generation)`);
        console.log(`[${EXTENSION_NAME}] Settings:`, JSON.stringify(settings));
    }

    if (typeof jQuery !== 'undefined') {
        jQuery(bootstrap);
    } else {
        const interval = setInterval(() => {
            if (typeof jQuery !== 'undefined') {
                clearInterval(interval);
                jQuery(bootstrap);
            }
        }, 100);
    }
})();