const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const CATEGORIES = {
  mod: {
    label: "Moderation",
    emoji: "🔨",
    color: 0xED4245,
    fields: [
      { name: "Kick / Mute / Ban", value: "`,kick @user [reason]` — kick a member\n`,mute @user <duration> [reason]` — temp mute\n`,ban @user [duration] [reason]` — ban (permanent if no duration)", inline: false },
      { name: "Warn / Manage", value: "`,warn @user <reason>` — warn & DM the user\n`,warnings @user` — view all warnings\n`,unwarn @user <id>` — remove a warning\n`,unmute @user` — lift a mute\n`,unban <userId>` — unban a user", inline: false },
      { name: "Channels", value: "`,lock` / `,unlock` — lock or unlock the channel\n`,slowmode <secs>` — set slowmode (0 = off)\n`,purge <amount>` — delete up to 100 messages", inline: false },
      { name: "Other", value: "`,nickname @user [name]` (`,nick`) — change/reset nickname\n`,fn add @user <nickname>` — force a nickname; reverts automatically if they change it *(higher role than target)*\n`,fn remove @user` — release a forced nickname\n`,fn list` — active forced nicknames\n`,announce #channel <msg>` — send an announcement", inline: false },
      { name: "Jail System", value: "`,setup` — one-time setup: mute role, jail role/channel, mod category *(Admin)*\n`,jail @user [duration] [reason]` — jail a member *(Admin)*\n`,unjail @user` — release & restore roles *(Admin)*\n`,jail channel #channel` / `,jail role @role` — reconfigure\n`,jail config` — view current setup", inline: false },
      { name: "Automod", value: "`,automod enable` / `,automod disable` — toggle automod *(Admin)*\n`,automod add/remove <word>` — manage blocked words\n`,automod rule <name> <on|off>` — toggle a rule\n`,automod rule <name> action <delete|warn|mute>` — set the response\n`,automod whitelist channel/role add/remove` — exempt a channel/role\n`,automod status` — current config", inline: false },
      { name: "Logging", value: "`,logs add #channel <events>` — send events to a channel *(Admin)*\n`,logs remove #channel <events>` — stop sending those\n`,logs list` — configured log channels\n`,logs events` — list all loggable event types", inline: false },
      { name: "Anti-Nuke", value: "`,antinuke setup` — guided setup wizard *(Admin)*\n`,antinuke check` — health check: confirms the bot can actually act before an attack happens\n`,antinuke config` — view config, with quick-action buttons\n`,antinuke enable` / `,antinuke disable` — toggle protection\n`,antinuke module <name> <on|off>` — toggle a specific module\n`,antinuke whitelist add/remove @user` — trust someone\n`,antinuke lockdown` / `,antinuke unlock` — emergency: block sending/connecting server-wide\n> Catches mass deletes, webhook spam, permission escalation, dangerous role grants, soft-nuke overwrite abuse & rapid identity changes", inline: false },
      { name: "Command Toggles", value: "`,disable <command> [#channel]` — turn a command off, server-wide or in one channel *(Admin)*\n`,enable <command> [#channel]` — turn it back on\n`,disable list` — browse every command and toggle them from a menu", inline: false },
    ],
  },
  roles: {
    label: "Roles & Info",
    emoji: "👥",
    color: 0x3498DB,
    fields: [
      { name: "Roles", value: "`,role @role <preset>` — assign a permission preset *(owner)*\nPresets: `trialmod_perm` · `mod_perm` · `admin_perm` · `coowner_perm`\n`,brole @role` — give to all bots\n`,mrole @role` — give to all members\n`,r @role @user` — give a role to one user *(Manage Roles)*\n`,rc <name> [color]` — create a role *(Manage Roles)*\n`,rf @role` — delete a role *(Manage Roles)*", inline: false },
      { name: "Info", value: "`,userinfo [@user]` (`,ui`) — user details, roles & warnings\n`,serverinfo` (`,si`) — server stats\n`,roleinfo @role` (`,ri`) — role details", inline: true },
      { name: "Status Roles", value: "`,status @role <text>` — auto-give a role when someone's status contains that text *(Manage Roles)*\n`,status list` — active rules\n`,status remove @role` — stop tracking", inline: true },
    ],
  },
  fun: {
    label: "Fun & Events",
    emoji: "🎉",
    color: 0x2ECC71,
    fields: [
      { name: "Games & Fun", value: "`,8ball <question>` — magic 8-ball\n`,joke` — random joke\n`,roast @user` — roast someone", inline: true },
      { name: "Emojis", value: "`,emoji list` — view custom emojis\n`,emoji add <name> <url>` — add one\n`,emoji remove <name>` — remove one", inline: true },
      { name: "Server Events", value: "`,poll <question> | <opt1> | <opt2>` — reaction poll\n`,giveaway <duration> <prize>` (`,gw`) — timed giveaway\n`,randomwinner @role` (`,rw`) — pick a random winner\n`/giveaway create` — advanced giveaway with a **Join** button (not reactions)", inline: false },
    ],
  },
  server: {
    label: "Server Tools",
    emoji: "💾",
    color: 0x95A5A6,
    fields: [
      { name: "Backups", value: "`,backup create [name]` — save a snapshot *(admin)*\n`,backup restore <id>` — restore one *(admin)*\n`,backup list` — list saved backups", inline: true },
      { name: "Templates", value: "`,template save <name>` — save server as a template *(admin)*\n`,template load <name> [roles|channels|bots]` *(owner)*\n`,templatelink <name|code>` — shareable link *(owner)*", inline: true },
      { name: "Join-to-Create VC", value: "`/vcset add #channel` — joining creates a private VC & moves you in *(Manage Channels)*\n`/vcset remove` / `/vcset list` — manage trigger channels", inline: false },
      { name: "Invite Tracking", value: "`,invites [@user]` (`,invite`, `,inv`) — how many people someone invited — tracked automatically", inline: false },
    ],
  },
  welcomer: {
    label: "Welcomer",
    emoji: "👋",
    color: 0xFF73FA,
    fields: [
      { name: "Build Templates", value: "`,welcome create <name>` — create a template (opens builder)\n`,welcome edit <name>` — re-open the builder\n`,welcome list` / `,welcome delete <name>`", inline: false },
      { name: "Configure Server", value: "`,welcome set channel #channel` — where to send welcome messages\n`,welcome set template <name>` — which template to use\n`,welcome enable` / `,welcome disable` — toggle on/off\n`,welcome test` — preview in this channel\n`,welcome dm on/off` — also DM new members", inline: false },
      { name: "Goodbye Messages", value: "`,welcome set leavechannel #channel` — where goodbyes go\n`,welcome set leavetemplate <name>` — which template\n`,welcome leaveenable` / `,welcome leavedisable`\n`,welcome leavetest` — preview one", inline: false },
      { name: "Template Variables", value: "`{user}` `{user_name}` `{user_display}` `{user_avatar}`\n`{server_name}` `{server_icon}` `{server_membercount}`", inline: false },
    ],
  },
  utilities: {
    label: "Utilities",
    emoji: "🛠️",
    color: 0x1ABC9C,
    fields: [
      { name: "🏓 Ping & Avatar", value: "`,ping` — bot & API latency\n`,avatar [@user]` (`,av`) — full-size avatar + download links", inline: false },
      { name: "🎬 GIF Maker", value: "`/gif` — upload an image or paste a URL, optional caption\n`,gif [caption]` — reply to an image/GIF to convert it\n`,caption gif <url> <caption>` — caption an animated GIF by URL\n> Renders as a white bar, meme-style — animated GIFs stay animated", inline: false },
      { name: "🔍 Snipe", value: "`,snipe` (`,s`) — last deleted message here\n`,snipe 2`, `,snipe 3`… — go back further", inline: true },
      { name: "💤 AFK", value: "`,afk [reason]` — set yourself AFK, clears when you next talk", inline: true },
      { name: "🤖 AI Chat", value: "`,aion` / `,aioff` — turn AI chat on/off *(Manage Server)*\n`,aistatus` — active provider *(Admin)*\n`,aiask <question>` — one-off answer, no memory stored\n`,aiclear` / `,aimemory` — wipe or view channel memory *(Manage Messages)*", inline: false },
      { name: "📥 Social Downloader", value: "Paste a link and Tofin auto-downloads it — **TikTok** · **Instagram** · **Twitter/X** · **Reddit** · **YouTube Shorts** · **Twitch Clips** · **Vimeo** · **Pinterest**\n> No command needed", inline: false },
      { name: "📊 Info & Stats", value: "`,botinfo` (`,about`) — uptime & version\n`,membercount` (`,mc`) — member breakdown\n`,messages [@user]` (`,msgs`) — tracked message count", inline: false },
      { name: "⏰ Reminders", value: "`,reminder <duration> <text>` (`,remind`) — get pinged later\n**Example:** `,reminder 2h check the oven`", inline: true },
      { name: "🌐 Translate", value: "`,translate <language> <text>` (`,t`) — translate text", inline: true },
      { name: "🎵 Audio Tools", value: "`,mp3 <url>` — pull audio from a video/audio link\n`,shazam <url>` — identify a song from a link\nBoth also work as a reply, with no URL needed", inline: false },
      { name: "🎨 Color Picker", value: "`,colorpicker` (`,cpick`) — interactive HSL picker\n`,colorpicker #hex` or `<image url>` — start from a code or sample an image", inline: false },
      { name: "⚙️ Server Config", value: "`,alias add/remove/list` — custom command shortcuts *(Manage Server)*\n`,cc enable` / `,cc disable` — toggle custom commands *(Admin)*\n`,setprefix <prefix>` (`,prefix`) — change the command prefix *(Admin)*", inline: false },
      { name: "🏷️ Stickers & 🎶 Queue", value: "`,sticker list` / `,sticker add <name> <url> [tags]` *(Manage Stickers)*\n`,clear` (`,clearqueue`) — clear the music queue\n`,remove <position>` — remove a queued song", inline: false },
    ],
  },
  owner: {
    label: "Owner Tools",
    emoji: "🔐",
    color: 0x992D22,
    fields: [
      { name: "⚠️ Dangerous", value: "`,restart` — wipe all channels, roles & kick bots *(server owner)*\n`,giveownership` — give the bot full Administrator + highest role *(server owner)*\n`,execute @role` — kick everyone with that role *(server owner)*", inline: false },
      { name: "Bot Owner", value: "`,grantowner @user` — grant bot owner permission *(Bot Owner)*", inline: false },
    ],
  },
};

function overviewEmbed({ username, avatarURL }) {
  return new EmbedBuilder()
    .setAuthor({ name: "Tofin Bot", iconURL: avatarURL })
    .setThumbnail(avatarURL)
    .setTitle("🧰  Command Help")
    .setDescription(
      "> Pick a category from the **menu below** to browse its commands.\n\n" +
      "🔨 **Moderation** — kick, mute, ban, warn, purge, anti-nuke, automod\n" +
      "👥 **Roles & Info** — role management, userinfo, status roles\n" +
      "🎉 **Fun & Events** — polls, giveaways, games, emojis\n" +
      "💾 **Server Tools** — backups, templates, invites\n" +
      "👋 **Welcomer** — custom welcome & goodbye messages\n" +
      "🛠️ **Utilities** — AI chat, downloaders, and everything else\n" +
      "🔐 **Owner Tools** — sensitive, owner-only commands"
    )
    .setColor(0x5865F2)
    .setFooter({ text: `Requested by ${username}  ·  Prefix: ,` })
    .setTimestamp();
}

function categoryEmbed(key, { username, avatarURL }) {
  const cat = CATEGORIES[key];
  return new EmbedBuilder()
    .setTitle(`${cat.emoji}  ${cat.label}`)
    .addFields(cat.fields)
    .setColor(cat.color)
    .setThumbnail(avatarURL)
    .setFooter({ text: `Requested by ${username}  ·  Use the menu to switch categories` })
    .setTimestamp();
}

function buildMenu(userId, selected = null) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help_cat:${userId}`)
    .setPlaceholder("📂  Select a category…")
    .addOptions(
      Object.entries(CATEGORIES).map(([key, cat]) => ({
        label: cat.label,
        value: key,
        emoji: cat.emoji,
        default: key === selected,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  name: "help",
  aliases: ["thelp"],
  CATEGORIES, categoryEmbed, buildMenu,
  run(message) {
    const userId = message.author.id;
    const who = { username: message.author.username, avatarURL: message.client.user.displayAvatarURL() };
    return message.reply({
      embeds: [overviewEmbed(who)],
      components: [buildMenu(userId)],
    });
  },
};
