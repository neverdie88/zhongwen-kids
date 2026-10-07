const LESSONS_COOKIE = 'little_lantern_lessons_v1';
const REVIEW_COOKIE = 'little_lantern_review_v1';
const COOKIE_AGE = 60 * 60 * 24 * 365;
const STEPS = new Set(['learn', 'quiz', 'build', 'listening', 'speak', 'trace']);

const numberIn = (value, max) => Number.isInteger(value) ? Math.max(0, Math.min(max, value)) : 0;
const objectOrEmpty = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function normalizeProgress(source) {
  const saved = objectOrEmpty(source);
  const lessons = {};
  for (let number = 1; number <= 12; number++) {
    const item = objectOrEmpty(objectOrEmpty(saved.lessons)[number]);
    if (!Object.keys(item).length) continue;
    const completed = item.completed === true;
    const lesson = {
      completed,
      percent: completed ? 100 : numberIn(item.percent, 99),
      stars: numberIn(item.stars, 3),
      plays: numberIn(item.plays, 9999),
    };
    if (typeof item.lastPlayed === 'string') lesson.lastPlayed = item.lastPlayed;
    const checkpoint = objectOrEmpty(item.checkpoint);
    if (!completed && STEPS.has(checkpoint.step)) {
      lesson.checkpoint = {
        step: checkpoint.step,
        index: numberIn(checkpoint.index, 100),
        right: numberIn(checkpoint.right, 100),
        total: numberIn(checkpoint.total, 100),
      };
    }
    lessons[number] = lesson;
  }
  const speechHomework = {};
  const savedReview = objectOrEmpty(saved.speechHomework);
  for (let number = 1; number <= 12; number++) for (const mode of ['chinese', 'english']) {
    const key = `${number}:${mode}`;
    const item = objectOrEmpty(savedReview[key]);
    if (!Object.keys(item).length) continue;
    speechHomework[key] = {
      bestMatched: numberIn(item.bestMatched, 100),
      lastMatched: numberIn(item.lastMatched, 100),
      lastClose: numberIn(item.lastClose, 100),
      total: numberIn(item.total, 100),
      ...(typeof item.completedAt === 'string' ? { completedAt: item.completedAt } : {}),
    };
  }
  return { lessons, speechHomework };
}

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decode(value) {
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function cookieRawValue(name, browser) {
  const pair = browser.document.cookie.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : null;
}

function cookieValue(name, browser) {
  const raw = cookieRawValue(name, browser);
  if (raw === null) return null;
  try { return decode(raw); }
  catch { return null; }
}

function writeCookie(name, value, browser) {
  const path = new URL('.', browser.location.href).pathname;
  const encoded = encode(value);
  browser.document.cookie = `${name}=${encoded}; Max-Age=${COOKIE_AGE}; Path=${path}; SameSite=Lax${browser.location.protocol === 'https:' ? '; Secure' : ''}`;
  return cookieRawValue(name, browser) === encoded;
}

export function readProgress(browser = globalThis, legacyKey = 'little-lantern-progress-v2') {
  let legacy = {};
  try { legacy = JSON.parse(browser.localStorage?.getItem(legacyKey) || '{}'); }
  catch { /* Older saved data may be unavailable or malformed. */ }
  let lessonCookie = null;
  let reviewCookie = null;
  try {
    lessonCookie = cookieValue(LESSONS_COOKIE, browser);
    reviewCookie = cookieValue(REVIEW_COOKIE, browser);
  } catch { /* Cookies may be blocked. */ }
  const progress = normalizeProgress({
    lessons: lessonCookie ?? legacy?.lessons,
    speechHomework: reviewCookie ?? legacy?.speechHomework,
  });
  if ((lessonCookie === null || reviewCookie === null) && Object.keys(objectOrEmpty(legacy)).length) {
    saveProgress(progress, browser, legacyKey);
  }
  return progress;
}

export function saveProgress(progress, browser = globalThis, legacyKey = 'little-lantern-progress-v2') {
  const clean = normalizeProgress(progress);
  try {
    const lessonsSaved = writeCookie(LESSONS_COOKIE, clean.lessons, browser);
    const reviewSaved = writeCookie(REVIEW_COOKIE, clean.speechHomework, browser);
    if (lessonsSaved && reviewSaved) {
      try { browser.localStorage?.removeItem(legacyKey); } catch { /* Cookies are saved. */ }
      return true;
    }
  } catch { /* Keep a local fallback when cookies are unavailable. */ }
  try {
    if (!browser.localStorage) return false;
    browser.localStorage.setItem(legacyKey, JSON.stringify(clean));
    return true;
  }
  catch { return false; }
}
