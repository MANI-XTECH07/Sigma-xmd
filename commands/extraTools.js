const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const securityPath = path.join(__dirname, '../data/security.json');
const economyPath = path.join(__dirname, '../data/economy.json');

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function getQuoted(message) {
    return message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}
async function mediaBuffer(message) {
    const quoted = getQuoted(message) || message.message || null;
    const entries = [['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio'], ['documentMessage', 'document'], ['stickerMessage', 'sticker']];
    for (const [field, type] of entries) {
        if (!quoted?.[field]) continue;
        const stream = await downloadContentFromMessage(quoted[field], type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return { buffer: Buffer.concat(chunks), type, content: quoted[field] };
    }
    return null;
}

async function saveCommand(sock, chatId, message) {
    try {
        const media = await mediaBuffer(message);
        if (!media?.buffer?.length) throw new Error('Reply to media to save it.');
        const payload = media.type === 'image' ? { image: media.buffer, caption: media.content.caption || 'Saved media' }
            : media.type === 'video' ? { video: media.buffer, mimetype: media.content.mimetype || 'video/mp4', caption: media.content.caption || 'Saved media' }
                : media.type === 'audio' ? { audio: media.buffer, mimetype: media.content.mimetype || 'audio/mpeg', ptt: false }
                    : media.type === 'sticker' ? { sticker: media.buffer } : { document: media.buffer, mimetype: media.content.mimetype, fileName: media.content.fileName || 'saved-file' };
        await sock.sendMessage(chatId, payload, { quoted: message });
    } catch (error) { await sock.sendMessage(chatId, { text: `❌ Save failed: ${error.message}` }, { quoted: message }); }
}

async function forwardCommand(sock, chatId, message) {
    const quoted = getQuoted(message);
    if (!quoted) { await sock.sendMessage(chatId, { text: 'Reply to a message with .forward.' }, { quoted: message }); return; }
    if (typeof sock.copyNForward !== 'function') { await sock.sendMessage(chatId, { text: '❌ Forwarding is unavailable in this Baileys connection.' }, { quoted: message }); return; }
    await sock.copyNForward(chatId, { key: message.message?.extendedTextMessage?.contextInfo?.stanzaId ? { remoteJid: message.message.extendedTextMessage.contextInfo.remoteJid || chatId, id: message.message.extendedTextMessage.contextInfo.stanzaId } : message.key, message: quoted }, true);
}

async function pinCommand(sock, chatId, message, unpin = false) {
    const context = message.message?.extendedTextMessage?.contextInfo;
    const id = context?.stanzaId;
    if (!id) { await sock.sendMessage(chatId, { text: `Reply to a message with .${unpin ? 'unpin' : 'pin'}.` }, { quoted: message }); return; }
    await sock.sendMessage(chatId, { pin: { type: unpin ? 2 : 1, key: { remoteJid: chatId, id, fromMe: false, participant: context.participant } } });
    await sock.sendMessage(chatId, { text: unpin ? '✅ Message unpinned.' : '✅ Message pinned.' }, { quoted: message });
}

async function exifCommand(sock, chatId, message) {
    try {
        const media = await mediaBuffer(message);
        if (!media) throw new Error('Reply to media to inspect it.');
        const fileType = require('file-type');
        const detected = await fileType.fromBuffer(media.buffer);
        await sock.sendMessage(chatId, { text: `🧾 Media information\nType: ${media.type}\nMIME: ${detected?.mime || media.content.mimetype || 'unknown'}\nSize: ${(media.buffer.length / 1024).toFixed(1)} KB\nFilename: ${media.content.fileName || 'not provided'}` }, { quoted: message });
    } catch (error) { await sock.sendMessage(chatId, { text: `❌ EXIF inspection failed: ${error.message}` }, { quoted: message }); }
}

async function googleCommand(sock, chatId, message, query, image = false) {
    if (!query) { await sock.sendMessage(chatId, { text: `Usage: .${image ? 'image' : 'google'} <query>` }, { quoted: message }); return; }
    try {
        const endpoint = image ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}` : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await axios.get(endpoint, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
        const $ = cheerio.load(response.data);
        if (image) {
            const urls = [];
            $('img').each((_, el) => { const src = $(el).attr('src'); if (src?.startsWith('http')) urls.push(src); });
            if (!urls.length) throw new Error('No images found.');
            await sock.sendMessage(chatId, { image: { url: urls[0] }, caption: `🔎 Image result: ${query}` }, { quoted: message }); return;
        }
        const results = [];
        $('.result').each((_, el) => { const title = $(el).find('.result__title').text().trim(); const link = $(el).find('.result__a').attr('href'); const snippet = $(el).find('.result__snippet').text().trim(); if (title && link) results.push(`• ${title}\n${link}\n${snippet}`); });
        await sock.sendMessage(chatId, { text: `🔎 *Search results for ${query}*\n\n${results.slice(0, 5).join('\n\n') || 'No results found.'}` }, { quoted: message });
    } catch (error) { await sock.sendMessage(chatId, { text: `❌ Search failed: ${error.message}` }, { quoted: message }); }
}

async function waifuCommand(sock, chatId, message) {
    try { const response = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 20000 }); await sock.sendMessage(chatId, { image: { url: response.data.url }, caption: '🎌 Waifu' }, { quoted: message }); }
    catch (error) { await sock.sendMessage(chatId, { text: `❌ Waifu request failed: ${error.message}` }, { quoted: message }); }
}

async function imageTransformCommand(sock, chatId, message, mode) {
    try {
        const media = await mediaBuffer(message);
        if (!media || media.type !== 'image') throw new Error('Reply to an image.');
        const sharp = require('sharp');
        const image = sharp(media.buffer);
        const output = mode === 'colorize'
            ? await image.modulate({ saturation: 1.8, brightness: 1.08 }).tint({ r: 255, g: 210, b: 190 }).sharpen().jpeg().toBuffer()
            : await image.resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).modulate({ saturation: 1.35, brightness: 1.05 }).sharpen({ sigma: 2 }).jpeg().toBuffer();
        await sock.sendMessage(chatId, { image: output, caption: `✅ ${mode} image created by SIGMA XMD` }, { quoted: message });
    } catch (error) { await sock.sendMessage(chatId, { text: `❌ ${mode} failed: ${error.message}` }, { quoted: message }); }
}

async function visionCommand(sock, chatId, message) {
    try {
        const media = await mediaBuffer(message);
        if (!media || media.type !== 'image') throw new Error('Reply to an image.');
        const metadata = await require('sharp')(media.buffer).metadata();
        await sock.sendMessage(chatId, { text: `👁️ Image analysis\n\nFormat: ${metadata.format || 'unknown'}\nDimensions: ${metadata.width || '?'} × ${metadata.height || '?'}\nChannels: ${metadata.channels || '?'}\nSize: ${(media.buffer.length / 1024).toFixed(1)} KB` }, { quoted: message });
    } catch (error) { await sock.sendMessage(chatId, { text: `❌ Vision analysis failed: ${error.message}` }, { quoted: message }); }
}

async function tagAdminCommand(sock, chatId, message) {
    if (!chatId.endsWith('@g.us')) { await sock.sendMessage(chatId, { text: '❌ This command can only be used in a group.' }, { quoted: message }); return; }
    const metadata = await sock.groupMetadata(chatId);
    const admins = metadata.participants.filter(member => member.admin).map(member => member.id);
    if (!admins.length) { await sock.sendMessage(chatId, { text: 'No group admins found.' }, { quoted: message }); return; }
    await sock.sendMessage(chatId, { text: '🛡️ Group admins:', mentions: admins }, { quoted: message });
}

function securityCommand(sock, chatId, message, command, value) {
    const data = readJson(securityPath, {});
    if (!['on', 'off', 'status'].includes(value)) return sock.sendMessage(chatId, { text: `Usage: .${command} <on/off/status>` }, { quoted: message });
    if (value !== 'status') { data[`${chatId}:${command}`] = value === 'on'; writeJson(securityPath, data); }
    const state = data[`${chatId}:${command}`] ? 'on' : 'off';
    return sock.sendMessage(chatId, { text: `🛡️ ${command}: *${state}*` }, { quoted: message });
}

function economyData() { return readJson(economyPath, {}); }
async function economyExtended(sock, chatId, message, command, args) {
    const data = economyData(); const user = message.key.participant || message.key.remoteJid;
    const account = data[user] || { balance: 0, lastDaily: 0, xp: 0 };
    if (command === 'daily') {
        const now = Date.now();
        if (now - (account.lastDaily || 0) < 86400000) {
            const left = Math.ceil((86400000 - (now - account.lastDaily)) / 3600000);
            await sock.sendMessage(chatId, { text: `⏳ Daily already claimed. Try again in ${left}h.` }, { quoted: message }); return;
        }
        account.balance += 100; account.xp += 25; account.lastDaily = now; data[user] = account; writeJson(economyPath, data);
        await sock.sendMessage(chatId, { text: '🎁 Daily reward claimed: *100 coins* and *25 XP*.' }, { quoted: message }); return;
    }
    if (command === 'give') {
        const target = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const amount = Number(args.match(/\d+/)?.[0]);
        if (!target || !Number.isInteger(amount) || amount <= 0) { await sock.sendMessage(chatId, { text: 'Usage: .give @user <amount>' }, { quoted: message }); return; }
        if (account.balance < amount) { await sock.sendMessage(chatId, { text: '❌ Insufficient balance.' }, { quoted: message }); return; }
        const recipient = data[target] || { balance: 0, lastDaily: 0, xp: 0 }; account.balance -= amount; recipient.balance += amount; data[user] = account; data[target] = recipient; writeJson(economyPath, data);
        await sock.sendMessage(chatId, { text: `✅ Transferred ${amount} coins.` }, { quoted: message }); return;
    }
    const entries = Object.entries(data).sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0));
    if (command === 'leaderboard') { await sock.sendMessage(chatId, { text: `🏆 Leaderboard\n${entries.slice(0, 10).map(([id, v], i) => `${i + 1}. @${id.split('@')[0]} — ${v.balance || 0}`).join('\n') || 'No users yet.'}`, mentions: entries.slice(0, 10).map(([id]) => id) }, { quoted: message }); return; }
    const rank = entries.findIndex(([id]) => id === user) + 1;
    if (command === 'rank') { await sock.sendMessage(chatId, { text: `🏆 Your rank: #${rank || 1}` }, { quoted: message }); return; }
    await sock.sendMessage(chatId, { text: `💰 Balance: ${account.balance}\n⭐ XP: ${account.xp}\n🏆 Rank: #${rank || 1}` }, { quoted: message });
}

module.exports = { saveCommand, forwardCommand, pinCommand, exifCommand, googleCommand, waifuCommand, imageTransformCommand, visionCommand, tagAdminCommand, securityCommand, economyExtended };
