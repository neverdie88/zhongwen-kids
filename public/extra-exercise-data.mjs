import { wordMeanings, characterMeanings } from './word-study.mjs';

// Each picture describes one of the lesson's own phrases. Descriptions are for screen readers.
const pictureScenes = {
  1: { answer: 0, scenes: [[0, '🏫📖', 'A child studying at school'], [1, '🗣️💬', 'A child speaking'], [2, '✍️📓', 'A child writing in a notebook']] },
  2: { answer: 3, scenes: [[0, '📘❓', 'Someone asks about a book'], [2, '🧒📘', 'A book belonging to a child'], [3, '🏠🗣️', 'A child speaking at home']] },
  3: { answer: 0, scenes: [[0, '🏫🔔', 'The school bell rings at the end of class'], [1, '📅5️⃣', 'A calendar showing Friday'], [3, '🧒🤝🧒', 'Two friends together']] },
  4: { answer: 1, scenes: [[0, '👋🙂', 'A friendly greeting'], [1, '🪑⬇️', 'A chair inviting someone to sit'], [2, '🎁🙏', 'Someone saying thanks for a gift']] },
  5: { answer: 1, scenes: [[0, '🎂🎈', 'A birthday celebration'], [1, '🏬🛍️', 'Shopping at a store'], [2, '🎵🎂', 'Singing a birthday song']] },
  6: { answer: 1, scenes: [[0, '🧒🎒', 'A pupil with a school bag'], [1, '🧸🧹', 'Tidying up a small room'], [2, '🧺🛁', 'Washing clothes and bathing']] },
  7: { answer: 1, scenes: [[0, '✋🧠', 'Hands and a brain'], [1, '👐🛠️', 'Hands doing work'], [2, '🧠💭', 'A brain thinking']] },
  8: { answer: 2, scenes: [[0, '🌙➡️', 'The moon moving'], [2, '🌙⬆️🏔️', 'The moon high and far away'], [3, '🙂💡', 'A child beginning to understand']] },
  9: { answer: 2, scenes: [[0, '❄️🧥', 'A cold winter day'], [1, '🌙🌑', 'The dark night'], [2, '🏞️➡️', 'River water flowing']] },
  10: { answer: 1, scenes: [[0, '☁️🌧️', 'Rain falling from clouds'], [1, '🌱⬆️', 'A seed sprouting'], [2, '🌼🌸', 'Flowers blooming']] },
  11: { answer: 2, scenes: [[1, '🟡🏞️', 'A yellow river'], [2, '🌄➡️🏞️', 'A river flowing from west to east'], [3, '❤️🏞️', 'People loving a river']] },
  12: { answer: 2, scenes: [[0, '🏫🎉', 'School holidays beginning'], [2, '🦒🐘', 'Visiting the zoo'], [3, '☀️😊', 'Enjoying a happy holiday']] },
};

const missingWords = {
  1: { phrase: 0, answer: '中文', options: ['中文', '汉语', '汉字'] },
  2: { phrase: 1, answer: '书', options: ['书', '汉字', '生日'] },
  3: { phrase: 1, answer: '星期五', options: ['星期五', '朋友', '放学'] },
  4: { phrase: 1, answer: '坐', options: ['坐', '谢谢', '再见'] },
  5: { phrase: 3, answer: '高兴', options: ['高兴', '生日', '东西'] },
  6: { phrase: 1, answer: '收拾', options: ['收拾', '洗澡', '做工'] },
  7: { phrase: 1, answer: '做工', options: ['做工', '思考', '流动'] },
  8: { phrase: 2, answer: '月亮', options: ['月亮', '河水', '双手'] },
  9: { phrase: 2, answer: '河水', options: ['河水', '月亮', '鱼儿'] },
  10: { phrase: 1, answer: '发芽', options: ['发芽', '开花', '种瓜'] },
  11: { phrase: 3, answer: '长江', options: ['长江', '黄河', '月亮'] },
  12: { phrase: 2, answer: '动物园', options: ['动物园', '中文学校', '家里'] },
};

const dialogues = {
  1: { prompt: '你在哪儿学习？', english: 'Where do you study?', answer: 0, options: [0, 1, 2] },
  2: { prompt: '这是你的书吗？', english: 'Is this your book?', answer: 1, options: [0, 1, 3] },
  3: { prompt: '今天是星期五吗？', english: 'Is today Friday?', answer: 1, options: [0, 1, 3] },
  4: { prompt: '对不起。', english: 'I am sorry.', answer: 4, options: [2, 3, 4] },
  5: { prompt: '你高兴吗？', english: 'Are you happy?', answer: 3, options: [0, 1, 3] },
  6: { prompt: '你会做什么？', english: 'What can you do?', answer: 1, options: [0, 1, 2] },
  7: { prompt: '双手会做什么？', english: 'What can hands do?', answer: 1, options: [0, 1, 2] },
  8: { prompt: '月亮在哪里？', english: 'Where is the moon?', answer: 2, options: [0, 1, 2] },
  9: { prompt: '冬天。', english: 'Winter! Ask where it is.', answer: 0, options: [0, 1, 2] },
  10: { prompt: '你想发芽。你会说什么？', english: 'You want to sprout. What do you say?', answer: 1, options: [1, 2, 3] },
  11: { prompt: '我们爱什么？', english: 'What do we love?', answer: 3, options: [1, 2, 3] },
  12: { prompt: '你们想去哪儿？', english: 'Where do you want to go?', answer: 2, options: [0, 1, 2] },
};

// Play the full word where a single character might be read differently out of context.
const tones = {
  1: { hanzi: '在', audio: '在', options: ['zāi', 'zái', 'zǎi', 'zài'], answer: 3, meaning: 'at; in' },
  2: { hanzi: '书', audio: '书', options: ['shū', 'shú', 'shǔ', 'shù'], answer: 0, meaning: 'book' },
  3: { hanzi: '朋', audio: '朋友', options: ['pēng', 'péng', 'pěng', 'pèng'], answer: 1, meaning: 'friend' },
  4: { hanzi: '礼', audio: '礼貌', options: ['lī', 'lí', 'lǐ', 'lì'], answer: 2, meaning: 'politeness' },
  5: { hanzi: '买', audio: '买东西', options: ['māi', 'mái', 'mǎi', 'mài'], answer: 2, meaning: 'to buy' },
  6: { hanzi: '会', audio: '我会做', options: ['huī', 'huí', 'huǐ', 'huì'], answer: 3, meaning: 'can; know how' },
  7: { hanzi: '手', audio: '双手', options: ['shōu', 'shóu', 'shǒu', 'shòu'], answer: 2, meaning: 'hand' },
  8: { hanzi: '月', audio: '月亮', options: ['yuē', 'yué', 'yuě', 'yuè'], answer: 3, meaning: 'moon' },
  9: { hanzi: '为', audio: '为什么', options: ['wēi', 'wéi', 'wěi', 'wèi'], answer: 3, meaning: 'why (in 为什么)' },
  10: { hanzi: '雨', audio: '下雨', options: ['yū', 'yú', 'yǔ', 'yù'], answer: 2, meaning: 'rain' },
  11: { hanzi: '江', audio: '长江', options: ['jiāng', 'jiáng', 'jiǎng', 'jiàng'], answer: 0, meaning: 'river' },
  12: { hanzi: '假', audio: '放假', options: ['jiā', 'jiá', 'jiǎ', 'jià'], answer: 3, meaning: 'holiday (in 放假)' },
};

const rotate = (items, amount) => [...items.slice(amount % items.length), ...items.slice(0, amount % items.length)];
const extraMeanings = { 种瓜: 'to plant melons', 中文学校: 'Chinese school' };

export function buildExtraExercises(lesson, buildEnglish) {
  const number = lesson.number;
  const scene = pictureScenes[number];
  const blank = missingWords[number];
  const phrase = lesson.phrases[blank.phrase];
  const position = phrase.chinese.indexOf(blank.answer);
  if (position < 0 || phrase.chinese.indexOf(blank.answer, position + blank.answer.length) !== -1) {
    throw new Error(`Lesson ${number} has an invalid missing-word exercise.`);
  }
  const dialogue = dialogues[number];
  return {
    audioBuild: { answer: [...lesson.build], bankOrder: rotate(lesson.build.map((_, index) => index), number + 1), english: buildEnglish },
    picture: { answer: scene.answer, options: rotate(scene.scenes.map(([phraseIndex, icons, description]) => ({ phraseIndex, icons, description })), number) },
    cloze: { phraseIndex: blank.phrase, answer: blank.answer, prefix: phrase.chinese.slice(0, position), suffix: phrase.chinese.slice(position + blank.answer.length),
      options: rotate(blank.options, number + 1).map(text => ({ text, meaning: wordMeanings[text] || characterMeanings[text] || extraMeanings[text] || 'a Chinese word' })) },
    dialogue: { ...dialogue, options: rotate(dialogue.options, number + 2) },
    tone: tones[number],
  };
}
