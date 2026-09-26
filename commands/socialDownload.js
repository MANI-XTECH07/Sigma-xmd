const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    Accept: '*/*'
};

const providers = {
    twitter: [
        'https://api.vreden.my.id/api/downloader/twitter?url=',
        'https://api.ootaizumi.web.id/downloader/twitter?url='
    ],
    threads: [
        'https://api.vreden.my.id/api/downloader/threads?url=',
        'https://api.ootaizumi.web.id/downloader/threads?url='
    ],
    pinterest: [
        'https://api.vreden.my.id/api/downloader/pinterest?url=',
        'https://api.ootaizumi.web.id/downloader/pinterest?url='
    ],
    mediafire: [
        'https://api.vreden.my.id/api/downloader/mediafire?url=',
        'https://api.ootaizumi.web.id/downloader/mediafire?url='
    ],
    mega: [
        'https://api.vreden.my.id/api/downloader/mega?url=',
        'https://api.ootaizumi.web.id/downloader/mega?url='
    ]
};

function extractUrl(text) {
    return text.match(/https?:\/\/\S+/i)?.[0]?.replace(/[)>\]}]+$/, '');
}

function collectUrls(value, output = []) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) output.push(value);
    else if (Array.isArray(value)) value.forEach(item => collectUrls(item, output));
    else if (value && typeof value === 'object') Object.values(value).forEach(item => collectUrls(item, output));
    return [...new Set(output)];
}

function selectMediaUrl(urls) {
    return urls.find(url => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) ||
        urls.find(url => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) || urls[0];
}

async function resolveMediafire(url) {
    const response = await axios.get(url, { headers: DEFAULT_HEADERS, timeout: 30000, maxContentLength: 5 * 1024 * 1024 });
    const $ = cheerio.load(response.data);
    const candidates = [];
    $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (href && (/download/i.test(href) || /download/i.test($(element).text()))) candidates.push(new URL(href, url).href);
    });
    const direct = selectMediaUrl(candidates);
    if (!direct) throw new Error('No MediaFire download link found.');
    return { url: direct, title: $('title').text().trim() || 'MediaFire file' };
}

async function resolveFromProviders(type, url) {
    if (type === 'mediafire') {
        try { return await resolveMediafire(url); } catch (error) { console.warn('[mediafire] page resolver:', error.message); }
    }
    const errors = [];
    for (const endpoint of providers[type] || []) {
        try {
            const response = await axios.get(endpoint + encodeURIComponent(url), { headers: DEFAULT_HEADERS, timeout: 25000, validateStatus: s => s >= 200 && s < 500 });
            const mediaUrl = selectMediaUrl(collectUrls(response.data));
            if (mediaUrl && mediaUrl !== url) return { url: mediaUrl, title: response.data?.title || response.data?.data?.title || `${type} download` };
            errors.push(`${endpoint}: no media URL`);
        } catch (error) { errors.push(`${endpoint}: ${error.message}`); }
    }
    if (/\.(mp4|mov|webm|m4v|jpe?g|png|gif|webp|mp3)(\?|$)/i.test(url)) return { url, title: `${type} download` };
    throw new Error(`All ${type} download providers failed (${errors.join('; ')})`);
}

async function socialDownloadCommand(sock, chatId, message) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const type = text.trim().split(/\s+/)[0].slice(1).toLowerCase();
    const url = extractUrl(text);
    if (!url) {
        await sock.sendMessage(chatId, { text: `Usage: .${type} <URL>` }, { quoted: message });
        return;
    }
    try {
        await sock.sendMessage(chatId, { react: { text: '⬇️', key: message.key } });
        const result = await resolveFromProviders(type, url);
        const response = await axios.get(result.url, { headers: DEFAULT_HEADERS, responseType: 'arraybuffer', timeout: 90000, maxContentLength: 100 * 1024 * 1024, validateStatus: s => s >= 200 && s < 400 });
        const buffer = Buffer.from(response.data);
        if (!buffer.length) throw new Error('The downloader returned an empty file.');
        const contentType = response.headers['content-type'] || '';
        const isImage = /image\//i.test(contentType) || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(result.url);
        const isAudio = /audio\//i.test(contentType) || /\.mp3(\?|$)/i.test(result.url);
        const payload = isImage ? { image: buffer, caption: `✅ ${result.title}\n> SIGMA XMD` }
            : isAudio ? { audio: buffer, mimetype: contentType || 'audio/mpeg', fileName: `${type}.mp3` }
                : { video: buffer, mimetype: contentType || 'video/mp4', fileName: `${type}.mp4`, caption: `✅ ${result.title}\n> SIGMA XMD` };
        await sock.sendMessage(chatId, payload, { quoted: message });
    } catch (error) {
        await sock.sendMessage(chatId, { text: `❌ ${type} download failed:\n${error.message}` }, { quoted: message });
    }
}

module.exports = { socialDownloadCommand, resolveFromProviders, extractUrl };
