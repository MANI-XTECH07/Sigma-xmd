/**
 * ꜱɪɢᴍᴀ xᴍᴅ- A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')
const pairing = require('./lib/pairing')
const { startWebServer } = require('./lib/web')

const connectionVideoPath = path.join(__dirname, 'assets', 'sigma-connected.mp4')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM too high (>400MB), restarting bot...')
        process.exit(1) // Panel will auto-restart
    }
}, 30_000) // check every 30 seconds

let phoneNumber = process.env.PHONE_NUMBER || ''
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "ꜱɪɢᴍᴀ xᴍᴅ"
global.themeemoji = "•"
const pairingCode = Boolean(phoneNumber) || process.argv.includes('--pairing-code')
const useMobile = process.argv.includes("--mobile")

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // In non-interactive environment, use ownerNumber from settings
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}


async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()
        const shouldIgnoreJid = (jid) => {
            // Status broadcasts can contain self-sent messages addressed to
            // our LID. Baileys 6.x may not have a matching status session,
            // which creates repeated "No session record" retry logs.
            if (jid === 'status@broadcast') return true
            const ownLid = state.creds?.me?.lid
            if (!ownLid || !jid || !String(jid).includes('@lid')) return false
            return String(jid).split(':')[0].split('@')[0] === String(ownLid).split(':')[0].split('@')[0]
        }

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            // The boot announcement is sent to the bot's own chat. Do not
            // re-emit it as a second local event; this avoids duplicate
            // self-device protocol messages on WhatsApp's LID session.
            emitOwnEvents: false,
            // Baileys can receive a peer copy addressed to the bot's own LID
            // after a self-send, plus status broadcasts that can contain
            // self-status messages without a matching Signal session.
            shouldIgnoreJid,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                const remoteJid = key.remoteJid || key.remoteJidAlt
                if (!remoteJid || !key.id) return undefined
                const jid = jidNormalizedUser(remoteJid)
                const msg = await store.loadMessage(jid, key.id)
                return msg?.message || undefined
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)
        pairing.registerSocket(XeonBotInc)

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate?.messages?.[0]
            if (!mek?.message) return
            const messageType = Object.keys(mek.message)[0] || 'unknown'
            console.log(`[messages] received type=${chatUpdate.type || 'unknown'} jid=${mek.key?.remoteJid || 'unknown'} content=${messageType}`)
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            // In private mode, only block non-group messages (allow groups for moderation)
            // Note: XeonBotInc.public is not synced, so we check mode in main.js instead
            // This check is kept for backward compatibility but mainly blocks DMs
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Block DMs in private mode, but allow group messages
            }
            if (mek.key?.id?.startsWith('BAE5') && mek.key.id.length === 16) return

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363411061065067@newsletter',
                                newsletterName: 'ꜱɪɢᴍᴀ xᴍᴅ',
                                serverMessageId: -1
                            }
                        }
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        const id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Handle pairing code
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile api')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number 😍\nFormat: 6281376552730 (without + or spaces) : `)))
        }

        // Clean the phone number - remove any non-digit characters
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        // Validate the phone number using awesome-phonenumber
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, etc.) without + or spaces.'));
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Your Pairing Code : `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(`\nPlease enter this code in your WhatsApp app:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices\n3. Tap "Link a Device"\n4. Enter the code shown above`))
            } catch (error) {
                console.error('Error requesting pairing code:', error)
                console.log(chalk.red('Failed to get pairing code. Please check your phone number and try again.'))
            }
        }, 3000)
    }

    // Connection handling
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        
        if (qr) {
            // Baileys emits QR while the socket is ready for requestPairingCode.
            pairing.markSocketReady(XeonBotInc)
            await pairing.updateQr(XeonBotInc, qr)
            console.log(chalk.yellow('📱 QR code updated. Open the pairing website and scan it.'))
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
        }
        
        if (connection == "open") {
            pairing.markSocketReady(XeonBotInc)
            pairing.clearQr(XeonBotInc)
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                const connectionCaption = `╭━━━〔 𓆩⚡𓆪 〕━━━╮
𝐒𝐈𝐆𝐌𝐀  𝐗𝐌𝐃
ᴛʜᴇ ᴘʀᴏᴛᴏᴄᴏʟ ᴡᴀᴋᴇs
╰━━━〔 𓆩⚡𓆪 〕━━━╯

      ⟡ 🟢 ⟡
   𝐎𝐍𝐋𝐈𝐍𝐄

 ╭────────────╮
   𝟎𝟎:𝟎𝟎:𝟎𝟏
 ╰────────────╯

╭─╴╴╴ 𝐁 𝐎 𝐎 𝐓  𝐒 𝐄 𝐐 𝐔 𝐄 𝐍 𝐂 𝐄 ╶╶╮

⟢ ᴄᴏɴɴᴇᴄᴛɪɴɢ    • • •
⟢ ᴠᴇʀɪғʏɪɴɢ     • • •
⟢ ᴅᴇᴘʟᴏʏɪɴɢ     • • •

          ✓ 𝐂𝐎𝐌𝐏𝐋𝐄𝐓𝐄

╰╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╯

╭───〔 𝐂 𝐎 𝐑 𝐄 〕───╮
│
│  🟢  ᴄᴏɴɴᴇᴄᴛɪᴏɴ   ── 𝐄𝐒𝐓𝐀𝐁𝐋𝐈𝐒𝐇𝐄𝐃
│  ⚡  ʀᴇsᴘᴏɴsᴇ      ── 𝐑𝐄𝐀𝐃𝐘
│  🛡️  sᴇᴄᴜʀɪᴛʏ      ── 𝐀𝐂𝐓𝐈𝐕𝐄
│
╰────────────────────╯

      𓆩 ✦ 𓆪

 『 𝐒𝐈𝐆𝐌𝐀 𝐈𝐒 𝐀𝐋𝐈𝐕𝐄 』

⌁  .menu
⌁  .alive
⌁  .ping

╭───────────────╮
│  ᴋᴜʀᴏx ᴅᴇᴠ × ᴍᴀɴɪ  │
╰───────────────╯

    ⟡ 𝐑𝐄𝐀𝐃𝐘 ⟡`;
                const contextInfo = {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363411061065067@newsletter',
                        newsletterName: 'ꜱɪɢᴍᴀ xᴍᴅ',
                        serverMessageId: -1
                    }
                };
                if (fs.existsSync(connectionVideoPath)) {
                    await XeonBotInc.sendMessage(botNumber, {
                        video: fs.readFileSync(connectionVideoPath),
                        mimetype: 'video/mp4',
                        fileName: 'sigma-connected.mp4',
                        caption: connectionCaption,
                        contextInfo
                    });
                } else {
                    await XeonBotInc.sendMessage(botNumber, { text: connectionCaption, contextInfo });
                }
            } catch (error) {
                console.error('Error sending connection message:', error.message)
            }

            await delay(1999)
            console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname || 'ꜱɪɢᴍᴀ xᴍᴅ'} ]`)}\n\n`))
            console.log(chalk.cyan(`< ================================================== >`))
            console.log(chalk.magenta(`\n${global.themeemoji || '•'} YT CHANNEL: ᴍᴀɴɪ xᴛᴇᴄʜ`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} GITHUB: ᴍᴀɴɪ xᴛᴇᴄʜ`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${owner}`))
            console.log(chalk.magenta(`${global.themeemoji || '•'} CREDIT: ᴍᴀɴɪ xᴛᴇᴄʜ`))
            console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`))
            console.log(chalk.blue(`Bot Version: ${settings.version}`))
        }
        
        if (connection === 'close') {
            pairing.clearSocket(XeonBotInc)
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            const statusCode = lastDisconnect?.error?.output?.statusCode
            
            const disconnectMessage = lastDisconnect?.error?.message || String(lastDisconnect?.error || 'unknown reason')
            console.log(chalk.red(`Connection closed: ${disconnectMessage}; reconnecting=${shouldReconnect}`))
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    rmSync('./session', { recursive: true, force: true })
                    console.log(chalk.yellow('Session folder deleted. Please re-authenticate.'))
                } catch (error) {
                    console.error('Error deleting session:', error)
                }
                console.log(chalk.red('Session logged out. Please re-authenticate.'))
            }
            
            if (shouldReconnect) {
                console.log(chalk.yellow('Reconnecting...'))
                await delay(5000)
                startXeonBotInc()
            }
        }
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Anticall handler: block callers when enabled
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                    }
                } catch {}
                // Then: block after a short delay to ensure rejection and message are processed
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignore
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        await delay(5000)
        startXeonBotInc()
    }
}


// Start the pairing website alongside the bot.
startWebServer()

// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err?.stack || err)
})
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err?.stack || err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})
