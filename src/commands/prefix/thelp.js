const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");

const CATEGORIES = {
  mod: {
    label: "🔨  Moderation",
    emoji: "🔨",
    color: 0xED4245,
    fields: [
      { name: "Kick / Mute / Ban", value: "`,kick @user [reason]` — kick a member from the server\n`,tmute @user <duration> [reason]` — temp mute\n`,tban @user [duration] [reason]` — ban (permanent if no duration)", inline: false },
      { name: "Warn / Manage", value: "`,twarn @user <reason>` — warn & DM the user\n`,warnings @user` — view all warnings\n`,unwarn @user <id>` — remove a warning\n`,unmute @user` — lift a mute\n`,unban <userId>` — unban a user", inline: false },
      { name: "Channels", value: "`,lock` / `,unlock` — lock or unlock the channel\n`,slowmode <secs>` — set slowmode (0 = off)\n`,tpurge <amount>` — delete up to 100 messages", inline: false },
      { name: "Other", value: "`,tnickname @user [name]` (`,tnick`) — change/reset nickname\n`,announce #channel <msg>` — send an announcement", inline: false },
      { name: "Jail System", value: "`,setup` — one-time setup: creates mute role, jail role/channel, mod category *(Admin)*\n`,jail @user [duration] [reason]` — jail a member, optional auto-release *(Admin)*\n`,unjail @user` — release & restore previous roles *(Admin)*\n`,jail channel #channel` / `,jail role @role` — reconfigure\n`,jail config` — view current setup", inline: false },
      { name: "Automod", value: "`,automod enable` / `,automod disable` — toggle automod *(Admin)*\n`,automod add <word>` / `,automod remove <word>` — manage blocked words\n`,automod rule <name> <on|off>` — toggle a rule: `invites` `links` `caps` `mentionSpam` `emojiSpam` `duplicate`\n`,automod rule <name> action <delete|warn|mute>` — set the response\n`,automod rule <name> threshold <n>` — tune sensitivity\n`,automod whitelist channel/role add/remove` — exempt a channel/role\n`,automod logchannel #channel` — log automod actions\n`,automod status` — current config", inline: false },
      { name: "Logging", value: "`,logs add #channel <events>` — send specific events to a channel *(Admin)*\n`,logs remove #channel <events>` — stop sending those events there\n`,logs list` — see configured log channels\n`,logs events` — list all loggable event types\n`,logs ignore @user/#channel` — exclude from logs", inline: false },
      { name: "Anti-Nuke", value: "`,tantinuke` (`,antinuke`) — view & configure anti-nuke *(Admin)*\n`,tantinuke enable` / `,tantinuke disable` — toggle protection\n`,tantinuke module <name> <on|off>` — toggle a specific module\n`,tantinuke action <name> <warn|strip|kick|ban>` — set the response for a module\n`,tantinuke whitelist add/remove @user` — trust a user/role\n> Auto-detects mass channel/role deletion & creation, webhook spam, permission escalation, mass bans/kicks, mention spam & message spam, then acts to protect the server", inline: false },
    ],
  },
  roles: {
    label: "👥  Roles & Info",
    emoji: "👥",
    color: 0x3498DB,
    fields: [
      { name: "Roles", value: "`,role @role <preset>` — assign permission preset *(owner)*\nPresets: `trialmod_perm` · `mod_perm` · `admin_perm` · `coowner_perm`\n`,tbrole @role` — give to all bots\n`,tmrole @role` — give to all members\n`,r @role @user` — give a role to one user *(Manage Roles)*\n`,rc <name> [color]` — create a role, e.g. `,rc VIP gold` *(Manage Roles)*\n`,ec @role <color>` — change a role's color *(Manage Roles)*\n`,rf @role` — delete a role entirely *(Manage Roles)*", inline: false },
      { name: "Info", value: "`,userinfo [@user]` (`,ui`) — user details, roles & warnings\n`,serverinfo` (`,si`) — server stats\n`,roleinfo @role` (`,ri`) — role details (color, members, permissions)", inline: false },
      { name: "Status Roles", value: "`,status @role <text>` — auto-give a role when someone's custom status contains that text *(Manage Roles)*\n`,status list` — view active rules\n`,status remove @role` — stop tracking & strip the role from everyone\n> Removing the text from their status removes the role too", inline: false },
    ],
  },
  leveling: {
    label: "⭐  Leveling",
    emoji: "⭐",
    color: 0x9B59B6,
    fields: [
      { name: "Profile & Leaderboard", value: "`,profile [@user]` (`,prof`, `,rank`) — level card with XP bar & server rank\n`,leaderboard` (`,lb`, `,top`) — see the top 10 members by level", inline: false },
      { name: "Level Roles", value: "`,levelrole` — view configured level-up role rewards\n`,levelrole add <level> @role` — auto-give a role at that level *(Manage Roles)*\n`,levelrole remove <level>` — remove a reward *(Manage Roles)*\n> Roles stack — members keep every role they've earned", inline: false },
      { name: "Admin Tuning", value: "`,leveltoggle` (`,levelon`/`,leveloff`) — enable/disable XP gain *(Admin)*\n`,tadmin xprate <amount>` — XP given per message *(Owner)*\n`,tadmin xpcooldown <seconds>` — cooldown between XP gains *(Owner)*\n`,tadmin level @user <level>` / `,tadmin addxp @user <amount>` / `,tadmin resetlevel @user` *(Owner)*", inline: false },
    ],
  },
  fun: {
    label: "🎉  Fun & Engagement",
    emoji: "🎉",
    color: 0x2ECC71,
    fields: [
      { name: "Games & Fun", value: "`,8ball <question>` — magic 8-ball\n`,coinflip` — heads or tails\n`,joke` — random joke\n`,roast @user` — roast someone", inline: false },
      { name: "Server Events", value: "`,poll <question> | <opt1> | <opt2>` — reaction poll\n`,giveaway <duration> <prize>` (`,gw`) — timed giveaway\n`,randomwinner @role` (`,rw`) — pick a random winner\n`/giveaway create` — advanced giveaway with a **Join** button (not reactions)\n> If a required role/level is set, clicking Join is blocked with an explanation unless you qualify", inline: false },
      { name: "Emojis", value: "`,temoji list` — view all custom emojis\n`,temoji add <name> <url>` — add an emoji\n`,temoji remove <name>` — remove an emoji", inline: false },
    ],
  },
  server: {
    label: "💾  Server Tools",
    emoji: "💾",
    color: 0x95A5A6,
    fields: [
      { name: "Backups", value: "`,backup create [name]` — save server snapshot *(admin)*\n`,backup restore <id>` — restore a backup *(admin)*\n`,backup list` — list saved backups *(admin)*", inline: false },
      { name: "Templates", value: "`,template save <name>` — save server as template *(admin)*\n`,template load <name> [roles|channels|bots]` — load *(owner)*\n`,template list` — your saved templates\n`,template delete <name>` — delete a template\n`,templatelink <name|code>` — shareable one-time link *(owner)*", inline: false },
      { name: "Join-to-Create VC", value: "`/vcset add #channel` — joining that VC creates a private channel & moves you in *(Manage Channels)*\n`/vcset remove #channel` / `/vcset list` — manage trigger channels\n> The creator gets full channel permissions automatically (rename, lock, kick, limit, etc.) — just right-click the channel in Discord, no extra commands needed", inline: false },
      { name: "Owner Tools", value: "`,trestart` — wipe all channels, roles & kick bots *(owner)*\n`,tgiveownership` — give bot full Administrator + highest role *(owner)*\n`,execute @role` — kick everyone (members & bots) with that role *(owner)*", inline: false },
      { name: "Invite Tracking", value: "`,invites [@user]` (`,invite`, `,inv`) — see how many people someone invited\nAutomatically tracks who invited each new member", inline: false },
    ],
  },
  welcomer: {
    label: "👋  Welcomer",
    emoji: "👋",
    color: 0xFF73FA,
    fields: [
      { name: "Build Templates", value: "`,welcome create <name>` — create a welcome template (opens builder)\n`,welcome edit <name>` — re-open the interactive builder\n`,welcome list` — list all your templates\n`,welcome delete <name>` — delete a template", inline: false },
      { name: "Configure Server", value: "`,welcome set channel #channel` — where to send welcome messages\n`,welcome set template <name>` — which template to use (auto-enables)\n`,welcome enable` / `,welcome disable` — toggle on/off\n`,welcome test` — preview in the current channel\n`,welcome dm on` / `,welcome dm off` — also DM new members\n`,welcome set deleteafter <seconds>` — auto-delete after N seconds\n`,welcome info` — show current config", inline: false },
      { name: "Goodbye Messages", value: "`,welcome set leavechannel #channel` — where to send goodbye messages\n`,welcome set leavetemplate <name>` — which template to use (reuses your templates)\n`,welcome leaveenable` / `,welcome leavedisable` — toggle on/off\n`,welcome leavetest` — preview a goodbye message", inline: false },
      { name: "Variables (use inside templates)", value: "`{user}` — @mention\n`{user_name}` — raw username\n`{user_display}` — nickname if set, otherwise username\n`{user_avatar}` — avatar URL\n`{server_name}` — server name\n`{server_icon}` — server icon URL\n`{server_membercount}` — member count", inline: false },
      { name: "Builder Features", value: "🖼️ Supports **GIF banners** (just paste a .gif URL in Banner)\n🔧 Up to **3 custom embed fields** via the Fields button\n📨 **Message content** (text above the embed)\n📤 **Test Send** — sends a live preview as a real message", inline: false },
    ],
  },
  utilities: {
    label: "🛠️  Utilities",
    emoji: "🛠️",
    color: 0x1ABC9C,
    fields: [
      { name: "🏓 Ping", value: "`,ping` — bot & API latency with quality indicator", inline: false },
      { name: "🖼️ Avatar", value: "`,avatar [@user]` (`,av`, `,pfp`) — full-size avatar with download links\nShows server avatar vs global avatar when different", inline: false },
      { name: "🎬 GIF Maker", value: "`/gif` — upload an image or paste a URL, with an optional caption\n`,gif [caption]` — reply to an image/GIF with this to convert it (caption optional)\n`,caption gif <url> <caption>` — caption an animated GIF by URL\n> Captions appear as a white bar above the image, meme-style. Animated GIFs stay animated.", inline: false },
      { name: "🔍 Snipe", value: "`,snipe` (`,s`) — shows the last deleted message in this channel\n`,snipe 2`, `,snipe 3`, etc. — go back further (up to 100 stored per channel)\nIncludes author, content, attachments & how long ago it was deleted", inline: false },
      { name: "🎚️ Server Toggles", value: "`,levelon` / `,leveloff` — enable/disable XP & level-up messages *(Admin)*", inline: false },
      { name: "🤖 AI Chat — Toggle", value: "`,taion` — turn AI chat **ON** *(Manage Server)*\n`,taioff` — turn AI chat **OFF** *(Manage Server)*\n`,taistatus` — which AI provider is active *(Admin)*", inline: false },
      { name: "🤖 AI Chat — Commands", value: "`,aiask <question>` — one-off AI answer, no memory stored\n`,aiclear` — wipe bot memory for this channel *(Manage Messages)*\n`,aimemory` — see what bot remembers in this channel *(Manage Messages)*\n`,aimodel` — show current active AI provider\n`,resetcooldown <gemini|groq|openrouter|all>` — manually clear a rate-limited provider *(Admin)*", inline: false },
      { name: "📥 Social Media Downloader", value: "Paste any link and Tofin auto-downloads it:\n**TikTok** · **Instagram** · **Twitter/X** · **Reddit**\n**YouTube Shorts** · **Twitch Clips** · **Vimeo** · **Pinterest**\n> No command needed — just drop the link", inline: false },
      { name: "💤 AFK", value: "`,afk [reason]` — set yourself AFK\nAuto-clears when you talk again; pings you get a heads-up reply showing you're AFK", inline: false },
      { name: "🔤 Aliases", value: "`,alias add <shortcut> <command...>` — create a custom shortcut *(Manage Server)*\n`,alias remove <shortcut>` — delete one\n`,alias list` — view all custom aliases for this server", inline: false },
      { name: "🤖 Bot Info", value: "`,botinfo` (`,about`, `,bi`) — uptime, server/user counts, version info", inline: false },
      { name: "👥 Member Count", value: "`,membercount` (`,mc`, `,members`) — total members, humans vs bots, online count", inline: false },
      { name: "💬 Message Stats", value: "`,messages [@user]` (`,msgs`, `,msgcount`) — tracked message count for a user", inline: false },
      { name: "⏰ Reminders", value: "`,reminder <duration> <text>` (`,remind`, `,remindme`) — get pinged later\n**Example:** `,reminder 2h check the oven`", inline: false },
      { name: "🌐 Translate", value: "`,t <language> <text>` (`,translate`) — translate text into another language", inline: false },
      { name: "🎵 MP3 Extractor", value: "`,mp3 <url>` — pull the audio out of a video/audio link as an MP3\nReply to a message with an attachment/link and use `,mp3` with no args to grab that instead", inline: false },
      { name: "🎧 Shazam", value: "`,shazam <url>` — identify a song from an audio/video link\nAttach a file, paste a URL, or reply to a message containing one", inline: false },
      { name: "🎨 Color Picker", value: "`,colorpicker` (`,colorpick`, `,cpick`) — interactive HSL color picker\n`,colorpicker #hex` — start from a specific hex code\n`,colorpicker <image url>` — sample a color straight from an image", inline: false },
      { name: "⚙️ Custom Commands", value: "`,customcommands` (`,cc`) — check whether custom commands are enabled *(Admin)*\n`,cc enable` / `,cc disable` — toggle them for this server *(Admin)*", inline: false },
      { name: "🔧 Prefix", value: "`,setprefix <prefix>` (`,prefix`) — change the command prefix for this server *(Admin)*\n`,prefix` with no argument — view the current prefix", inline: false },
      { name: "🏷️ Stickers", value: "`,tsticker list` — view all custom server stickers *(Manage Stickers)*\n`,tsticker add <name> <url> [tags]` — add a sticker (or attach an image directly)", inline: false },
      { name: "🎶 Music Queue", value: "`,tclear` (`,clearqueue`) — clear the music queue\n`,tremove <position>` (`,remove`) — remove a specific song from the queue", inline: false },
    ],
  },
};

function overviewEmbed(author) {
  return new EmbedBuilder()
    .setAuthor({ name: "Tofin Bot", iconURL: "https://cdn.discordapp.com/embed/avatars/0.png" })
    .setTitle("<:tools:1519108058507120691>  Command Help")
    .setDescription(
      `> Use the **menu below** to browse command categories!\n\n` +
      `**<:moderation:1519184871136825395>  Moderation** — kick, mute, ban, warn, purge, anti-nuke, automod\n` +
      `**<:informationbutton:1519185565222830191>  Roles & Info** — role management, userinfo\n` +
      `**⭐  Leveling** — profile, leaderboard, level roles\n` +
      `**🎉  Fun** — polls, giveaways, games\n` +
      `**💾  Server Tools** — backups, templates, owner tools\n` +
      `**👋  Welcomer** — custom welcome messages & templates\n` +
      `**🛠️  Utilities** — color picker & tools`
    )
    .setColor(0x5865F2)
    .setFooter({ text: `Requested by ${author.username}  ·  All commands use the , prefix` })
    .setTimestamp();
}

function categoryEmbed(key, author) {
  const cat = CATEGORIES[key];
  return new EmbedBuilder()
    .setTitle(`${cat.emoji}  ${cat.label.trim()}`)
    .addFields(cat.fields)
    .setColor(cat.color)
    .setFooter({ text: `Requested by ${author.username}  ·  Use the menu to switch categories` })
    .setTimestamp();
}

function buildMenu(userId, selected = null) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help_cat:${userId}`)
    .setPlaceholder("📂  Select a category...")
    .addOptions(
      Object.entries(CATEGORIES).map(([key, cat]) => ({
        label: cat.label.trim(),
        value: key,
        emoji: cat.emoji,
        default: key === selected,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  name: "thelp",
  CATEGORIES, categoryEmbed, buildMenu,
  run(message) {
    const userId = message.author.id;
    return message.reply({
      embeds: [overviewEmbed(message.author)],
      components: [buildMenu(userId)],
    });
  },
};