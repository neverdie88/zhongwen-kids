import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseChineseVoice, voicePitch } from '../public/voice-style.mjs';

const voices = [
  { name: 'Eddy (Chinese (China mainland))', lang: 'zh-CN' },
  { name: 'Meijia', lang: 'zh-TW' },
  { name: 'Tingting', lang: 'zh-CN' },
];

test('standard voice keeps the browser’s first Mandarin voice', () => {
  const choice = chooseChineseVoice(voices, 'zh-CN', 'standard');
  assert.equal(choice.voice.name, 'Eddy (Chinese (China mainland))');
  assert.equal(voicePitch('standard', choice.matchedGirlVoice), 1);
});

test('girl voice prefers a Mandarin girl voice on this device', () => {
  const choice = chooseChineseVoice(voices, 'zh-CN', 'girl');
  assert.equal(choice.voice.name, 'Tingting');
  assert.equal(choice.matchedGirlVoice, true);
  assert.ok(voicePitch('girl', choice.matchedGirlVoice) > 1);
});

test('girl voice remains distinct when only one Mandarin voice exists', () => {
  const choice = chooseChineseVoice(voices.slice(0, 1), 'zh-CN', 'girl');
  assert.equal(choice.voice.name, 'Eddy (Chinese (China mainland))');
  assert.equal(choice.matchedGirlVoice, false);
  assert.ok(voicePitch('girl', false) > voicePitch('girl', true));
});
