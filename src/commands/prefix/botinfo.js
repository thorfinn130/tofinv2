const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, version: djsVersion } = require("discord.js");

const START_TIME = Date.now();

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

module.exports = {
  name: "botinfo",
  aliases: ["about", "bi"],
  async run(message) {
    const client = message.client;
    const uptime = formatUptime(Date.now() - START_TIME);
    const guilds  = client.guilds.cache.size;
    const users   = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    const ping    = Math.round(client.ws.ping);
    const mem     = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const nodeVer = process.version;

    const pingColor = ping < 80 ? 0x57f287 : ping < 180 ? 0xfee75c : 0xed4245;
    const pingIcon  = ping < 80 ? "🟢" : ping < 180 ? "🟡" : "🔴";

    const embed = new EmbedBuilder()
      .setAuthor({ name: client.user.tag, iconURL: client.user.displayAvatarURL() })
      .setTitle("🤖  Bot Information")
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .setColor(pingColor)
      .addFields(
        { name: "👾  Developer",     value: "sy2th",                                  inline: true },
        { name: "📚  Library",       value: `discord.js v${djsVersion}`,              inline: true },
        { name: "🟩  Node.js",       value: nodeVer,                                  inline: true },
        { name: "🏠  Servers",       value: `**${guilds.toLocaleString()}**`,         inline: true },
        { name: "👥  Total Users",   value: `**${users.toLocaleString()}**`,          inline: true },
        { name: "🧠  Memory",        value: `**${mem} MB**`,                          inline: true },
        { name: "⏱️  Uptime",        value: `**${uptime}**`,                          inline: true },
        { name: `${pingIcon}  Ping`, value: `**${ping}ms**`,                          inline: true },
        { name: "🪪  Bot ID",        value: `\`${client.user.id}\``,                  inline: true },
      )
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Invite Bot")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot+applications.commands`)
        .setEmoji("➕"),
    );

    return message.reply({ embeds: [embed], components: [row] });
  },
};
