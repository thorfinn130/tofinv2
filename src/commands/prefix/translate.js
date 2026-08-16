const { EmbedBuilder } = require("discord.js");
const { warn, danger } = require("../../util/embed");

const LANG_NAMES = {
  af:"Afrikaans",sq:"Albanian",am:"Amharic",ar:"Arabic",hy:"Armenian",az:"Azerbaijani",
  eu:"Basque",be:"Belarusian",bn:"Bengali",bs:"Bosnian",bg:"Bulgarian",ca:"Catalan",
  ceb:"Cebuano",ny:"Chichewa",zh:"Chinese",co:"Corsican",hr:"Croatian",cs:"Czech",
  da:"Danish",nl:"Dutch",en:"English",eo:"Esperanto",et:"Estonian",tl:"Filipino",
  fi:"Finnish",fr:"French",fy:"Frisian",gl:"Galician",ka:"Georgian",de:"German",
  el:"Greek",gu:"Gujarati",ht:"Haitian Creole",ha:"Hausa",haw:"Hawaiian",iw:"Hebrew",
  hi:"Hindi",hmn:"Hmong",hu:"Hungarian",is:"Icelandic",ig:"Igbo",id:"Indonesian",
  ga:"Irish",it:"Italian",ja:"Japanese",jw:"Javanese",kn:"Kannada",kk:"Kazakh",
  km:"Khmer",ko:"Korean",ku:"Kurdish",ky:"Kyrgyz",lo:"Lao",la:"Latin",lv:"Latvian",
  lt:"Lithuanian",lb:"Luxembourgish",mk:"Macedonian",mg:"Malagasy",ms:"Malay",
  ml:"Malayalam",mt:"Maltese",mi:"Maori",mr:"Marathi",mn:"Mongolian",my:"Myanmar",
  ne:"Nepali",no:"Norwegian",ps:"Pashto",fa:"Persian",pl:"Polish",pt:"Portuguese",
  pa:"Punjabi",ro:"Romanian",ru:"Russian",sm:"Samoan",gd:"Scots Gaelic",sr:"Serbian",
  st:"Sesotho",sn:"Shona",sd:"Sindhi",si:"Sinhala",sk:"Slovak",sl:"Slovenian",
  so:"Somali",es:"Spanish",su:"Sundanese",sw:"Swahili",sv:"Swedish",tg:"Tajik",
  ta:"Tamil",te:"Telugu",th:"Thai",tr:"Turkish",uk:"Ukrainian",ur:"Urdu",uz:"Uzbek",
  vi:"Vietnamese",cy:"Welsh",xh:"Xhosa",yi:"Yiddish",yo:"Yoruba",zu:"Zulu",
};

async function translateText(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&dt=ld&q=${encodeURIComponent(text)}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const translated = (data[0] ?? []).map((seg) => seg[0] ?? "").join("");
  const detectedCode = data[2] ?? "auto";
  const language = LANG_NAMES[detectedCode] ?? detectedCode;

  return { translated: translated.trim(), language, langCode: detectedCode };
}

module.exports = {
  name: "translate",
  aliases: ["t"],
  async run(message) {
    const ref = message.reference;
    if (!ref) {
      return message.reply({ embeds: [warn("Reply Required", "Reply to a message and use `,t` to translate it to English.")] });
    }

    const target = await message.channel.messages.fetch(ref.messageId).catch(() => null);
    if (!target) {
      return message.reply({ embeds: [danger("Message Not Found", "Couldn't fetch the message you replied to.")] });
    }

    const content = target.content?.trim();
    if (!content) {
      return message.reply({ embeds: [warn("No Text", "The replied message has no text content to translate.")] });
    }

    const loading = await message.reply({ content: "🌐 Translating…" });

    try {
      const { translated, language, langCode } = await translateText(content);

      if (langCode === "en") {
        await loading.edit({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setTitle("🌐  Translation")
              .setColor(0x5865f2)
              .setDescription("This message is already in **English**.")
              .setTimestamp(),
          ],
        });
        return;
      }

      await loading.edit({
        content: "",
        embeds: [
          new EmbedBuilder()
            .setTitle("🌐  Translation")
            .setColor(0x5865f2)
            .addFields(
              { name: "Original Language", value: language, inline: true },
              { name: "Translated To",     value: "English", inline: true },
              { name: "Original",          value: content.length > 1024 ? content.slice(0, 1021) + "…" : content, inline: false },
              { name: "Translation",       value: translated.length > 1024 ? translated.slice(0, 1021) + "…" : translated, inline: false },
            )
            .setFooter({ text: "Powered by Google Translate" })
            .setTimestamp(),
        ],
      });
    } catch (e) {
      await loading.edit({ content: "", embeds: [danger("Translation Failed", `Could not translate: ${e.message}`)] });
    }
  },
};
