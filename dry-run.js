/**
 * Agent RP Runtime — Dry-Run UI Hooks
 * Phase I4: Runtime dry-run UI. Shows dry-run buttons and result display area.
 *
 * IMPORTANT: This file runs in the browser extension context.
 * The TypeScript Runtime Core is NOT bundled into the extension yet.
 * Dry-run execution happens via Node.js test suite.
 *
 * This file provides:
 * - UI hook for the "运行 Runtime Dry-run" button
 * - Status display showing "runtime bundle not loaded" or actual preview
 * - Result area for displaying dry-run output
 *
 * Does NOT:
 * - Import TypeScript runtime code
 * - Call real model API
 * - Write back to chat
 * - Persist state
 */

const EXTENSION_NAME = 'Agent RP Runtime';
const DRY_RUN_TAG = '[Dry-Run]';

/**
 * Get the current bridge input preview from the readonly reader's last scan.
 * Falls back to a placeholder if no scan data is available.
 * @param {object|null} lastReadonlyResult - Result from previous readonly scan
 * @returns {object} Bridge input for dry-run
 */
function getBridgeInputForDryRun(lastReadonlyResult) {
    if (!lastReadonlyResult?.bridgeInputPreview) {
        return {
            userInput: '',
            userName: '',
            chat: [],
            character: null,
            worldInfo: null,
            persona: null,
            isRegeneration: false,
            _source: 'placeholder (no scan data)',
        };
    }

    const bp = lastReadonlyResult.bridgeInputPreview;
    return {
        userInput: bp.lastUserInput || '',
        userName: bp.userName || '',
        chat: bp._rawChat || [],
        character: bp._rawCharacter || null,
        worldInfo: bp._rawWorldEntries || null,
        persona: bp._rawPersona || null,
        isRegeneration: false,
        _source: 'readonly scan (I3)',
    };
}

/**
 * Format dry-run result for display.
 * @param {object|null} result - Dry-run result or null
 * @param {Array<string>} errors - Error messages
 * @returns {string} Formatted display text
 */
function formatDryRunResult(result, errors) {
    const lines = [];

    if (errors.length > 0) {
        lines.push('!! 错误 !!');
        for (const err of errors) {
            lines.push(`  ${err}`);
        }
        lines.push('');
    }

    if (!result) {
        lines.push('Runtime bundle not loaded.');
        lines.push('');
        lines.push('Dry-run 需要将 TypeScript Runtime Core 打包为浏览器可加载的 JS。');
        lines.push('当前阶段 (I4):');
        lines.push('  - Dry-run adapter 已在 Node/测试层实现');
        lines.push('  - 浏览器扩展显示 UI 钩子和占位信息');
        lines.push('  - 后续 I5 需要引入 bundler (esbuild/Rollup)');
        lines.push('    将 TS runtime 打包为 browser-safe JS');
        lines.push('');
        lines.push('可以通过 Node.js 运行 dry-run 测试来验证 pipeline:');
        lines.push('  npm test  # tests/sillytavern-runtime-dry-run.test.ts');
        return lines.join('\n');
    }

    lines.push(`Scenario: ${result.scenarioId || '(未设置)'}`);
    lines.push(`用户输入预览: ${result.userInputPreview || '(空)'}`);
    lines.push(`总消息数 (turn history): ${result.messageCount}`);
    lines.push(`didWriteBack: ${result.didWriteBack}`);
    lines.push('');

    // Planning output
    lines.push('── 规划输出 ──');
    lines.push(`叙事方向: ${(result.plannedOutput?.narrativeDirection || '').substring(0, 100)}`);
    lines.push(`场景设定: ${(result.plannedOutput?.sceneSetting || '').substring(0, 100)}`);
    lines.push(`基调: ${result.plannedOutput?.tone || ''}  节奏: ${result.plannedOutput?.pacing || ''}`);
    lines.push(`关键点: ${(result.plannedOutput?.keyPoints || []).length} 条`);
    lines.push('');

    // Rendered response
    lines.push('── 输出预览 ──');
    const preview = result.renderedResponsePreview || '(空输出)';
    lines.push(preview.substring(0, 200));
    lines.push(`(共 ${result.renderedResponseLength || 0} 字)`);
    lines.push('');

    // State panel
    if (result.statePanelPreview) {
        lines.push('── 状态面板 ──');
        lines.push(result.statePanelPreview.substring(0, 200));
        lines.push('');
    }

    // Validation
    const vr = result.validationResult;
    if (vr) {
        lines.push(`── 校验结果 — ${vr.passed ? '全部通过' : '有警告/错误'} ──`);
        if (vr.checks && vr.checks.length > 0) {
            for (const c of vr.checks) {
                const icon = c.passed ? 'OK' : '!!';
                lines.push(`  [${icon}] ${c.rule}: ${c.message}`);
            }
        }
        lines.push('');
    }

    // State changes
    const changes = result.proposedStateChanges || [];
    if (changes.length > 0) {
        const applied = changes.filter(c => c.accepted);
        const rejected = changes.filter(c => !c.accepted);
        lines.push(`── 状态变更 — 应用 ${applied.length} 项，拒绝 ${rejected.length} 项 ──`);
        for (const c of applied) {
            lines.push(`  [+] ${c.type}: ${c.reason || ''}`);
        }
        for (const c of rejected) {
            lines.push(`  [-] ${c.type}: ${c.reason || ''} (${c.rejectReason || 'rejected'})`);
        }
        lines.push('');
    }

    // Warnings
    if (result.warnings && result.warnings.length > 0) {
        lines.push('── 警告 ──');
        for (const w of result.warnings) {
            lines.push(`  ${w}`);
        }
        lines.push('');
    }

    // Errors
    if (errors.length > 0) {
        lines.push('── 错误 ──');
        for (const e of errors) {
            lines.push(`  ${e}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// Export for use in index.js and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getBridgeInputForDryRun,
        formatDryRunResult,
    };
}
