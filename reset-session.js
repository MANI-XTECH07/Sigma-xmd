'use strict';

const fs = require('fs');
const path = require('path');

const sessionDir = process.env.SESSION_DIR || path.join(process.cwd(), 'session');
const storeFile = path.join(process.cwd(), 'baileys_store.json');
const backupDir = path.join(process.cwd(), 'session-backup-' + new Date().toISOString().replace(/[:.]/g, '-'));

if (fs.existsSync(sessionDir)) {
    fs.renameSync(sessionDir, backupDir);
    console.log(`Moved old session to ${path.basename(backupDir)}`);
} else {
    console.log('No session directory found.');
}

if (fs.existsSync(storeFile)) {
    const backupStore = `${storeFile}.bak`;
    fs.copyFileSync(storeFile, backupStore);
    fs.unlinkSync(storeFile);
    console.log(`Backed up message store to ${path.basename(backupStore)}`);
}

console.log('Session reset complete. Start the bot and pair again using the QR/pairing website.');
