const { isBotOwner } = require("../../services/botOwner");
const { rich, danger } = require("../../util/embed");
const { colors } = require("../../config");
const { PermissionFlagsBits } = require("discord.js");

// Tries to get (or create) an invite link for a guild. Falls back gracefully if it can't.
async function getInviteLink(guild, botUser) {
  try {
    const invites = await guild.invites.fetch().catch(() => null);
    if (invites && invites.size > 0) {
      return invites.first().url;
    }
  } catch {}

  // No existing invite visible — try to create one in the first channel the bot can post + create-invite in
  try {
    const channel = guild.channels.cache.find((c) =>
      c.isTextBased?.() &&
      c.permissionsFor(botUser)?.has(PermissionFlagsBits.CreateInstantInvite) &&
      c.permissionsFor(botUser)?.has(PermissionFlagsBits.ViewChannel)
    );
    if (channel) {
      const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false }).catch(() => null);
      if (invite) return invite.url;
    }
  } catch {}

  return null;
}

module.exports = {
  name: "sl",
  aliases: ["tsl"],
  async run(message) {
    if (!isBotOwner(message.author.id)) return;

    const guilds = [...message.client.guilds.cache.values()];
    if (!guilds.length) {
      return message.reply({ embeds: [danger("No Servers", "The bot isn't in any servers.")] });
    }

    await message.reply({ content: `🔎  Gathering invite links for **${guilds.length}** servers, this may take a moment...` });

    const lines = [];
    for (const guild of guilds) {
      const link = await getInviteLink(guild, message.client.user);
      lines.push(`**${guild.name}** — \`${guild.id}\`\n${link ? link : "_No invite available_"} • ${guild.memberCount} members`);
    }

    // Discord embed description max is 4096 chars — chunk into multiple embeds if needed
    const chunks = [];
    let current = "";
    for (const line of lines) {
      if ((current + "\n\n" + line).length > 3900) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? `${current}\n\n${line}` : line;
      }
    }
    if (current) chunks.push(current);

    const embeds = chunks.map((desc, i) =>
      rich({
        title: i === 0 ? `📋  Servers (${guilds.length})` : `📋  Servers (cont. ${i + 1})`,
        description: desc,
        color: colors.primary,
      })
    );

    // Discord allows max 10 embeds per message
    for (let i = 0; i < embeds.length; i += 10) {
      await message.channel.send({ embeds: embeds.slice(i, i + 10) });
    }
  },
};
