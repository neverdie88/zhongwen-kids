import { tokenizePhrase, wordMeanings } from './word-study.mjs';

function shuffled(items, seed) {
  const result = [...items];
  let value = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const swap = value % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  if (result.length > 1 && result.every((item, index) => item === items[index])) result.reverse();
  return result;
}

export function buildLessonExercises(lesson, buildEnglish) {
  const translations = Array.from({ length: Math.min(4, lesson.phrases.length) }, (_, index) => ({
    phraseIndex: index,
    direction: index % 2 ? 'english-to-chinese' : 'chinese-to-english',
    options: shuffled([index, (index + 1) % lesson.phrases.length, (index + 2) % lesson.phrases.length], lesson.number * 101 + index * 19),
  }));

  const englishChunks = buildEnglish.trim().split(/\s+/u);
  const builders = [
    { direction: 'english-to-chinese', prompt: buildEnglish, answer: [...lesson.build] },
    { direction: 'chinese-to-english', prompt: lesson.build.join(''), answer: englishChunks },
  ].map((question, index) => ({
    ...question,
    bankOrder: shuffled(question.answer.map((_, position) => position), lesson.number * 211 + index * 37),
  }));

  const seen = new Set();
  const words = lesson.phrases.flatMap(phrase => tokenizePhrase(phrase.chinese, phrase.pinyin))
    .filter(token => token.isChinese && [...token.text].length >= 2 && wordMeanings[token.text] && !seen.has(token.text) && seen.add(token.text))
    .map(({ text, pinyin, meaning }) => ({ text, pinyin, meaning }));
  if (words.length < 3) throw new Error(`Lesson ${lesson.number} needs three distinct listening words.`);
  const listening = [0, 1].map(index => ({
    answer: words[index],
    options: shuffled([words[index], words[(index + 1) % words.length], words[(index + 2) % words.length]], lesson.number * 307 + index * 53),
  }));

  return { translations, builders, listening };
}
