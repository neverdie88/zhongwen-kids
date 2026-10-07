import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpokenChinese, transcriptMatches, evaluateSpeechAttempt } from '../public/speech-check.mjs';

test('ignores punctuation and spacing added by speech recognition', () => {
  assert.equal(normalizeSpokenChinese('我 在中文学校学习。'), '我在中文学校学习');
  assert.equal(transcriptMatches('我在中文学校学习。', '我在中文学校学习！'), true);
});

test('accepts Traditional Chinese returned by local recognition for a Simplified textbook phrase', () => {
  assert.deepEqual(
    evaluateSpeechAttempt('我在中文学校学习。', ['我在中文學校學習']),
    { kind: 'exact', transcript: '我在中文學校學習' },
  );
});

test('requires the full expected Chinese phrase', () => {
  assert.equal(transcriptMatches('我在中文学校学习。', '我在中文学校'), false);
  assert.equal(transcriptMatches('说汉语', '写汉字'), false);
  assert.equal(transcriptMatches('说汉语', 'shuo han yu'), false);
  assert.equal(transcriptMatches('', ''), false);
});

test('accepts a nearly correct child transcript without calling it an exact match', () => {
  assert.deepEqual(
    evaluateSpeechAttempt('我在中文学校学习。', ['我在中文学校学。']),
    { kind: 'close', transcript: '我在中文学校学。' },
  );
  assert.deepEqual(
    evaluateSpeechAttempt('说汉语', ['说汉字']),
    { kind: 'close', transcript: '说汉字' },
  );
});

test('checks all recognition alternatives before deciding', () => {
  assert.deepEqual(
    evaluateSpeechAttempt('说汉语', ['我说汉语', '说汉语']),
    { kind: 'exact', transcript: '说汉语' },
  );
});

test('does not accept an unrelated or ambiguous lesson phrase', () => {
  assert.deepEqual(
    evaluateSpeechAttempt('说汉语', ['写汉字'], ['写汉字']),
    { kind: 'different', transcript: '写汉字' },
  );
  assert.deepEqual(
    evaluateSpeechAttempt('说汉语', ['写汉语'], ['写汉字']),
    { kind: 'different', transcript: '写汉语' },
  );
  assert.deepEqual(
    evaluateSpeechAttempt('我在中文学校学习。', ['今天是星期五，放学了。']),
    { kind: 'different', transcript: '今天是星期五，放学了。' },
  );
});
