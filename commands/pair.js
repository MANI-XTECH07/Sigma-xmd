'use strict';

async function pairCommand(sock, chatId, message, query) {
    const siteUrl = process.env.PAIRING_SITE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const text = query
        ? `Open the SIGMA XMD pairing portal to generate a code for your number:\n\n${siteUrl}\n\nUse the full international number with country code, digits only.`
        : `Pair SIGMA XMD with WhatsApp:\n\n${siteUrl}\n\nUse the full international number with country code, digits only.\nExample: .pair 15551234567`;

    await sock.sendMessage(chatId, {
        text,
        contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363411061065067@newsletter',
                newsletterName: 'ꜱɪɢᴍᴀ xᴍᴅ',
                serverMessageId: -1
            }
        }
    }, { quoted: message });
}

module.exports = pairCommand;
