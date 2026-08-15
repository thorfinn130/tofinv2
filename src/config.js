require("dotenv").config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  prefix: process.env.PREFIX || ",",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || null,
  },
  colors: {
    primary: 0x5865f2,
    success: 0x57f287,
    warn: 0xfee75c,
    danger: 0xed4245,
  },
};