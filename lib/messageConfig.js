const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363411061065067@newsletter',
            newsletterName: 'ꜱɪɢᴍᴀ xᴍᴅ',
            serverMessageId: -1
        }
    }
};

/**
 * Build a formatted SIGMA XMD response while safely replacing ${name}
 * placeholders. Unknown placeholders are left untouched for easier debugging.
 */
function formatTemplate(template, values = {}) {
    return template.replace(/\$\{(\w+)\}/g, (placeholder, key) => {
        return Object.prototype.hasOwnProperty.call(values, key)
            ? String(values[key] ?? '')
            : placeholder;
    });
}

const templates = {
    songFound: `╭━━〔 🎵 SIGMA XMD 〕━━╮
┃
┃ 🎶 *SONG FOUND*
┃ 🎵 \${title}
┃ 👤 \${artist}
┃ ⏱️ \${duration}
┃
┃ 📥 Downloading audio...
┃
╰━━━━━━━━━━━━━━━━━━╯
> ⚡ SIGMA XMD`,

    ytmp3: `╭━━〔 📥 YTMP3 〕━━╮
┃
┃ 🎵 *DOWNLOADING AUDIO*
┃ 📌 \${title}
┃ 💿 Quality: \${quality}
┃ 📁 Format: MP3
┃
┃ ⏳ Please wait...
┃
╰━━━━━━━━━━━━━━━━╯`,

    ytmp4: `╭━━〔 🎬 YTMP4 〕━━╮
┃
┃ 🎥 *DOWNLOADING VIDEO*
┃ 🎬 \${title}
┃ 📺 Quality: \${quality}
┃ 📁 Format: MP4
┃
┃ 📥 Processing...
┃
╰━━━━━━━━━━━━━━━━╯`,

    downloadSuccess: `╭━━〔 ✅ SUCCESS 〕━━╮
┃
┃ 🎵 *DOWNLOAD COMPLETE*
┃ 🎶 \${title}
┃ 👤 \${artist}
┃ 💿 \${quality}
┃ 📦 \${filesize}
┃
┃ ✅ File ready!
┃
╰━━━━━━━━━━━━━━━━━━╯
> 🤖 SIGMA XMD`,

    sending: `╭━━〔 📤 SIGMA XMD 〕━━╮
┃
┃ 📤 *SENDING MEDIA...*
┃
┃ 🎵 \${title}
┃ 📦 \${filesize}
┃
┃ ⚡ Uploading to WhatsApp
┃
╰━━━━━━━━━━━━━━━━━━╯`,

    commandError: `╭━━〔 ⚠️ ERROR 〕━━╮
┃
┃ ❌ *COMMAND FAILED*
┃
┃ 🎵 \${title}
┃
┃ ⚠️ \${error}
┃
┃ 🔄 Please try again.
┃
╰━━━━━━━━━━━━━━━━━╯`,

    commandProcessing: `╭━━〔 ⚡ SIGMA XMD 〕━━╮
┃
┃ ⚙️ *PROCESSING COMMAND*
┃
┃ 👤 User: \${user}
┃ 🔧 Command: \${command}
┃
┃ ⏳ Please wait...
┃
╰━━━━━━━━━━━━━━━━━━╯`,

    commandSuccess: `╭━━〔 ✅ SIGMA XMD 〕━━╮
┃
┃ ✅ *COMMAND EXECUTED*
┃
┃ 🔧 Command: \${command}
┃ ⏱️ Time: \${time}
┃
┃ 🚀 Operation completed!
┃
╰━━━━━━━━━━━━━━━━━━╯`,

    adminCommand: `╭━━〔 🛡️ ADMIN 〕━━╮
┃
┃ 🔐 *ADMIN COMMAND*
┃
┃ ⚙️ Command: \${command}
┃ 👤 Admin: \${user}
┃
┃ ✅ Successfully executed.
┃
╰━━━━━━━━━━━━━━━━━╯
> 👑 SIGMA XMD`,

    noPermission: `╭━━〔 🚫 ACCESS DENIED 〕━━╮
┃
┃ ❌ *PERMISSION REQUIRED*
┃
┃ 🔧 Command: \${command}
┃
┃ 👑 This command is restricted
┃    to group admins/owner.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯`,

    cooldown: `╭━━〔 ⏳ COOLDOWN 〕━━╮
┃
┃ ⚠️ *SLOW DOWN*
┃
┃ 🔧 Command: \${command}
┃ ⏱️ Try again in: \${time}
┃
╰━━━━━━━━━━━━━━━━━╯`
};

const messages = Object.fromEntries(
    Object.entries(templates).map(([name, template]) => [
        name,
        values => formatTemplate(template, values)
    ])
);

module.exports = {
    channelInfo,
    formatTemplate,
    templates,
    messages
};
