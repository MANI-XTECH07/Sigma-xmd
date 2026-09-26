const yts = require('yt-search');
const axios = require('axios');

async function playCommand(sock, chatId, message) {
    try {
        // ===== Get text from any message type =====
        const msg = message.message;
        const text =
            msg?.conversation ||
            msg?.extendedTextMessage?.text ||
            msg?.imageMessage?.caption ||
            msg?.videoMessage?.caption ||
            '';

        const searchQuery = text.split(' ').slice(1).join(' ').trim();

        if (!searchQuery) {
            return await sock.sendMessage(chatId, {
                text: '🎵 *Please provide a song name.*\n\nExample:\n.play Saiyaara'
            }, { quoted: message });
        }

        // ===== Search YouTube =====
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '❌ *No results found for:* ' + searchQuery
            }, { quoted: message });
        }

        const video = videos[0];

        // ===== Loading message =====
        await sock.sendMessage(chatId, {
            text: '⏳ _Please wait, your song is downloading..._'
        }, { quoted: message });

        // ===== Call API (properly encoded) =====
        const apiUrl = `https://api.azbry.com/api/download/ytmp3?url=${encodeURIComponent(video.url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 60000 });

        if (!data || !data.status || !data.result || !data.result.download) {
            return await sock.sendMessage(chatId, {
                text: '❌ *Failed to fetch audio.* Please try again later.'
            }, { quoted: message });
        }

        const result = data.result;
        const audioUrl = result.download;
        const title = result.title || video.title;
        const thumbnail = result.thumbnail || video.thumbnail;
        const duration = result.duration
            ? `${Math.floor(result.duration / 60)}:${String(result.duration % 60).padStart(2, '0')}`
            : video.timestamp;

        // ===== Send thumbnail + details =====
        const caption =
            `🎵 *${title}*\n\n` +
            `⏱️ *Duration:* ${duration}\n` +
            `📺 *Channel:* ${video.author?.name || 'Unknown'}\n` +
            `🔗 *URL:* ${video.url}\n\n` +
            `> _Downloading audio..._`;

        await sock.sendMessage(chatId, {
            image: { url: thumbnail },
            caption
        }, { quoted: message });

        // ===== Send audio (direct) =====
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            fileName: `${title.replace(/[^\w\s.-]/gi, '')}.mp3`,
            ptt: false
        }, { quoted: message });

    } catch (error) {
        console.error('❌ Error in .play command:', error?.message || error);
        await sock.sendMessage(chatId, {
            text: '❌ *Download failed.* Please try again later.'
        }, { quoted: message });
    }
}

module.exports = playCommand;

/* Powered by ꜱɪɢᴍᴀ xᴍᴅ
 * Credits: Keith MD | Fixed by Azbry API */
