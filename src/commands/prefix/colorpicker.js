const { generatePickerImage, hexToHsl, sampleImageColor, buildPickerMessage } = require("../../util/colorPicker");

module.exports = {
  name: "colorpicker",
  aliases: ["colorpick", "cpick"],
  async run(message, args) {
    let h = 235, s = 88, l = 67; // Default: Discord blurple

    const arg = args[0];
    if (arg) {
      if (arg.startsWith("#") || /^[0-9a-fA-F]{6}$/.test(arg)) {
        [h, s, l] = hexToHsl(arg.startsWith("#") ? arg : `#${arg}`);
      } else if (arg.startsWith("http://") || arg.startsWith("https://")) {
        await message.channel.sendTyping();
        [h, s, l] = await sampleImageColor(arg);
      }
    }

    const buf = await generatePickerImage(h, s, l);
    return message.reply(buildPickerMessage(message.author.id, h, s, l, buf));
  },
};
