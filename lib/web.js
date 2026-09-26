'use strict';

const express = require('express');
const path = require('path');
const { requestPairingCode, getPairingStatus } = require('./pairing');

const attempts = new Map();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function clientKey(req) {
    return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

function isRateLimited(req) {
    const key = clientKey(req);
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
    recent.push(now);
    attempts.set(key, recent);
    return recent.length > MAX_ATTEMPTS;
}

function startWebServer() {
    const app = express();
    const publicDir = path.join(__dirname, '..', 'public');

    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use(express.json({ limit: '8kb' }));
    app.use(express.static(publicDir, { extensions: ['html'] }));

    app.get('/api/status', (req, res) => {
        res.json({ ok: true, service: 'SIGMA XMD authentication portal', ...getPairingStatus() });
    });

    app.get('/api/qr', (req, res) => {
        const status = getPairingStatus(true);
        if (!status.qrDataUrl) return res.status(404).json({ available: false, error: 'QR code is not available yet.' });
        return res.json({ available: true, updatedAt: status.qrUpdatedAt, qrDataUrl: status.qrDataUrl });
    });

    // Kept as a lightweight compatibility health check for deploy platforms.
    app.get('/api/health', (req, res) => {
        res.json({ ok: true, service: 'SIGMA XMD authentication portal', ...getPairingStatus() });
    });

    app.post('/api/pair', async (req, res) => {
        if (isRateLimited(req)) {
            return res.status(429).json({ error: 'Too many requests. Please wait a minute before trying again.' });
        }
        try {
            const code = await requestPairingCode(req.body?.phone);
            return res.json({ ok: true, code });
        } catch (error) {
            const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
            console.error('[pairing] API error:', error.stack || error.message);
            return res.status(status).json({ error: error.message || 'Unable to generate a pairing code.' });
        }
    });

    app.use((req, res) => {
        if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
        return res.sendFile(path.join(publicDir, 'index.html'));
    });

    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || '0.0.0.0';
    const server = app.listen(port, host, () => {
        console.log(`[web] Pairing/QR portal listening on http://${host}:${port}`);
    });
    server.on('error', (error) => console.error('[web] Server error:', error.stack || error.message));
    return server;
}

module.exports = { startWebServer };
