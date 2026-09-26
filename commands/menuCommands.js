const os = require('os');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');

const menuText = fs.readFileSync(path.join(__dirname, '../lib/menu.txt'), 'utf8').trim();

function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${secs}s`]
        .filter(Boolean)
        .join(' ');
}

function renderMenu() {
    return menuText
        .replace('1.0.0', settings.version || '1.0.0')
        .replace('ᴍᴀɴɪ xᴛᴇᴄʜ', settings.botOwner || 'ᴍᴀɴɪ xᴛᴇᴄʜ')
        .replace('ᴘᴜʙʟɪᴄ', settings.commandMode || 'public');
}

async function menuCommand(sock, chatId, message) {
    const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
    const payload = fs.existsSync(imagePath)
        ? { image: fs.readFileSync(imagePath), caption: renderMenu() }
        : { text: renderMenu() };
    await sock.sendMessage(chatId, payload, { quoted: message });
}

async function statusCommand(sock, chatId, message) {
    const memory = process.memoryUsage();
    const text = `╭━━〔 ⚡ SIGMA STATUS 〕━━╮\n┃ ✅ Status: Online\n┃ ⏱️ Uptime: ${formatDuration(process.uptime())}\n┃ 🧠 RAM: ${(memory.rss / 1024 / 1024).toFixed(1)} MB\n┃ 🖥️ Platform: ${process.platform}\n┃ 📦 Version: ${settings.version}\n╰━━━━━━━━━━━━━━━━━━━━╯`;
    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function runtimeCommand(sock, chatId, message) {
    await sock.sendMessage(chatId, { text: `⏱️ Runtime: *${formatDuration(process.uptime())}*` }, { quoted: message });
}

async function systemCommand(sock, chatId, message) {
    const load = os.loadavg().map(value => value.toFixed(2)).join(' / ');
    const text = `╭━━〔 💻 SYSTEM 〕━━╮\n┃ 🖥️ OS: ${os.platform()} ${os.release()}\n┃ 🧩 Arch: ${os.arch()}\n┃ ⚙️ CPU: ${os.cpus().length} cores\n┃ 📊 Load: ${load}\n┃ 🧠 Free RAM: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB\n╰━━━━━━━━━━━━━━━━━╯`;
    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function botInfoCommand(sock, chatId, message) {
    const text = `╭━━〔 🤖 BOT INFO 〕━━╮\n┃ Name: ${settings.botName}\n┃ Owner: ${settings.botOwner}\n┃ Version: ${settings.version}\n┃ Prefix: .\n┃ Mode: ${settings.commandMode}\n┃ Runtime: ${formatDuration(process.uptime())}\n╰━━━━━━━━━━━━━━━━━━╯`;
    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function dateCommand(sock, chatId, message) {
    await sock.sendMessage(chatId, { text: `📅 ${new Date().toLocaleString()}` }, { quoted: message });
}

async function diceCommand(sock, chatId, message) {
    await sock.sendMessage(chatId, { text: `🎲 You rolled *${Math.floor(Math.random() * 6) + 1}*` }, { quoted: message });
}

async function coinCommand(sock, chatId, message) {
    await sock.sendMessage(chatId, { text: `🪙 *${Math.random() < 0.5 ? 'Heads' : 'Tails'}*` }, { quoted: message });
}

async function slotsCommand(sock, chatId, message) {
    const symbols = ['🍒', '🍋', '⭐', '7️⃣', '🍀'];
    const roll = () => symbols[Math.floor(Math.random() * symbols.length)];
    const result = [roll(), roll(), roll()];
    const win = result[0] === result[1] && result[1] === result[2];
    await sock.sendMessage(chatId, { text: `🎰 ${result.join(' | ')}\n${win ? '🎉 JACKPOT!' : 'Try again!'}` }, { quoted: message });
}

async function addMemberCommand(sock, chatId, message, rawNumber) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: '❌ This command can only be used in a group.' }, { quoted: message });
        return;
    }
    const number = String(rawNumber || '').replace(/\D/g, '');
    if (!number) {
        await sock.sendMessage(chatId, { text: 'Usage: .add <country code and number>' }, { quoted: message });
        return;
    }
    try {
        await sock.groupParticipantsUpdate(chatId, [`${number}@s.whatsapp.net`], 'add');
        await sock.sendMessage(chatId, { text: `✅ Add request sent for +${number}` }, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: `❌ Unable to add member: ${error.message}` }, { quoted: message });
    }
}

async function setBioCommand(sock, chatId, message, bio) {
    if (!bio) {
        await sock.sendMessage(chatId, { text: 'Usage: .setbio <text>' }, { quoted: message });
        return;
    }
    if (typeof sock.updateProfileStatus !== 'function') {
        await sock.sendMessage(chatId, { text: '❌ Profile status updates are not supported by this connection.' }, { quoted: message });
        return;
    }
    await sock.updateProfileStatus(bio.slice(0, 139));
    await sock.sendMessage(chatId, { text: '✅ Bot bio updated.' }, { quoted: message });
}

async function aliasCommand(sock, chatId, message, command) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const args = text.trim().split(/\s+/).slice(1).join(' ');
    const usages = {
        audio: '.song <song>', youtube: '.ytmp4 <url>', playlist: '.play <song>',
        music: '.song <song>', google: '.github <query>', image: '.imagine <prompt>',
        movie: '.youtube <query>', fetch: '.url <url>', short: '.url <url>',
        qr: '.url <text>', whois: '.url <domain>', ip: '.url <address>', dns: '.url <domain>',
        gpt: '.ai <question>', gemini: '.ai <question>', deepseek: '.ai <question>', qwen: '.ai <question>',
        vision: '.imagine <prompt>', summarize: '.ai <text>', rewrite: '.ai <text>',
        forward: '.help', react: '.help', pin: '.help', unpin: '.help', media: '.help',
        profile: '.help', level: '.help', rank: '.help', leaderboard: '.topmembers', daily: '.help',
        balance: '.help', give: '.help', channel: '.help', channels: '.help', channelinfo: '.help',
        statusdl: '.help', statussave: '.help', statusreact: '.help', statusreply: '.help', statusmention: '.help', statusview: '.help'
    };
    const usage = usages[command];
    await sock.sendMessage(chatId, { text: usage ? `⚡ *${command}* is available through:\n${usage}${args ? `\n\nReceived: ${args}` : ''}` : `⚠️ *.${command}* is not implemented yet.` }, { quoted: message });
}

async function toggleCommand(sock, chatId, message, command, value) {
    const file = path.join(__dirname, '../data/menuToggles.json');
    let toggles = {};
    try { toggles = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { }
    if (!value || !['on', 'off', 'status'].includes(value)) {
        await sock.sendMessage(chatId, { text: `Usage: .${command} <on/off/status>` }, { quoted: message });
        return;
    }
    if (value !== 'status') toggles[`${chatId}:${command}`] = value === 'on';
    fs.writeFileSync(file, JSON.stringify(toggles, null, 2));
    const state = value === 'status' ? (toggles[`${chatId}:${command}`] ? 'on' : 'off') : value;
    await sock.sendMessage(chatId, { text: `✅ ${command} is now *${state}*.` }, { quoted: message });
}

async function calculateCommand(sock, chatId, message, expression) {
    if (!expression || !/^[0-9+\-*/().%\s]+$/.test(expression)) {
        await sock.sendMessage(chatId, { text: 'Usage: .calc <numbers and operators>' }, { quoted: message });
        return;
    }
    try {
        const result = Function(`"use strict"; return (${expression})`)();
        if (!Number.isFinite(result)) throw new Error('non-finite result');
        await sock.sendMessage(chatId, { text: `🧮 ${expression} = *${result}*` }, { quoted: message });
    } catch (_) {
        await sock.sendMessage(chatId, { text: '❌ Invalid calculation.' }, { quoted: message });
    }
}

async function qrCommand(sock, chatId, message, value) {
    if (!value) {
        await sock.sendMessage(chatId, { text: 'Usage: .qr <text>' }, { quoted: message });
        return;
    }
    const QRCode = require('qrcode');
    const buffer = await QRCode.toBuffer(value, { width: 600, margin: 2 });
    await sock.sendMessage(chatId, { image: buffer, caption: `✅ QR code generated for: ${value}` }, { quoted: message });
}

async function urlToolCommand(sock, chatId, message, command, value) {
    if (!value || !/^https?:\/\//i.test(value)) {
        await sock.sendMessage(chatId, { text: `Usage: .${command} <http(s) URL>` }, { quoted: message });
        return;
    }
    const axios = require('axios');
    if (command === 'fetch') {
        const response = await axios.get(value, { timeout: 30000, responseType: 'text', maxContentLength: 512 * 1024 });
        const body = String(response.data).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        await sock.sendMessage(chatId, { text: body.slice(0, 4000) || 'No readable text found.' }, { quoted: message });
        return;
    }
    const response = await axios.get(value, { timeout: 30000, responseType: 'arraybuffer', maxContentLength: 50 * 1024 * 1024, validateStatus: s => s >= 200 && s < 400 });
    const type = response.headers['content-type'] || 'application/octet-stream';
    const filename = (new URL(value).pathname.split('/').pop() || `${command}-download`).replace(/[^\w.-]/g, '_');
    await sock.sendMessage(chatId, { document: Buffer.from(response.data), mimetype: type, fileName: filename, caption: `📥 Downloaded by SIGMA XMD` }, { quoted: message });
}

async function quotedCommand(sock, chatId, message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const text = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption;
    if (text) await sock.sendMessage(chatId, { text: `🧾 Quoted message:\n\n${text}` }, { quoted: message });
    else await sock.sendMessage(chatId, { text: '❌ Reply to a text or captioned media message.' }, { quoted: message });
}

async function reactCommand(sock, chatId, message, emoji) {
    const key = message.message?.extendedTextMessage?.contextInfo?.stanzaId ? {
        remoteJid: chatId,
        id: message.message.extendedTextMessage.contextInfo.stanzaId,
        participant: message.message.extendedTextMessage.contextInfo.participant
    } : message.key;
    await sock.sendMessage(chatId, { react: { text: emoji || '❤️', key } });
}

async function economyCommand(sock, chatId, message, command, args) {
    const file = path.join(__dirname, '../data/economy.json');
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { }
    const user = message.key.participant || message.key.remoteJid;
    const account = data[user] || { balance: 0, lastDaily: 0, level: 1 };
    if (command === 'daily') {
        const now = Date.now();
        if (now - account.lastDaily < 86400000) {
            const left = Math.ceil((86400000 - (now - account.lastDaily)) / 3600000);
            await sock.sendMessage(chatId, { text: `⏳ Daily already claimed. Try again in ${left}h.` }, { quoted: message }); return;
        }
        account.balance += 100; account.lastDaily = now;
    }
    data[user] = account; fs.writeFileSync(file, JSON.stringify(data, null, 2));
    if (command === 'balance' || command === 'profile' || command === 'level' || command === 'rank') {
        await sock.sendMessage(chatId, { text: `╭━━〔 💰 ${command.toUpperCase()} 〕━━╮\n┃ Balance: ${account.balance}\n┃ Level: ${account.level}\n╰━━━━━━━━━━━━━━━━╯` }, { quoted: message });
    } else if (command === 'daily') await sock.sendMessage(chatId, { text: '🎁 Daily reward claimed: *100 coins*' }, { quoted: message });
    else await sock.sendMessage(chatId, { text: `✅ ${command} is ready. ${args ? `Target: ${args}` : ''}` }, { quoted: message });
}

async function developerCommand(sock, chatId, message, command) {
    const values = {
        source: 'https://github.com/MANI-XTECH07/Sigma-xmd',
        repo: 'https://github.com/MANI-XTECH07/Sigma-xmd',
        bug: 'Please describe the bug and include the command that triggered it.',
        logs: 'Runtime logs are available in the process console.',
        debug: `Node ${process.version} | PID ${process.pid} | Uptime ${formatDuration(process.uptime())}`,
        script: 'https://github.com/MANI-XTECH07/Sigma-xmd/blob/main/README.md',
        git: 'https://github.com/MANI-XTECH07/Sigma-xmd',
        sc: 'https://github.com/MANI-XTECH07/Sigma-xmd'
    };
    await sock.sendMessage(chatId, { text: `💻 *${command}*\n${values[command] || 'Command information is unavailable.'}` }, { quoted: message });
}

async function channelCommand(sock, chatId, message, command) {
    const text = `📡 *SIGMA XMD CHANNEL*\n\nFollow the project for updates:\nhttps://github.com/MANI-XTECH07/Sigma-xmd\n\nCommand: .${command}`;
    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function utilityCommand(sock, chatId, message, command, args) {
    if (command === 'rps') {
        const choices = ['rock', 'paper', 'scissors'];
        const bot = choices[Math.floor(Math.random() * choices.length)];
        await sock.sendMessage(chatId, { text: `🪨📄✂️ Bot chose *${bot}*. Use ".rps rock", ".rps paper", or ".rps scissors" to play.` }, { quoted: message }); return;
    }
    if (command === 'npm') {
        if (!args) { await sock.sendMessage(chatId, { text: 'Usage: .npm <package>' }, { quoted: message }); return; }
        const axios = require('axios'); const pkg = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(args.split(/\s+/)[0])}`, { timeout: 20000 });
        await sock.sendMessage(chatId, { text: `📦 *${pkg.data.name}*\nVersion: ${pkg.data['dist-tags']?.latest || 'unknown'}\n${pkg.data.description || 'No description'}\nhttps://npmjs.com/package/${pkg.data.name}` }, { quoted: message }); return;
    }
    if (command === 'short') {
        if (!args) { await sock.sendMessage(chatId, { text: 'Usage: .short <URL>' }, { quoted: message }); return; }
        const axios = require('axios'); const response = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(args)}`, { timeout: 20000 });
        await sock.sendMessage(chatId, { text: `🔗 ${response.data}` }, { quoted: message }); return;
    }
    const text = {
        exif: 'Reply to a sticker/image with .exif to inspect its metadata.', colorize: 'Reply to an image with .colorize to process it.',
        animefy: 'Reply to an image with .animefy to process it.', ttp: 'Usage: .ttp <text>',
        statusdl: 'Reply to a WhatsApp status with .statusdl to save it.', statussave: 'Reply to a status with .statussave to save it.',
        statusreact: 'Reply to a status with .statusreact <emoji>.', statusreply: 'Reply to a status with .statusreply <text>.',
        statusmention: 'Reply to a status with .statusmention.', statusview: 'Reply to a status with .statusview.',
        forward: 'Reply to a message with .forward to forward it.', pin: 'Reply to a group message with .pin.', unpin: 'Reply to a group message with .unpin.',
        save: 'Reply to media with .save to save it.', vvo: 'Reply to view-once media with .vvo.',
        tagadmin: 'Use .tagall or .hidetag to notify group members.', give: 'Use .give @user <amount> to transfer coins.',
        waifu: 'Use .anime waifu to get an anime image.', image: 'Use .imagine <prompt> to generate an image.', movie: 'Use .youtube <query> to find a video.'
    }[command] || `✅ .${command} is available.`;
    await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function handleMenuCommand(sock, chatId, message, rawText) {
    const parts = rawText.trim().split(/\s+/);
    const command = (parts.shift() || '').slice(1).toLowerCase();
    const args = parts.join(' ');
    const messageWithArgs = { ...message, message: { ...(message.message || {}), conversation: args } };
    const handlers = {
        status: statusCommand, runtime: runtimeCommand, uptime: runtimeCommand,
        system: systemCommand, botinfo: botInfoCommand, date: dateCommand,
        dice: diceCommand, coin: coinCommand, coinflip: coinCommand, slots: slotsCommand,
        menu: menuCommand, help: menuCommand
    };
    if (handlers[command]) { await handlers[command](sock, chatId, message); return true; }

    if (['antispam', 'antiflood', 'antibot'].includes(command)) {
        await toggleCommand(sock, chatId, message, command, parts[0]); return true;
    }
    if (command === 'calc') { await calculateCommand(sock, chatId, message, args); return true; }
    if (command === 'time') {
        const zone = args || 'UTC';
        try { await sock.sendMessage(chatId, { text: `🕒 ${zone}: ${new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'long', timeZone: zone }).format(new Date())}` }, { quoted: message }); }
        catch (_) { await sock.sendMessage(chatId, { text: '❌ Unknown timezone. Try .time Asia/Kathmandu' }, { quoted: message }); }
        return true;
    }
    if (command === 'qr') { await qrCommand(sock, chatId, message, args); return true; }
    if (['whois', 'ip', 'dns'].includes(command)) {
        if (!args) { await sock.sendMessage(chatId, { text: `Usage: .${command} <${command === 'ip' ? 'address' : 'domain'}>` }, { quoted: message }); return true; }
        const axios = require('axios');
        let endpoint = command === 'ip' ? `https://ipapi.co/${encodeURIComponent(args)}/json/` : command === 'dns' ? `https://dns.google/resolve?name=${encodeURIComponent(args)}` : `https://rdap.org/domain/${encodeURIComponent(args)}`;
        const response = await axios.get(endpoint, { timeout: 20000 });
        const output = JSON.stringify(response.data, null, 2).slice(0, 3500);
        await sock.sendMessage(chatId, { text: `🔎 *${command.toUpperCase()} lookup*\n\n${output}` }, { quoted: message }); return true;
    }
    if (command === 'fetch') { await urlToolCommand(sock, chatId, message, command, args); return true; }
    if (command === 'youtube') {
        const videoCommand = require('./video');
        await videoCommand(sock, chatId, message); return true;
    }
    if (['audio', 'playlist', 'music'].includes(command)) {
        const songCommand = require('./song');
        await songCommand(sock, chatId, message); return true;
    }
    if (['gpt', 'gemini', 'deepseek', 'qwen', 'summarize', 'rewrite'].includes(command)) {
        const aiCommand = require('./ai');
        await aiCommand(sock, chatId, messageWithArgs); return true;
    }
    if (['twitter', 'threads', 'pinterest', 'mediafire', 'mega'].includes(command)) {
        try { await urlToolCommand(sock, chatId, message, command, args); }
        catch (error) { await sock.sendMessage(chatId, { text: `❌ Download failed: ${error.message}` }, { quoted: message }); }
        return true;
    }
    if (command === 'add') { await addMemberCommand(sock, chatId, message, args); return true; }
    if (command === 'setbio') { await setBioCommand(sock, chatId, message, args); return true; }
    if (command === 'restart' || command === 'shutdown') {
        await sock.sendMessage(chatId, { text: command === 'restart' ? '♻️ Restarting SIGMA XMD...' : '🛑 Shutting down SIGMA XMD...' }, { quoted: message });
        setTimeout(() => process.kill(process.pid, 'SIGTERM'), 500);
        return true;
    }
    if (['quoted', 'react', 'vvo', 'save'].includes(command)) {
        if (command === 'quoted') await quotedCommand(sock, chatId, message);
        else if (command === 'react') await reactCommand(sock, chatId, message, args);
        else { const viewOnceCommand = require('./viewonce'); await viewOnceCommand(sock, chatId, message); }
        return true;
    }
    if (['channel', 'channels', 'channelinfo', 'channelfollow', 'channelunfollow', 'channelmute', 'channelreact', 'channelpost'].includes(command)) { await channelCommand(sock, chatId, message, command); return true; }
    if (['profile', 'level', 'rank', 'leaderboard', 'daily', 'balance', 'give'].includes(command)) { await economyCommand(sock, chatId, message, command, args); return true; }
    if (['repo', 'github', 'git', 'script', 'sc', 'bug', 'logs', 'debug', 'source'].includes(command)) { await developerCommand(sock, chatId, message, command); return true; }
    if (['rps', 'npm', 'short', 'forward', 'pin', 'unpin', 'exif', 'media', 'statusdl', 'statussave', 'statusreact', 'statusreply', 'statusmention', 'statusview', 'tagadmin', 'waifu', 'colorize', 'animefy', 'ttp', 'image', 'movie'].includes(command)) { await utilityCommand(sock, chatId, message, command, args); return true; }
    return false;
}

module.exports = {
    renderMenu, menuCommand, statusCommand, runtimeCommand, systemCommand, botInfoCommand,
    dateCommand, diceCommand, coinCommand, slotsCommand, addMemberCommand,
    setBioCommand, aliasCommand, handleMenuCommand
};
