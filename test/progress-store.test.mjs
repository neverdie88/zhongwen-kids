import test from 'node:test';
import assert from 'node:assert/strict';
import { readProgress, saveProgress } from '../public/progress-store.mjs';

function fakeBrowser(url = 'https://neverdie88.github.io/zhongwen-kids/') {
  const cookies = new Map();
  const attributes = new Map();
  const saved = new Map();
  return {
    location: new URL(url),
    cookies,
    attributes,
    document: {
      get cookie() { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; '); },
      set cookie(value) {
        const [pair, ...flags] = value.split('; ');
        const divider = pair.indexOf('=');
        cookies.set(pair.slice(0, divider), pair.slice(divider + 1));
        attributes.set(pair.slice(0, divider), flags);
      },
    },
    localStorage: {
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: key => saved.delete(key),
    },
  };
}

test('migrates completed lessons and review results from local storage into scoped cookies', () => {
  const browser = fakeBrowser();
  browser.localStorage.setItem('little-lantern-progress-v2', JSON.stringify({
    lessons: { 1: { completed: true, stars: 3, plays: 2 } },
    speechHomework: { '1:chinese': { bestMatched: 4, total: 4 } },
  }));

  const progress = readProgress(browser);
  assert.equal(progress.lessons[1].percent, 100);
  assert.equal(progress.speechHomework['1:chinese'].bestMatched, 4);
  assert.equal(browser.localStorage.getItem('little-lantern-progress-v2'), null);
  assert.equal(browser.cookies.size, 2);
  for (const flags of browser.attributes.values()) {
    assert.ok(flags.includes('Path=/zhongwen-kids/'));
    assert.ok(flags.includes('SameSite=Lax'));
    assert.ok(flags.includes('Secure'));
  }
});

test('unfinished lesson checkpoint and percentage survive a new visit', () => {
  const browser = fakeBrowser('http://127.0.0.1:4178/');
  const progress = readProgress(browser);
  progress.lessons[2] = {
    completed: false, percent: 49,
    checkpoint: { step: 'quiz', index: 1, right: 1, total: 2 },
  };
  assert.equal(saveProgress(progress, browser), true);

  const reopened = readProgress(browser);
  assert.equal(reopened.lessons[2].percent, 49);
  assert.deepEqual(reopened.lessons[2].checkpoint, { step: 'quiz', index: 1, right: 1, total: 2 });
  assert.equal(browser.localStorage.getItem('little-lantern-progress-v2'), null);
  for (const flags of browser.attributes.values()) assert.ok(!flags.includes('Secure'));
});

test('cookie records stay within browser size limits for all lessons and review sets', () => {
  const browser = fakeBrowser();
  const progress = readProgress(browser);
  for (let number = 1; number <= 12; number++) {
    progress.lessons[number] = { completed: true, percent: 100, stars: 3, plays: 99,
      lastPlayed: '2026-10-07T12:00:00.000Z' };
    for (const mode of ['chinese', 'english']) progress.speechHomework[`${number}:${mode}`] = {
      bestMatched: 4, lastMatched: 4, lastClose: 0, total: 4, completedAt: '2026-10-07T12:00:00.000Z',
    };
  }
  assert.equal(saveProgress(progress, browser), true);
  for (const [name, value] of browser.cookies) assert.ok(`${name}=${value}`.length < 4096, name);
  for (let number = 1; number <= 12; number++) progress.lessons[number] = {
    completed: false, percent: 93, stars: 3, plays: 99,
    checkpoint: { step: 'trace', index: 0, right: 8, total: 10 },
    lastPlayed: '2026-10-07T12:00:00.000Z',
  };
  assert.equal(saveProgress(progress, browser), true);
  for (const [name, value] of browser.cookies) assert.ok(`${name}=${value}`.length < 4096, name);
});

test('uses local storage if the browser blocks cookies', () => {
  const browser = fakeBrowser();
  Object.defineProperty(browser.document, 'cookie', { get: () => '', set: () => {} });
  const progress = { lessons: { 3: { completed: true, stars: 2 } }, speechHomework: {} };
  assert.equal(saveProgress(progress, browser), true);
  assert.equal(readProgress(browser).lessons[3].percent, 100);
});
