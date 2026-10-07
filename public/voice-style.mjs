const girlVoiceNames = /tingting|xiaoxiao|huihui|yaoyao|lili|xiaoyi|xiaomei|meijia|mei-jia|flo|sandy|shelley/i;

export function chooseChineseVoice(voices, lang = 'zh-CN', style = 'standard') {
  const language = lang.toLowerCase();
  const family = language.slice(0, 2);
  const exact = voices.filter(voice => voice.lang.toLowerCase() === language);
  const related = voices.filter(voice => voice.lang.toLowerCase().startsWith(family));
  const standard = exact[0] || related[0] || null;
  if (style !== 'girl' || family !== 'zh') return { voice: standard, matchedGirlVoice: false };

  const preferred = exact.find(voice => /tingting/i.test(voice.name)) ||
    exact.find(voice => girlVoiceNames.test(voice.name)) ||
    related.find(voice => girlVoiceNames.test(voice.name));
  return { voice: preferred || standard, matchedGirlVoice: Boolean(preferred) };
}

export function voicePitch(style, matchedGirlVoice) {
  if (style !== 'girl') return 1;
  return matchedGirlVoice ? 1.12 : 1.28;
}
