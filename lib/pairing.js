'use strict';

const EventEmitter = require('events');

const state = {
    socket: null,
    ready: false,
    requestInFlight: false,
    readyEvents: new EventEmitter(),
};

function registerSocket(socket) {
    state.socket = socket;
    state.ready = false;
}

function markSocketReady(socket) {
    if (state.socket !== socket) return;
    state.ready = true;
    state.readyEvents.emit('ready');
}

function clearSocket(socket) {
    if (state.socket !== socket) return;
    state.socket = null;
    state.ready = false;
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

function getPairingStatus() {
    return {
        ready: Boolean(state.socket && state.ready),
        paired: Boolean(state.socket?.authState?.creds?.registered),
        requestInFlight: state.requestInFlight,
    };
}

module.exports = {
    registerSocket,
    markSocketReady,
    clearSocket,
    requestPairingCode,
    getPairingStatus,
};
