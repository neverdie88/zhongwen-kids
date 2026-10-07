import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildLessonExercises } from '../public/exercise-data.mjs';
import { tokenizePhrase } from '../public/word-study.mjs';
import { transcriptPinyin } from '../public/transcript-pinyin.mjs';

const book = JSON.parse(readFileSync(new URL('../data/book2.json', import.meta.url), 'utf8'));
const buildEnglish = {
  1: 'I study at Chinese school.', 2: 'This is not my book.', 3: 'Today is Friday, school is over.',
  4: 'Please sit down.', 5: 'I’m really happy.', 6: 'I can tidy my little room.',
  7: 'Hands and brain.', 8: 'Why does the moon follow people?', 9: 'Where is winter?',
  10: 'I want to sprout.', 11: 'We love the Yangtze River.', 12: 'I want to go to the zoo.',
};

test('each Book 2 lesson has distinct translation, sentence, and listening choices', () => {
  for (const lesson of book.lessons) {
    const exercises = buildLessonExercises(lesson, buildEnglish[lesson.number]);
    assert.equal(exercises.translations.length, 4, `lesson ${lesson.number} translations`);
    assert.deepEqual(exercises.translations.map(item => item.direction), [
      'chinese-to-english', 'english-to-chinese', 'chinese-to-english', 'english-to-chinese',
    ]);
    for (const question of exercises.translations) {
      assert.equal(new Set(question.options).size, 3);
      assert.ok(question.options.includes(question.phraseIndex));
      assert.ok(question.options.every(index => lesson.phrases[index]));
    }

    assert.equal(exercises.builders.length, 2);
    assert.equal(exercises.builders[0].answer.join(''), lesson.build.join(''));
    assert.equal(exercises.builders[1].answer.join(' '), buildEnglish[lesson.number]);
    for (const question of exercises.builders) {
      assert.deepEqual([...question.bankOrder].sort((a, b) => a - b), question.answer.map((_, index) => index));
      assert.notDeepEqual(question.bankOrder, question.answer.map((_, index) => index));
    }

    assert.equal(exercises.listening.length, 2);
    for (const question of exercises.listening) {
      assert.equal(new Set(question.options.map(word => word.text)).size, 3);
      assert.ok(question.options.some(word => word.text === question.answer.text));
      for (const word of question.options) {
        assert.ok(lesson.phrases.some(phrase => phrase.chinese.includes(word.text)));
        assert.ok(word.pinyin && word.meaning, `lesson ${lesson.number}: ${word.text}`);
      }
    }
  }
});

test('all five new activities use valid content in every lesson', () => {
  for (const lesson of book.lessons) {
    const { audioBuild, picture, cloze, dialogue, tone } = buildLessonExercises(lesson, buildEnglish[lesson.number]);
    assert.equal(audioBuild.answer.join(''), lesson.build.join(''));
    assert.deepEqual([...audioBuild.bankOrder].sort((a, b) => a - b), audioBuild.answer.map((_, index) => index));

    assert.equal(picture.options.length, 3);
    assert.equal(new Set(picture.options.map(option => option.phraseIndex)).size, 3);
    assert.ok(picture.options.some(option => option.phraseIndex === picture.answer));
    for (const option of picture.options) {
      assert.ok(lesson.phrases[option.phraseIndex]);
      assert.ok(option.icons && option.description);
    }

    assert.equal(cloze.prefix + cloze.answer + cloze.suffix, lesson.phrases[cloze.phraseIndex].chinese);
    assert.equal(new Set(cloze.options.map(option => option.text)).size, 3);
    assert.ok(cloze.options.some(option => option.text === cloze.answer));
    assert.ok(cloze.options.every(option => option.meaning));

    assert.ok(dialogue.prompt && dialogue.english);
    assert.ok(tokenizePhrase(dialogue.prompt, transcriptPinyin(dialogue.prompt))
      .filter(token => token.isChinese).every(token => token.pinyin && token.meaning),
    `lesson ${lesson.number} dialogue word details`);
    for (const character of dialogue.prompt.match(/\p{Script=Han}/gu) || []) {
      assert.ok(existsSync(new URL(`../public/strokes/${character}.json`, import.meta.url)),
        `lesson ${lesson.number} dialogue stroke for ${character}`);
    }
    assert.equal(new Set(dialogue.options).size, 3);
    assert.ok(dialogue.options.includes(dialogue.answer));
    assert.ok(dialogue.options.every(index => lesson.phrases[index]));

    assert.equal(tone.hanzi, lesson.character);
    assert.ok(tone.audio.includes(tone.hanzi));
    assert.equal(new Set(tone.options).size, 4);
    assert.ok(tone.options[tone.answer]);
  }
});
