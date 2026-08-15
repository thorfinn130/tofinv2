const { REST, Routes } = require("discord.js");
const { token, clientId } = require("./config");
const slash = require("./handlers/slash");

(async () => {
  slash.loadCommands();
  const body = slash.getAll().map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);
  console.log(`Registering ${body.length} slash command(s)…`);
  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log("✅ Slash commands registered globally (may take up to 1 hour to propagate).");
})();
