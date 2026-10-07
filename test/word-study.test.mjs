import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizePhrase } from '../public/word-study.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const book = JSON.parse(fs.readFileSync(path.join(root, 'data/book2.json'), 'utf8'));

test('every speaking card has aligned pinyin, a meaning, and local writing strokes', () => {
  for (const lesson of book.lessons) {
    for (const phrase of lesson.phrases) {
      const tokens = tokenizePhrase(phrase.chinese, phrase.pinyin);
      assert.equal(tokens.map(token => token.text).join(''), phrase.chinese);
      for (const token of tokens.filter(token => token.isChinese)) {
        assert.ok(token.pinyin, `${phrase.chinese}: missing pinyin for ${token.text}`);
        assert.ok(token.meaning, `${phrase.chinese}: missing meaning for ${token.text}`);
        for (const char of token.text) {
          assert.ok(fs.existsSync(path.join(root, 'public/strokes', `${char}.json`)), `missing strokes for ${char}`);
        }
      }
    }
  }
});

test('the first phrase shows useful word boundaries and matching pinyin', () => {
  const phrase = book.lessons[0].phrases[0];
  const words = tokenizePhrase(phrase.chinese, phrase.pinyin).filter(token => token.isChinese);
  assert.deepEqual(words.map(token => token.text), ['我', '在', '中文', '学校', '学习']);
  assert.deepEqual(words.map(token => token.pinyin), ['wǒ', 'zài', 'zhōng wén', 'xué xiào', 'xué xí']);
});

test('erhua words keep their combined pinyin syllable', () => {
  const phrases = book.lessons.flatMap(lesson => lesson.phrases);
  const littlePhrase = phrases.find(phrase => phrase.chinese.includes('点儿'));
  const wherePhrase = phrases.find(phrase => phrase.chinese.includes('哪儿'));
  const little = tokenizePhrase(littlePhrase.chinese, littlePhrase.pinyin);
  const where = tokenizePhrase(wherePhrase.chinese, wherePhrase.pinyin);
  assert.equal(little.find(token => token.text === '点儿')?.pinyin, 'diǎnr');
  assert.equal(where.find(token => token.text === '哪儿')?.pinyin, 'nǎr');
});
