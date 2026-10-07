import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTranscript, transcriptPinyin } from '../public/transcript-pinyin.mjs';

test('recognized Chinese gets tonal pinyin on one line', () => {
  assert.equal(transcriptPinyin('我家也想要去哪儿学习'), 'wǒ jiā yě xiǎng yào qù nǎ ér xué xí');
  assert.equal(transcriptPinyin('你好，我是小明。'), 'nǐ hǎo， wǒ shì xiǎo míng。');
});

test('empty or non-Chinese recognition does not pretend to be pinyin', () => {
  assert.equal(transcriptPinyin(''), '');
  assert.equal(transcriptPinyin('hello'), '');
});

test('feedback renders pinyin on its own line before large Chinese text', () => {
  const html = renderTranscript('我家也想要去哪儿学习');
  assert.match(html, /class="heard-pinyin"[^>]*>wǒ jiā yě xiǎng yào qù nǎ ér xué xí<\/div><div class="heard-chinese hanzi"/);
  assert.match(html, /class="heard-chinese hanzi"[^>]*>我家也想要去哪儿学习<\/div>/);
});
