/**
 * Agent RP Runtime — Read-Only Data Reader
 * Phase I3: Read-only access to SillyTavern context data.
 *
 * Does NOT:
 * - Intercept generation
 * - Listen to CHAT_COMPLETION_PROMPT_READY / GENERATION_ENDED
 * - Write back messages
 * - Call model API
 * - Log full private chat content
 */

const EXTENSION_NAME = 'Agent RP Runtime';

/**
 * Safely get SillyTavern extension context.
 * @returns {object|null}
 */
function safeGetContext() {
    try {
        return SillyTavern.getContext();
    } catch {
        return null;
    }
}

/**
 * Read summary of current chat.
 * @param {object} ctx - SillyTavern context
 * @returns {object} Chat summary with count, role distribution, previews
 */
function readChatSummary(ctx) {
    if (!ctx?.chat || !Array.isArray(ctx.chat)) {
        return { available: false, messageCount: 0, reason: 'chat not available' };
    }

    try {
        const chat = ctx.chat;
        let userCount = 0;
        let assistantCount = 0;
        let systemCount = 0;
        let otherCount = 0;
        let totalChars = 0;
        let lastUserInput = '';
        let lastAssistantOutput = '';
        let lastUserIndex = -1;
        let lastAssistantIndex = -1;

        for (let i = 0; i < chat.length; i++) {
            const msg = chat[i];
            const text = msg?.mes ?? '';
            totalChars += text.length;

            const isUser = msg?.is_user === true || msg?.role === 'user';
            if (isUser) {
                userCount++;
                lastUserIndex = i;
                lastUserInput = text;
            } else if (msg?.role === 'system') {
                systemCount++;
            } else {
                assistantCount++;
                lastAssistantIndex = i;
                lastAssistantOutput = text;
            }
        }

        return {
            available: true,
            messageCount: chat.length,
            roleDistribution: { user: userCount, assistant: assistantCount, system: systemCount, other: otherCount },
            totalChars,
            avgMessageChars: chat.length > 0 ? Math.round(totalChars / chat.length) : 0,
            lastUserInputPreview: lastUserInput ? lastUserInput.substring(0, 80) : '',
            lastUserInputLength: lastUserInput.length,
            lastAssistantOutputPreview: lastAssistantOutput ? lastAssistantOutput.substring(0, 80) : '',
            lastAssistantOutputLength: lastAssistantOutput.length,
        };
    } catch (e) {
        return { available: false, messageCount: 0, reason: `read failed: ${e.message}` };
    }
}

/**
 * Read current character card summary.
 * @param {object} ctx - SillyTavern context
 * @returns {object} Character summary
 */
function readCharacterSummary(ctx) {
    try {
        const charId = ctx?.characterId;
        if (charId == null) {
            return { available: false, reason: 'no character selected' };
        }

        const card = ctx?.characters?.[charId];
        if (!card) {
            return { available: false, reason: 'character card not found' };
        }

        const data = card.data || {};
        const name = data.name || card.name || '未知角色';
        const description = data.description || card.description || '';
        const personality = data.personality || card.personality || '';
        const scenario = data.scenario || card.scenario || '';
        const firstMes = data.first_mes || card.first_mes || '';
        const mesExample = data.mes_example || card.mes_example || '';
        const systemPrompt = data.system_prompt || '';
        const postHistoryInstructions = data.post_history_instructions || '';
        const tags = data.tags || card.tags || [];
        const creatorNotes = data.creator_notes || card.creator_notes || '';

        return {
            available: true,
            name,
            descriptionSummary: description.substring(0, 100),
            descriptionLength: description.length,
            personalitySummary: personality.substring(0, 100),
            personalityLength: personality.length,
            scenarioSummary: scenario.substring(0, 100),
            scenarioLength: scenario.length,
            firstMesLength: firstMes.length,
            mesExampleLength: mesExample.length,
            systemPromptLength: systemPrompt.length,
            postHistoryInstructionsLength: postHistoryInstructions.length,
            tagsCount: tags.length,
            creatorNotesLength: creatorNotes.length,
            hasCharacterBook: !!(data.character_book || card.character_book),
        };
    } catch (e) {
        return { available: false, reason: `read failed: ${e.message}` };
    }
}

/**
 * Read user persona summary.
 * @param {object} ctx - SillyTavern context
 * @returns {object} User persona summary
 */
function readUserPersonaSummary(ctx) {
    try {
        const pu = ctx?.powerUserSettings;
        const userName = ctx?.name1 || '';

        if (!pu) {
            return { available: false, reason: 'powerUserSettings not available' };
        }

        let personaDescription = pu.persona_description || '';
        if (!personaDescription) {
            try {
                const avatarBlock = document.querySelector('#user_avatar_block');
                const selected = avatarBlock?.querySelector('.avatar-container.selected');
                const avatarId = selected?.getAttribute('data-avatar-id') || pu.default_persona || null;
                if (avatarId && pu.persona_descriptions?.[avatarId]?.description) {
                    personaDescription = pu.persona_descriptions[avatarId].description;
                }
            } catch {
                // DOM access failed, use available data
            }
        }

        if (typeof ctx?.substituteParams === 'function' && personaDescription) {
            try {
                personaDescription = ctx.substituteParams(personaDescription);
            } catch {
                // ignore substitute failure
            }
        }

        const personaCount = pu.personas ? Object.keys(pu.personas).length : 0;

        return {
            available: true,
            userName,
            personaDescriptionSummary: personaDescription.substring(0, 100),
            personaDescriptionLength: personaDescription.length,
            personaCount,
        };
    } catch (e) {
        return { available: false, reason: `read failed: ${e.message}` };
    }
}

/**
 * Read world book / world info summary.
 * Tries character_card embedded world book first, then separate world book.
 * @param {object} ctx - SillyTavern context
 * @returns {object} World info summary
 */
function readWorldInfoSummary(ctx) {
    try {
        const charId = ctx?.characterId;
        const card = charId != null ? ctx?.characters?.[charId] : null;
        const charBook = card?.data?.character_book;

        if (charBook?.entries) {
            const entries = Object.values(charBook.entries);
            let enabledCount = 0;
            let constantCount = 0;
            const positions = {};

            for (const e of entries) {
                const enabled = !(e.disable === true || e.enabled === false);
                if (enabled) enabledCount++;
                if (e.constant) constantCount++;
                const pos = e.position ?? 0;
                positions[pos] = (positions[pos] || 0) + 1;
            }

            return {
                available: true,
                source: 'character_card',
                totalEntries: entries.length,
                enabledEntries: enabledCount,
                constantEntries: constantCount,
                positionDistribution: positions,
            };
        }

        // Try separate world book
        const worldName = card?.data?.extensions?.world || card?.extensions?.world || ctx?.chatMetadata?.world_info || '';
        if (worldName && typeof ctx?.loadWorldInfo === 'function') {
            return {
                available: true,
                source: 'world_book',
                worldName,
                note: 'use async readWorldInfoDetail() for full data',
            };
        }

        return { available: false, reason: 'no world info found' };
    } catch (e) {
        return { available: false, reason: `read failed: ${e.message}` };
    }
}

/**
 * Read detailed world info from a named world book (async).
 * @param {object} ctx - SillyTavern context
 * @returns {Promise<object>} Detailed world info
 */
async function readWorldInfoDetail(ctx) {
    try {
        const charId = ctx?.characterId;
        const card = charId != null ? ctx?.characters?.[charId] : null;

        // Card embedded
        const charBook = card?.data?.character_book;
        if (charBook?.entries) {
            const entries = Object.values(charBook.entries);
            return {
                available: true,
                source: 'character_card',
                totalEntries: entries.length,
                entriesSummary: entries.map((e, i) => ({
                    index: i,
                    comment: (e.comment || '').substring(0, 40),
                    keys: (e.key || e.keys || []).slice(0, 3),
                    enable: !(e.disable === true || e.enabled === false),
                    constant: !!e.constant,
                    position: e.position ?? 0,
                    contentLength: (e.content || '').length,
                })),
            };
        }

        // Separate world book
        const worldName = card?.data?.extensions?.world || card?.extensions?.world || ctx?.chatMetadata?.world_info || '';
        if (worldName && typeof ctx?.loadWorldInfo === 'function') {
            const data = await ctx.loadWorldInfo(worldName);
            if (data?.entries) {
                const entries = Object.values(data.entries);
                return {
                    available: true,
                    source: 'world_book',
                    worldName,
                    totalEntries: entries.length,
                    entriesSummary: entries.map((e, i) => ({
                        index: i,
                        comment: (e.comment || '').substring(0, 40),
                        keys: (e.key || e.keys || []).slice(0, 3),
                        enable: !(e.disable === true || e.enabled === false),
                        constant: !!e.constant,
                        position: e.position ?? 0,
                        contentLength: (e.content || '').length,
                    })),
                };
            }
        }

        return { available: false, reason: 'no world info data' };
    } catch (e) {
        return { available: false, reason: `read failed: ${e.message}` };
    }
}

/**
 * Read scenarioId and chat metadata.
 * @param {object} ctx - SillyTavern context
 * @returns {object} Scenario and metadata summary
 */
function readScenarioSummary(ctx) {
    try {
        const metadata = ctx?.chatMetadata || {};
        return {
            available: true,
            scenarioId: metadata.scenario || '',
            worldInfo: metadata.world_info || '',
            characterId: ctx?.characterId,
        };
    } catch (e) {
        return { available: false, reason: `read failed: ${e.message}` };
    }
}

/**
 * Build a bridge input preview from current SillyTavern data.
 * Mimics the structure of SillyTavernBridgeInput from TS types.
 * @param {object} ctx - SillyTavern context
 * @returns {object} Bridge input preview
 */
function buildBridgeInputPreview(ctx) {
    try {
        const charId = ctx?.characterId;
        const card = charId != null ? ctx?.characters?.[charId] : null;
        const data = card?.data || card || {};
        const pu = ctx?.powerUserSettings || {};

        const chat = ctx?.chat || [];
        // Find last user message
        let userInput = '';
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i]?.is_user === true || chat[i]?.role === 'user') {
                userInput = chat[i].mes || '';
                break;
            }
        }

        const preview = {
            userInputPreview: userInput.substring(0, 80),
            userInputLength: userInput.length,
            userName: ctx?.name1 || '',
            chatMessageCount: chat.length,
            character: {
                name: data.name || card?.name || '未知角色',
                hasDescription: !!(data.description || card?.description),
                hasPersonality: !!(data.personality || card?.personality),
                hasScenario: !!(data.scenario || card?.scenario),
            },
            worldInfoAvailable: !!card?.data?.character_book?.entries || !!ctx?.chatMetadata?.world_info,
            personaAvailable: !!pu.persona_description || !!pu.persona_descriptions,
            isRegeneration: false,
        };

        return preview;
    } catch (e) {
        return { available: false, reason: `build failed: ${e.message}` };
    }
}

/**
 * Execute full read-only scan and return all summaries.
 * @returns {Promise<object>} All summaries
 */
async function executeReadonlyScan() {
    const ctx = safeGetContext();
    if (!ctx) {
        return {
            ctxAvailable: false,
            error: 'SillyTavern context not available',
            timestamp: Date.now(),
        };
    }

    const chatSummary = readChatSummary(ctx);
    const characterSummary = readCharacterSummary(ctx);
    const personaSummary = readUserPersonaSummary(ctx);
    const worldInfoSummary = readWorldInfoSummary(ctx);
    const scenarioSummary = readScenarioSummary(ctx);
    const bridgeInputPreview = buildBridgeInputPreview(ctx);

    return {
        ctxAvailable: true,
        timestamp: Date.now(),
        chat: chatSummary,
        character: characterSummary,
        persona: personaSummary,
        worldInfo: worldInfoSummary,
        scenario: scenarioSummary,
        bridgeInputPreview: bridgeInputPreview,
    };
}

// Export for use in index.js and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        safeGetContext,
        readChatSummary,
        readCharacterSummary,
        readUserPersonaSummary,
        readWorldInfoSummary,
        readWorldInfoDetail,
        readScenarioSummary,
        buildBridgeInputPreview,
        executeReadonlyScan,
    };
}
