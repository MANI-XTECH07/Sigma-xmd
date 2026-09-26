'use strict';

const fs = require('fs');
const STORE_FILE = './baileys_store.json';

// Keep recent messages so Baileys can re-encrypt failed deliveries.
let MAX_MESSAGES = 20;
try {
    const settings = require('../settings.js');
    if (settings.maxStoreMessages && typeof settings.maxStoreMessages === 'number') {
        MAX_MESSAGES = settings.maxStoreMessages;
    }
} catch {}

function canonicalJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '');
}

function sameJid(a, b) {
    return a === b || canonicalJid(a) === canonicalJid(b);
}

const store = {
    messages: {},
    contacts: {},
    chats: {},

    readFromFile(filePath = STORE_FILE) {
        try {
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                this.contacts = data.contacts || {};
                this.chats = data.chats || {};
                this.messages = data.messages || {};
                this.cleanupData();
            }
        } catch (error) {
            console.warn('[store] Failed to read message store:', error.message);
        }
    },

    writeToFile(filePath = STORE_FILE) {
        try {
            fs.writeFileSync(filePath, JSON.stringify({
                contacts: this.contacts,
                chats: this.chats,
                messages: this.messages,
            }));
        } catch (error) {
            console.warn('[store] Failed to write message store:', error.message);
        }
    },

    cleanupData() {
        Object.keys(this.messages || {}).forEach((jid) => {
            if (this.messages[jid] && !Array.isArray(this.messages[jid])) {
                this.messages[jid] = Object.values(this.messages[jid]).slice(-MAX_MESSAGES);
            }
        });
    },

    bind(ev) {
        ev.on('messages.upsert', ({ messages = [] }) => {
            for (const msg of messages) {
                const jid = msg.key?.remoteJid;
                if (!jid || !msg.key?.id) continue;
                this.messages[jid] = this.messages[jid] || [];
                this.messages[jid].push(msg);
                if (this.messages[jid].length > MAX_MESSAGES) {
                    this.messages[jid] = this.messages[jid].slice(-MAX_MESSAGES);
                }
            }
        });

        ev.on('contacts.update', (contacts = []) => {
            contacts.forEach((contact) => {
                if (contact.id) this.contacts[contact.id] = { id: contact.id, name: contact.notify || contact.name || '' };
            });
        });

        ev.on('chats.set', (chats = []) => {
            this.chats = {};
            chats.forEach((chat) => { this.chats[chat.id] = { id: chat.id, subject: chat.subject || '' }; });
        });
    },

    async loadMessage(jid, id) {
        if (!id) return null;
        const buckets = Object.entries(this.messages || {});
        const preferred = buckets.filter(([storedJid]) => sameJid(storedJid, jid));
        const search = preferred.length ? preferred : buckets;
        for (const [, messages] of search) {
            if (!Array.isArray(messages)) continue;
            const found = messages.find((message) => message?.key?.id === id);
            if (found) return found;
        }
        return null;
    },

    getStats() {
        let totalMessages = 0;
        Object.values(this.messages).forEach((messages) => { if (Array.isArray(messages)) totalMessages += messages.length; });
        return {
            messages: totalMessages,
            contacts: Object.keys(this.contacts).length,
            chats: Object.keys(this.chats).length,
            maxMessagesPerChat: MAX_MESSAGES,
        };
    },
};

module.exports = store;
