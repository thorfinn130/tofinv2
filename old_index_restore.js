const { Client, GatewayIntentBits, Partials, ChannelType } = require("discord.js");
const { token } = require("./config");
const prefix   = require("./handlers/prefix");
const slash    = require("./handlers/slash");
const buttons  = require("./handlers/buttons");
const antiNuke = require("./services/antiNuke");
const { addXP } = require("./services/leveling");
const { runAutoCollect } = require("./services/machines");
const { addWallet, fmt } = require("./services/economy");
const aiChat = require("./services/aiChat");
const { extractGifUrl, saveGif } = require("./services/gifMemory");
const { handleSocial } = require("./services/social");
const { storeDelete } = require("./commands/prefix/snipe");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message],
  presence: { status: "online" },
});

prefix.loadCommands();
slash.loadCommands();
antiNuke.register(client);

// Record the exact moment the bot came online — used to discard replayed events
let BOT_READY_AT = 0;

client.once("clientReady", () => {
  BOT_READY_AT = Date.now();
  console.log(`✅ Logged in as ${client.user.tag}`);
  startAutoCollectLoop();
});

client.on("messageCreate", async (m) => {
  if (m.author.bot) return;

  // Discord replays queued messages when the bot resumes its session after a
  // restart. Discard any message that was sent before we came online — those
  // have already been handled by a previous process.
  if (m.createdTimestamp < BOT_READY_AT) return;

  // DM handling — only AI chat, no prefix commands in DMs
  if (!m.guild) {
    aiChat.chat(m).catch(() => {});
    return;
  }

  // Social media auto-downloader — TikTok, Instagram, Twitter, Reddit, YouTube Shorts, etc.
  handleSocial(m).catch(() => {});

  // Detect and save GIFs members send so Tofin can reuse them
  const gifUrl = extractGifUrl(m);
  if (gifUrl) saveGif(m.guild.id, gifUrl);

  // Guild handling
  const { isLevelingEnabled } = require("./commands/prefix/leveltoggle");
  if (isLevelingEnabled(m.guild.id)) {
    const result = addXP(m.guild.id, m.author.id);
    if (result?.leveled) {
      m.channel.send({
        content: `🎉 ${m.author} leveled up to **Level ${result.level}**! You earned **3 stat points** — use \`,stats\` to spend them with the upgrade buttons!`,
      }).catch(() => {});
    }
  }
  prefix.handle(m);
  aiChat.chat(m).catch(() => {});
});

client.on("messageDelete", (m) => storeDelete(m));

client.on("interactionCreate", async (i) => {
  if (i.isButton() || i.isStringSelectMenu()) return buttons.handle(i);
  if (i.isModalSubmit()) return buttons.handleModal(i);
  slash.handle(i);
});

client.on("guildMemberAdd", async (member) => {
  try {
    const { getGuildConfig, getTemplate, buildWelcomeEmbed, resolveVars, resolveGifUrl } = require("./services/welcomer");
    const cfg = getGuildConfig(member.guild.id);
    if (!cfg?.enabled || !cfg?.channelId || !cfg?.templateName || !cfg?.templateOwner) return;
    const tpl = getTemplate(cfg.templateOwner, cfg.templateName);
    if (!tpl) return;
    const channel = member.guild.channels.cache.get(cfg.channelId);
    if (!channel) return;
    // Resolve Tenor/Giphy page URLs → direct media URLs so embed.setImage works
    const [resolvedImage, resolvedThumb] = await Promise.all([
      resolveGifUrl(tpl.image    ? resolveVars(tpl.image,     member) : null),
      resolveGifUrl(tpl.thumbnail? resolveVars(tpl.thumbnail, member) : null),
    ]);
    const tplResolved = { ...tpl, image: resolvedImage, thumbnail: resolvedThumb };
    const { embed, content } = buildWelcomeEmbed(tplResolved, member);
    await channel.send({ content: content ?? undefined, embeds: [embed] });
  } catch (e) {
    console.error("[guildMemberAdd welcomer]", e);
  }
});

// ── Auto Collect Loop ─────────────────────────────────────────────────────────
function startAutoCollectLoop() {
  const CHECK_INTERVAL = 10 * 60_000;

  setInterval(async () => {
    try {
      const results = runAutoCollect();
      if (!results.length) return;

      for (const r of results) {
        addWallet(r.userId, r.earned);
        try {
          const guild   = client.guilds.cache.get(r.guildId);
          if (!guild) continue;
          const channel = guild.channels.cache.get(r.channelId);
          if (!channel) continue;
          const { EmbedBuilder } = require("discord.js");
          await channel.send({ embeds: [
            new EmbedBuilder()
              .setTitle("🤖  Auto Collector")
              .setDescription(`Collected **${fmt(r.earned)} TC** from Machine #${r.channelNum}!\n> 💳 Added directly to your wallet`)
              .setColor(0x3498DB)
              .setFooter({ text: "Tofin Mine  ·  Auto-collects every 6h" })
              .setTimestamp(),
          ] });
        } catch {}
      }
    } catch (e) {
      console.error("[autoCollect]", e);
    }
  }, CHECK_INTERVAL);
}

client.login(token);
