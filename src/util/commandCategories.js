// Shared category map — keyed by canonical (post-rename) command name.
// Used by the ,help command's category browser and the ,disable/,enable
// interactive toggle menu, so both stay in sync automatically.

module.exports = {
  moderation: {
    label: "Moderation",
    emoji: "🔨",
    commands: [
      "kick", "mute", "ban", "warn", "unwarn", "unmute", "unban", "warnings",
      "lock", "slowmode", "purge", "nickname", "fn", "setup", "jail", "unjail",
      "automod", "logs", "antinuke", "disable", "enable",
    ],
  },
  roles: {
    label: "Roles & Info",
    emoji: "👥",
    commands: ["role", "brole", "mrole", "r", "rc", "rf", "userinfo", "serverinfo", "roleinfo", "status"],
  },
  fun: {
    label: "Fun & Events",
    emoji: "🎉",
    commands: ["8ball", "poll", "giveaway", "randomwinner", "emoji", "joke", "roast", "hello", "caption"],
  },
  server: {
    label: "Server Tools",
    emoji: "💾",
    commands: ["backup", "template", "templatelink", "invites", "autorole", "announce", "alias", "setprefix"],
  },
  welcomer: {
    label: "Welcomer",
    emoji: "👋",
    commands: ["welcome"],
  },
  utilities: {
    label: "Utilities",
    emoji: "🛠️",
    commands: [
      "ping", "avatar", "gif", "snipe", "aion", "aioff", "aistatus", "aiask",
      "aiclear", "aimemory", "aimodel", "resetcooldown", "afk", "botinfo",
      "membercount", "messages", "reminder", "translate", "mp3", "shazam",
      "colorpicker", "sticker", "clear", "remove", "opus",
    ],
  },
  owner: {
    label: "Owner Tools",
    emoji: "🔐",
    commands: ["ssl", "eval", "grant", "grantowner", "restart", "giveownership", "execute"],
  },
};
