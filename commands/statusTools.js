const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function unwrap(message) {
    return message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message || {};
}

function getContext(message) {
    const root = unwrap(message?.message);
    const context = root.extendedTextMessage?.contextInfo || root.imageMessage?.contextInfo || root.videoMessage?.contextInfo || {};
    const quoted = unwrap(context.quotedMessage);
    const participant = context.participant || context.remoteJid;
    const key = context.stanzaId ? {
        remoteJid: context.remoteJid || 'status@broadcast',
        id: context.stanzaId,
        participant
    } : null;
    return { context, quoted, key, participant };
}

async function toBuffer(content, type) {
    const stream = await downloadContentFromMessage(content, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function sendStatusMedia(sock, chatId, message) {
    const { quoted } = getContext(message);
    const media = unwrap(quoted);
    const entry = media.imageMessage ? ['imageMessage', 'image']
        : media.videoMessage ? ['videoMessage', 'video']
            : media.audioMessage ? ['audioMessage', 'audio']
                : media.documentMessage ? ['documentMessage', 'document'] : null;
    if (!entry) throw new Error('Reply to an image, video, audio, or document status.');
    const [field, type] = entry;
    const content = media[field];
    const buffer = await toBuffer(content, type);
    if (!buffer.length) throw new Error('The status media was empty or expired.');
    const payload = type === 'image' ? { image: buffer, caption: content.caption || 'Downloaded status' }
        : type === 'video' ? { video: buffer, mimetype: content.mimetype || 'video/mp4', caption: content.caption || 'Downloaded status' }
            : type === 'audio' ? { audio: buffer, mimetype: content.mimetype || 'audio/mpeg', ptt: false }
                : { document: buffer, mimetype: content.mimetype || 'application/octet-stream', fileName: content.fileName || 'status-file' };
    await sock.sendMessage(chatId, payload, { quoted: message });
}

async function statusToolCommand(sock, chatId, message, rawText) {
    const [command, ...rest] = rawText.trim().split(/\s+/);
    const args = rest.join(' ').trim();
    const name = command.slice(1).toLowerCase();
    try {
        const { key, participant } = getContext(message);
        if (['statusdl', 'statussave'].includes(name)) {
            await sendStatusMedia(sock, chatId, message);
        } else if (name === 'statusview') {
            if (!key) throw new Error('Reply to a status message first.');
            await sock.readMessages([key]);
            await sock.sendMessage(chatId, { text: '✅ Status marked as viewed.' }, { quoted: message });
        } else if (name === 'statusreact') {
            if (!key) throw new Error('Reply to a status message first.');
            const emoji = args || '❤️';
            await sock.relayMessage('status@broadcast', { reactionMessage: { key, text: emoji } }, {
                messageId: key.id,
                statusJidList: [participant || key.participant].filter(Boolean)
            });
            await sock.sendMessage(chatId, { text: `✅ Reacted to the status with ${emoji}` }, { quoted: message });
        } else if (name === 'statusreply') {
            if (!participant || participant === 'status@broadcast') throw new Error('Reply to a status message first.');
            if (!args) throw new Error('Usage: .statusreply <text>');
            await sock.sendMessage(participant, { text: args });
            await sock.sendMessage(chatId, { text: '✅ Status reply sent privately.' }, { quoted: message });
        } else if (name === 'statusmention') {
            const mentions = (args.match(/\d{7,15}/g) || []).map(number => `${number}@s.whatsapp.net`);
            if (!mentions.length) throw new Error('Usage: .statusmention <number> <text>');
            const text = args.replace(/\d{7,15}/g, '').trim() || 'Mentioned in SIGMA XMD status';
            await sock.sendMessage('status@broadcast', { text, mentions }, { statusJidList: mentions });
            await sock.sendMessage(chatId, { text: '✅ Status mention published.' }, { quoted: message });
        } else {
            throw new Error('Unknown status command.');
        }
    } catch (error) {
        await sock.sendMessage(chatId, { text: `❌ ${error.message}` }, { quoted: message });
    }
}

module.exports = { statusToolCommand, getContext, sendStatusMedia };
