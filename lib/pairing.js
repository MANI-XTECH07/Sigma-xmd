'use strict';

const EventEmitter = require('events');
const QRCode = require('qrcode');

const state = {
    socket: null,
    ready: false,
    requestInFlight: false,
    qr: null,
    qrDataUrl: null,
    qrUpdatedAt: null,
    readyEvents: new EventEmitter(),
};

function registerSocket(socket) {
    state.socket = socket;
    state.ready = false;
    state.qr = null;
    state.qrDataUrl = null;
    state.qrUpdatedAt = null;
}

function markSocketReady(socket) {
    if (state.socket !== socket) return;
    state.ready = true;
    state.readyEvents.emit('ready');
}

async function updateQr(socket, qr) {
    if (state.socket !== socket || !qr) return;
    state.qr = qr;
    state.qrDataUrl = await QRCode.toDataURL(qr, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 360,
        color: { dark: '#0b1020', light: '#ffffff' },
    });
    state.qrUpdatedAt = new Date().toISOString();
}

function clearQr(socket) {
    if (state.socket !== socket) return;
    state.qr = null;
    state.qrDataUrl = null;
    state.qrUpdatedAt = null;
}

function clearSocket(socket) {
    if (state.socket !== socket) return;
    state.socket = null;
    state.ready = false;
    state.requestInFlight = false;
    clearQr(socket);
}

function normalizePhoneNumber(value) {
    const number = String(value || '').replace(/\D/g, '');
    if (!/^\d{6,15}$/.test(number)) {
        const error = new Error('Enter a valid phone number with country code, digits only.');
        error.statusCode = 400;
        throw error;
    }
    return number;
}

function waitForReady(timeoutMs = 20000) {
    if (state.socket && state.ready) return Promise.resolve(state.socket);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            state.readyEvents.removeListener('ready', onReady);
            const error = new Error('WhatsApp is still connecting. Please try again in a few seconds.');
            error.statusCode = 503;
            reject(error);
        }, timeoutMs);

        const onReady = () => {
            clearTimeout(timer);
            state.readyEvents.removeListener('ready', onReady);
            resolve(state.socket);
        };

        state.readyEvents.once('ready', onReady);
    });
}

async function requestPairingCode(phoneNumber) {
    const number = normalizePhoneNumber(phoneNumber);
    if (state.requestInFlight) {
        const error = new Error('A pairing code request is already in progress.');
        error.statusCode = 429;
        throw error;
    }

    const socket = await waitForReady();
    if (!socket || socket.authState?.creds?.registered) {
        const error = new Error('This bot session is already paired. Remove the session before pairing another number.');
        error.statusCode = 409;
        throw error;
    }
    if (typeof socket.requestPairingCode !== 'function') {
        const error = new Error('The installed Baileys version does not support pairing codes.');
        error.statusCode = 500;
        throw error;
    }

    state.requestInFlight = true;
    try {
        const code = await socket.requestPairingCode(number);
        return String(code || '').match(/.{1,4}/g)?.join('-') || String(code || '');
    } finally {
        state.requestInFlight = false;
    }
}

function getPairingStatus(includeQr = false) {
    return {
        ready: Boolean(state.socket && state.ready),
        paired: Boolean(state.socket?.authState?.creds?.registered),
        requestInFlight: state.requestInFlight,
        qrAvailable: Boolean(state.qrDataUrl),
        qrUpdatedAt: state.qrUpdatedAt,
        ...(includeQr ? { qrDataUrl: state.qrDataUrl } : {}),
    };
}

module.exports = {
    registerSocket,
    markSocketReady,
    updateQr,
    clearQr,
    clearSocket,
    requestPairingCode,
    getPairingStatus,
};
