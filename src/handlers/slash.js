const fs = require("fs");
const path = require("path");

const commands = new Map();

function loadCommands() {
  const dir = path.join(__dirname, "..", "commands", "slash");
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".js")) continue;
    const cmd = require(path.join(dir, file));
    commands.set(cmd.data.name, cmd);
  }
}

function getAll() {
  return [...commands.values()];
}

async function handle(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.run(interaction);
  } catch (err) {
    console.error(err);
    const reply = { content: `❌ ${err.message ?? "Command failed"}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(reply);
    else interaction.reply(reply);
  }
}

module.exports = { loadCommands, getAll, handle };
