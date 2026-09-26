const { menuCommand } = require('./menuCommands');

async function helpCommand(sock, chatId, message) {
    return menuCommand(sock, chatId, message);
}

module.exports = helpCommand;
