const CHANNEL_JID = '120363411061065067@newsletter';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbCj1sTJP20vesyszN3z';

function channelTarget(rawText) {
    const parts = rawText.trim().split(/\s+/);
    return parts.slice(1).join(' ').trim();
}

async function channelCommand(sock, chatId, message, rawText) {
    const command = rawText.trim().split(/\s+/)[0].slice(1).toLowerCase();
    const arg = channelTarget(rawText);
    try {
        if (command === 'channel' || command === 'channels' || command === 'channelinfo') {
            let details = `Name: SIGMA XMD\nChannel JID: ${CHANNEL_JID}`;
            if (typeof sock.newsletterMetadata === 'function') {
                const metadata = await sock.newsletterMetadata('jid', CHANNEL_JID);
                const subscribers = typeof sock.newsletterSubscribers === 'function'
                    ? await sock.newsletterSubscribers(CHANNEL_JID) : null;
                details = `Name: ${metadata?.name || 'SIGMA XMD'}\nDescription: ${metadata?.description || 'SIGMA XMD updates'}\nSubscribers: ${subscribers?.subscribers ?? 'unknown'}\nChannel JID: ${CHANNEL_JID}`;
            }
            await sock.sendMessage(chatId, { text: `📡 *SIGMA XMD CHANNEL*\n\n${details}\nLink: ${CHANNEL_LINK}` }, { quoted: message });
            return;
        }
        if (command === 'channelfollow') {
            if (typeof sock.newsletterFollow !== 'function') throw new Error('This Baileys version does not support channel follow.');
            await sock.newsletterFollow(CHANNEL_JID);
            await sock.sendMessage(chatId, { text: '✅ SIGMA XMD channel followed.' }, { quoted: message });
            return;
        }
        if (command === 'channelunfollow') {
            if (typeof sock.newsletterUnfollow !== 'function') throw new Error('This Baileys version does not support channel unfollow.');
            await sock.newsletterUnfollow(CHANNEL_JID);
            await sock.sendMessage(chatId, { text: '✅ SIGMA XMD channel unfollowed.' }, { quoted: message });
            return;
        }
        if (command === 'channelmute') {
            if (typeof sock.newsletterMute !== 'function') throw new Error('This Baileys version does not support channel mute.');
            await sock.newsletterMute(CHANNEL_JID);
            await sock.sendMessage(chatId, { text: '✅ SIGMA XMD channel muted.' }, { quoted: message });
            return;
        }
        if (command === 'channelreact') {
            const quoted = message.message?.extendedTextMessage?.contextInfo;
            const tokens = arg.split(/\s+/).filter(Boolean);
            const messageId = quoted?.stanzaId || tokens[0];
            const emoji = quoted ? (tokens[0] || '❤️') : (tokens[1] || '❤️');
            if (!messageId) throw new Error('Reply to a channel post or provide its message ID.');
            if (typeof sock.newsletterReactMessage !== 'function') throw new Error('This Baileys version does not support channel reactions.');
            await sock.newsletterReactMessage(CHANNEL_JID, messageId, emoji);
            await sock.sendMessage(chatId, { text: `✅ Channel reaction sent: ${emoji}` }, { quoted: message });
            return;
        }
        if (command === 'channelpost') {
            if (!arg) throw new Error('Usage: .channelpost <text>');
            // Baileys 6.7.x does not expose newsletterSendMessage; standard
            // sendMessage supports newsletter JIDs and preserves the channel post.
            await sock.sendMessage(CHANNEL_JID, { text: arg });
            await sock.sendMessage(chatId, { text: '✅ Posted to the SIGMA XMD channel.' }, { quoted: message });
            return;
        }
        throw new Error('Unknown channel command.');
    } catch (error) {
        await sock.sendMessage(chatId, { text: `❌ Channel command failed: ${error.message}` }, { quoted: message });
    }
}

module.exports = { channelCommand, CHANNEL_JID, CHANNEL_LINK };
