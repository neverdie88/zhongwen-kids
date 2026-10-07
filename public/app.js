import { evaluateSpeechAttempt } from './speech-check.mjs';
import { prepareBrowserRecognizer, releaseBrowserRecognizer, transcribeInBrowser } from './browser-asr.mjs';
import { recordedAudioToSamples } from './audio-prep.mjs';
import { tokenizePhrase, wordMeanings, characterMeanings } from './word-study.mjs';
import { chooseChineseVoice, voicePitch } from './voice-style.mjs';
import { renderTranscript, transcriptPinyin } from './transcript-pinyin.mjs';
import { buildLessonExercises } from './exercise-data.mjs';
import { buildWorkbookHomework } from './workbook-homework.mjs';
import { readProgress, saveProgress as persistProgress } from './progress-store.mjs';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const SPEECH_SETTING_KEY = 'little-lantern-speech-recognizer-v1';
const VOICE_SETTING_KEY = 'little-lantern-chinese-voice-v1';
let book;
let toastTimer;
let activeRecognition = null;
let activeCapture = null;
let wordWriters = [];
let wordTrigger = null;

let progress = readProgress();
function readSpeechRecognizer() {
  try {
    const saved = localStorage.getItem(SPEECH_SETTING_KEY);
    return ['whisper-small', 'sherpa', 'browser'].includes(saved) ? saved : 'whisper-small';
  } catch { return 'whisper-small'; }
}
function readVoiceStyle() {
  try { return localStorage.getItem(VOICE_SETTING_KEY) === 'girl' ? 'girl' : 'standard'; }
  catch { return 'standard'; }
}
const newPractice = () => ({ status: 'idle', transcript: '', message: '', progress: '' });
const state = {
  view: 'home', lesson: 1, step: 'learn', phraseIndex: 0, quizIndex: 0,
  quizSelected: null, quizLastChoice: null, quizWrongOptions: new Set(), exercises: null, right: 0, total: 0,
  builderIndex: 0, builderSelected: [], builderChecked: false, builderHint: '', builderAttempted: false,
  listeningIndex: 0, listeningSelected: null, listeningLastChoice: null, listeningWrongOptions: new Set(),
  audioSelected: [], audioChecked: false, audioHint: '', audioAttempted: false,
  pictureSelected: null, pictureLastChoice: null, pictureWrongOptions: new Set(),
  clozeSelected: null, clozeLastChoice: null, clozeWrongOptions: new Set(),
  dialogueSelected: null, dialogueLastChoice: null, dialogueWrongOptions: new Set(),
  toneSelected: null, toneLastChoice: null, toneWrongOptions: new Set(),
  practice: newPractice(), traceDrawn: false,
  wordDetail: null,
  homeworkLesson: 1, homeworkMode: 'chinese', homework: null,
  workbookLesson: 1, workbook: null,
  speechRecognizer: readSpeechRecognizer(), voiceStyle: readVoiceStyle(), settingsReturnView: 'home',
};

const recognizerLabels = {
  'whisper-small': 'Whisper Small · in this browser',
  sherpa: 'sherpa-onnx · in this browser',
  browser: 'Browser speech service',
};
const recognizerName = value => value === 'whisper-small' ? 'Whisper Small' : value === 'sherpa' ? 'sherpa-onnx' : 'Browser recognition';
function saveSpeechRecognizer(value) {
  state.speechRecognizer = value;
  try { localStorage.setItem(SPEECH_SETTING_KEY, value); }
  catch { toast('Speech setting could not be saved on this device.'); }
  releaseBrowserRecognizer();
}
function saveVoiceStyle(value) {
  state.voiceStyle = value === 'girl' ? 'girl' : 'standard';
  window.speechSynthesis?.cancel?.();
  try { localStorage.setItem(VOICE_SETTING_KEY, state.voiceStyle); }
  catch { toast('Voice setting could not be saved on this device.'); }
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderSpeakingPhrase(phrase, extraClass = '') {
  const tokens = tokenizePhrase(phrase.chinese, phrase.pinyin);
  return `<div class="speaking-phrase ${extraClass}" aria-label="${escapeHtml(phrase.chinese)}">${tokens.map(token => token.isChinese
    ? `<button type="button" class="speaking-word" data-action="word-detail" data-word="${escapeHtml(token.text)}" data-pinyin="${escapeHtml(token.pinyin)}" data-meaning="${escapeHtml(token.meaning)}" aria-label="Explore ${escapeHtml(token.text)}, ${escapeHtml(token.pinyin)}"><span class="speaking-pinyin">${escapeHtml(token.pinyin)}</span><span class="speaking-hanzi hanzi">${escapeHtml(token.text)}</span></button>`
    : `<span class="speaking-punctuation hanzi" aria-hidden="true">${escapeHtml(token.text)}</span>`).join('')}</div>`;
}

function renderWordDialog() {
  const item = state.wordDetail;
  if (!item) return '';
  return `<dialog id="word-dialog" class="word-dialog" aria-labelledby="word-dialog-title" aria-modal="true">
    <button type="button" class="word-close" data-action="word-close" aria-label="Close word details">×</button>
    <div class="eyebrow">Word explorer</div><h2 id="word-dialog-title">Listen, learn, write</h2>
    <div class="word-hero"><div class="word-hero-hanzi hanzi">${escapeHtml(item.text)}</div><div class="word-hero-pinyin">${escapeHtml(item.pinyin)}</div></div>
    <div class="word-meaning"><span>English meaning</span><strong>${escapeHtml(item.meaning)}</strong></div>
    <div class="card-actions word-actions"><button type="button" class="btn btn-primary" data-action="word-listen">🔊 Hear again</button></div>
    <div class="word-writing"><div class="word-writing-head"><div><h3>How to write</h3><p>Watch each stroke in order, then copy the character on paper.</p></div><button type="button" class="btn btn-light btn-small" data-action="word-replay">↻ Replay</button></div>
      <div class="word-stroke-grid">${Array.from(item.text).filter(char => /\p{Script=Han}/u.test(char)).map((char, index) => `<div class="word-stroke-card"><div class="word-stroke-canvas" data-stroke-char="${escapeHtml(char)}" data-stroke-index="${index}" aria-label="Animated stroke order for ${escapeHtml(char)}"></div><strong class="hanzi">${escapeHtml(char)}</strong></div>`).join('')}</div>
    </div></dialog>`;
}

function clearWordWriters() {
  wordWriters.forEach(writer => { try { writer.pauseAnimation?.(); } catch { /* The drawing may already be gone. */ } });
  wordWriters = [];
}

function setupWordDialog() {
  const dialog = document.getElementById('word-dialog');
  if (!dialog) return;
  dialog.showModal();
  if (!window.HanziWriter) return;
  dialog.querySelectorAll('[data-stroke-char]').forEach(element => {
    const character = element.dataset.strokeChar;
    const writer = window.HanziWriter.create(element, character, {
      width: 112, height: 112, padding: 8, showOutline: true, showCharacter: false,
      strokeColor: '#df6b56', outlineColor: '#e5ddd4', delayBetweenStrokes: 250,
      charDataLoader: (char, onLoad, onError) => {
        fetch(new URL(`strokes/${encodeURIComponent(char)}.json`, import.meta.url)).then(response => {
          if (!response.ok) throw new Error('Stroke order unavailable');
          return response.json();
        }).then(onLoad).catch(onError);
      },
      onLoadCharDataError: () => { element.textContent = character; element.classList.add('stroke-unavailable'); },
    });
    wordWriters.push(writer);
    writer.loopCharacterAnimation();
  });
}

function closeWordDialog() {
  document.getElementById('word-dialog')?.close();
  document.getElementById('word-dialog')?.remove();
  clearWordWriters();
  state.wordDetail = null;
  if (wordTrigger?.isConnected) wordTrigger.focus();
  wordTrigger = null;
}
const lesson = () => book.lessons.find(item => item.number === state.lesson) || book.lessons[0];
const doneCount = () => Object.values(progress.lessons).filter(item => item?.completed).length;

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3500);
}

function clearToast() {
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
}

function saveProgress() {
  if (!persistProgress(progress)) toast('Progress could not be saved on this device.');
}

function chime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(650, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(900, context.currentTime + .15);
    gain.gain.setValueAtTime(.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .23);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + .23);
    oscillator.onended = () => context.close();
  } catch { /* Sound is a bonus; all feedback is visible. */ }
}

function speak(text, lang = 'zh-CN', rate = null) {
  if (!('speechSynthesis' in window)) return toast('Speech playback is unavailable in this browser.');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang; utterance.rate = rate ?? (lang.startsWith('zh') ? (state.voiceStyle === 'girl' ? .83 : .78) : .92);
  const voices = speechSynthesis.getVoices();
  const choice = chooseChineseVoice(voices, lang, state.voiceStyle);
  utterance.voice = choice.voice;
  if (lang.startsWith('zh')) utterance.pitch = voicePitch(state.voiceStyle, choice.matchedGirlVoice);
  speechSynthesis.speak(utterance);
}

function stopListening() {
  const recognition = activeRecognition;
  activeRecognition = null;
  const capture = activeCapture;
  activeCapture = null;
  clearToast();
  if (recognition) try { recognition.abort(); } catch { /* Already stopped. */ }
  if (capture) {
    clearTimeout(capture.timer);
    if (capture.recorder?.state === 'recording') capture.recorder.stop();
    capture.stream?.getTracks().forEach(track => track.stop());
  }
}

function finishActiveSpeech() {
  if (activeCapture?.recorder?.state === 'recording') {
    activeCapture.recorder.stop();
    return true;
  }
  if (activeRecognition) {
    activeRecognition.stop();
    return true;
  }
  return false;
}

async function recordAudio(engine, onWords, onError, onPhase) {
  stopListening();
  window.speechSynthesis?.cancel?.();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    onError('This browser cannot record audio for this model. Choose Browser speech service in Settings or skip speaking.');
    return;
  }
  const capture = { recorder: null, stream: null, timer: null };
  activeCapture = capture;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (activeCapture !== capture) { stream.getTracks().forEach(track => track.stop()); return; }
    capture.stream = stream;
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
      .find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    capture.recorder = recorder;
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    recorder.onerror = () => {
      if (activeCapture !== capture) return;
      stopListening();
      onError('Recording stopped unexpectedly. Please try again.');
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      clearTimeout(capture.timer);
      if (activeCapture !== capture) return;
      onPhase('processing');
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (blob.size < 200) throw new Error('I did not hear a recording. Please try again.');
        const samples = await recordedAudioToSamples(blob);
        if (activeCapture !== capture) return;
        const transcript = await transcribeInBrowser(engine, samples);
        if (activeCapture !== capture) return;
        activeCapture = null;
        onWords(transcript);
      } catch (error) {
        if (activeCapture !== capture) return;
        activeCapture = null;
        onError(error.message || 'Recognition failed. Please try again.');
      }
    };
    recorder.start();
    onPhase('recording');
    capture.timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 10000);
  } catch (error) {
    if (activeCapture !== capture) return;
    stopListening();
    onError(error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'The microphone could not start.');
  }
}

function listen(lang, onWords, onError = message => toast(message), contextPhrases = []) {
  stopListening();
  window.speechSynthesis?.cancel?.();
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { onError('Microphone recognition is unavailable in this browser.'); return false; }
  const recognition = new Recognition();
  activeRecognition = recognition;
  recognition.lang = lang; recognition.interimResults = false; recognition.maxAlternatives = 5;
  recognition.continuous = false;
  if (window.SpeechRecognitionPhrase && 'phrases' in recognition && contextPhrases.length) {
    try { recognition.phrases = contextPhrases.map(phrase => new window.SpeechRecognitionPhrase(phrase, 2)); }
    catch { /* Context hints are optional in older browsers. */ }
  }
  recognition.onresult = event => {
    if (activeRecognition !== recognition) return;
    activeRecognition = null;
    clearToast();
    const alternatives = Array.from(event.results[event.resultIndex || 0] || [])
      .map(result => result.transcript?.trim())
      .filter(Boolean);
    onWords(alternatives[0] || '', alternatives);
  };
  recognition.onerror = event => {
    if (activeRecognition !== recognition) return;
    activeRecognition = null;
    clearToast();
    onError(event.error === 'not-allowed' ? 'Microphone permission was denied.' : event.error === 'no-speech' ? 'I did not hear speech. Try again.' : 'I could not hear that clearly. Try again.');
  };
  recognition.onnomatch = () => {
    if (activeRecognition !== recognition) return;
    activeRecognition = null;
    clearToast();
    onError('I could not make out the words. Try again.');
  };
  recognition.onend = () => {
    if (activeRecognition !== recognition) return;
    activeRecognition = null;
    clearToast();
    onError('Listening ended before I heard a phrase. Try again.');
  };
  try { recognition.start(); toast('Listening…'); }
  catch { activeRecognition = null; onError('The microphone could not start.'); return false; }
  return true;
}

function nav(view) {
  stopListening();
  if (state.wordDetail) closeWordDialog();
  if (state.homework) { state.homework.listening = false; state.homework.capturePhase = ''; }
  if (state.workbook?.practice && ['loading', 'listening', 'recording', 'processing'].includes(state.workbook.practice.status)) {
    state.workbook.practice = { ...newPractice(), message: 'Ready to try reading again.' };
  }
  if (['loading', 'listening', 'recording', 'processing'].includes(state.practice.status)) {
    state.practice = { ...newPractice(), message: 'Ready to try speaking again.' };
  }
  if (view === 'settings' && state.view !== 'settings') state.settingsReturnView = state.view;
  window.speechSynthesis?.cancel?.();
  state.view = view;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startLesson(number) {
  stopListening();
  if (state.wordDetail) closeWordDialog();
  state.lesson = number;
  state.view = 'lesson'; state.step = 'learn'; state.phraseIndex = 0;
  state.quizIndex = 0; state.quizSelected = null; state.quizLastChoice = null; state.quizWrongOptions = new Set(); state.right = 0; state.total = 0;
  state.builderIndex = 0; state.builderSelected = []; state.builderChecked = false; state.builderHint = ''; state.builderAttempted = false;
  state.listeningIndex = 0; state.listeningSelected = null; state.listeningLastChoice = null; state.listeningWrongOptions = new Set();
  state.audioSelected = []; state.audioChecked = false; state.audioHint = ''; state.audioAttempted = false;
  state.pictureSelected = null; state.pictureLastChoice = null; state.pictureWrongOptions = new Set();
  state.clozeSelected = null; state.clozeLastChoice = null; state.clozeWrongOptions = new Set();
  state.dialogueSelected = null; state.dialogueLastChoice = null; state.dialogueWrongOptions = new Set();
  state.toneSelected = null; state.toneLastChoice = null; state.toneWrongOptions = new Set();
  state.practice = newPractice(); state.traceDrawn = false;
  state.exercises = buildLessonExercises(lesson(), buildEnglish[number]);
  const checkpoint = progress.lessons[number]?.checkpoint;
  if (checkpoint && !progress.lessons[number].completed) {
    const limits = { learn: lesson().phrases.length, quiz: state.exercises.translations.length,
      build: state.exercises.builders.length, listening: state.exercises.listening.length };
    state.step = checkpoint.step;
    const index = Math.min(checkpoint.index, Math.max(0, (limits[state.step] || 1) - 1));
    if (state.step === 'learn') state.phraseIndex = index;
    if (state.step === 'quiz') state.quizIndex = index;
    if (state.step === 'build') state.builderIndex = index;
    if (state.step === 'listening') state.listeningIndex = index;
    state.right = checkpoint.right;
    state.total = checkpoint.total;
  }
  saveLessonCheckpoint();
  render();
  if (state.step === 'audio-build') speak(state.exercises.audioBuild.answer.join(''));
  if (state.step === 'dialogue') speak(state.exercises.dialogue.prompt);
  if (state.step === 'tone') speak(state.exercises.tone.audio);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function lessonPercent() {
  const learnCount = lesson().phrases.length;
  const quizCount = state.exercises.translations.length;
  const buildCount = state.exercises.builders.length;
  const listeningCount = state.exercises.listening.length;
  const beforeNew = learnCount + quizCount + buildCount + listeningCount;
  const total = beforeNew + 7;
  const completed = {
    learn: state.phraseIndex,
    quiz: learnCount + state.quizIndex,
    build: learnCount + quizCount + state.builderIndex,
    listening: learnCount + quizCount + buildCount + state.listeningIndex,
    'audio-build': beforeNew,
    picture: beforeNew + 1,
    cloze: beforeNew + 2,
    dialogue: beforeNew + 3,
    tone: beforeNew + 4,
    speak: total - 2,
    trace: total - 1,
    finish: total,
  }[state.step] || 0;
  return Math.round(100 * completed / total);
}

function saveLessonCheckpoint() {
  const previous = progress.lessons[state.lesson] || {};
  if (previous.completed) return;
  const indices = { learn: state.phraseIndex, quiz: state.quizIndex, build: state.builderIndex, listening: state.listeningIndex };
  progress.lessons[state.lesson] = {
    ...previous,
    completed: false,
    percent: Math.round(lessonPercent()),
    checkpoint: { step: state.step, index: indices[state.step] || 0, right: state.right, total: state.total },
  };
  saveProgress();
}

function renderHome() {
  const completed = doneCount();
  const next = book.lessons.find(item => !progress.lessons[item.number]?.completed)?.number || 1;
  const nextStarted = !!progress.lessons[next]?.checkpoint;
  return `<section class="hero panel">
    <div class="hero-copy"><div class="eyebrow">Your Chinese adventure</div><h1>Small steps.<br>Big discoveries.</h1>
      <p>Listen, speak, translate, build sentences, explore pictures and tones, and draw characters from <span class="hanzi">《中文》第二册</span>. One cheerful lesson at a time.</p>
      <div class="hero-actions"><button class="btn btn-primary" data-action="start" data-lesson="${next}">${nextStarted ? `Continue Lesson ${next}` : completed ? 'Keep learning' : 'Start Lesson 1'} <span aria-hidden="true">→</span></button></div>
    </div><div class="mascot-scene" aria-hidden="true"><span class="spark one">✦</span><div class="mascot"><div class="mascot-mouth"></div><div class="mascot-top"></div><div class="mascot-tassel"></div></div><span class="spark two">✧</span></div>
  </section>
  <div class="overview"><div><div class="eyebrow">The learning path</div><h2>12 lessons · 4 little worlds</h2></div><div class="progress-badge">★ ${completed} of 12 complete</div></div>
  <div class="unit-grid">${book.units.map(unit => `<section class="unit-card panel"><div class="unit-head"><span class="unit-number">${unit.number}</span><div><h3>${escapeHtml(unit.title)}</h3><small>Lessons ${unit.number * 3 - 2}–${unit.number * 3}</small></div></div><div class="lesson-list">${book.lessons.filter(item => item.unit === unit.number).map(item => {
    const done = progress.lessons[item.number]?.completed;
    const percent = done ? 100 : progress.lessons[item.number]?.percent || 0;
    const status = done ? 'Complete' : percent ? `${percent}% complete` : progress.lessons[item.number]?.checkpoint ? 'In progress' : 'Not started';
    return `<button class="lesson-tile ${done ? 'done' : ''}" data-action="start" data-lesson="${item.number}"><span class="lesson-icon hanzi">${escapeHtml(item.character)}</span><span class="lesson-info"><strong class="hanzi">${escapeHtml(item.title)}</strong><small>${escapeHtml(item.englishTitle)}</small><span class="lesson-tile-meter" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Lesson ${item.number}: ${status}"><span style="width:${percent}%"></span></span><span class="lesson-tile-status">${status}</span></span><span class="tile-end" aria-hidden="true">${done ? '★' : '›'}</span></button>`;
  }).join('')}</div></section>`).join('')}</div>`;
}

function renderSettings() {
  const backLabel = state.settingsReturnView === 'lesson' ? 'Back to lesson' : state.settingsReturnView === 'review' ? 'Back to Review' : state.settingsReturnView === 'workbook' ? 'Back to Homework' : 'Back';
  const voiceChoice = chooseChineseVoice(window.speechSynthesis?.getVoices?.() || [], 'zh-CN', state.voiceStyle);
  const voiceStatus = !window.speechSynthesis ? 'Speech playback is unavailable in this browser.'
    : !voiceChoice.voice ? 'The browser has not listed its Chinese voices yet.'
    : state.voiceStyle === 'girl' && !voiceChoice.matchedGirlVoice ? `No separate girl voice was found. ${voiceChoice.voice.name} will play at a brighter pitch.`
    : `Using ${voiceChoice.voice.name} on this device.`;
  return `<div class="section-intro settings-intro"><span class="eyebrow">Settings</span><h1 class="page-title">Speech & voice</h1><p class="lead">Choose how the app hears your child and how it speaks Chinese aloud.</p></div>
    <section class="settings-panel panel"><h2>Speech recognition</h2><label class="homework-field" for="speech-recognizer">Recognizer<select id="speech-recognizer">${Object.entries(recognizerLabels).map(([value, label]) => `<option value="${value}" ${state.speechRecognizer === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <p class="homework-note">${state.speechRecognizer === 'whisper-small' ? 'Whisper Small runs in this browser. It takes longer to load and check speech.' : state.speechRecognizer === 'sherpa' ? 'sherpa-onnx runs in this browser and checks short phrases quickly.' : 'Your browser may send speech to its recognition service.'}</p>
      <p class="hint">The app checks recognized words. It cannot reliably grade pronunciation or tones, especially for a child. Every practice card has a Skip option.</p>
      <div class="settings-voice"><h2>Chinese playback voice</h2><label class="homework-field" for="voice-style">Voice<select id="voice-style"><option value="standard" ${state.voiceStyle === 'standard' ? 'selected' : ''}>Standard voice</option><option value="girl" ${state.voiceStyle === 'girl' ? 'selected' : ''}>Girl voice</option></select></label>
        <p class="homework-note">${escapeHtml(voiceStatus)} This choice applies to Hear it, word pronunciation, and other Chinese playback.</p>
        <button type="button" class="btn btn-light btn-small" data-action="voice-preview" ${window.speechSynthesis ? '' : 'disabled'}>🔊 Preview voice</button></div>
      <div class="card-actions"><button class="btn btn-primary" data-action="settings-back">${backLabel} →</button></div></section>`;
}

function practiceControls(nextAction, nextLabel) {
  const practice = state.practice;
  const done = practice.status === 'accepted' || practice.status === 'skipped';
  const busy = ['loading', 'listening', 'recording', 'processing'].includes(practice.status);
  const recording = practice.status === 'listening' || practice.status === 'recording';
  const speakLabel = practice.status === 'loading' ? 'Loading model…' : practice.status === 'processing' ? 'Checking speech…' : recording ? '✓ Done' : practice.status === 'retry' ? '🎙 Try again' : '🎙 Speak it';
  return `<div class="card-actions practice-actions"><button class="btn btn-light" data-action="speak-phrase">🔊 Hear it</button>
      ${done ? '' : `<button class="btn btn-primary" data-action="${recording ? 'practice-done' : 'practice-speak'}" ${busy && !recording ? 'disabled' : ''}>${speakLabel}</button>`}
      ${done ? '' : '<button class="btn btn-light" data-action="practice-skip">Skip speaking</button>'}</div>
    ${practice.transcript ? renderTranscript(practice.transcript) : ''}
    ${practice.message ? `<div class="feedback ${practice.status === 'accepted' ? 'good' : 'try'}" role="status">${escapeHtml(practice.message)}</div>` : ''}
    <p class="hint" role="status">${practice.status === 'loading' ? escapeHtml(practice.progress || 'Loading the speech model…') : recording ? 'Say the phrase, then tap Done. Recording stops after 10 seconds.' : 'Recognition checks words, not pronunciation or tones.'}</p>
    <div class="card-actions"><button class="btn btn-mint" data-action="${nextAction}" ${done ? '' : 'disabled'}>${nextLabel} →</button></div>`;
}

function renderPhraseChoiceFeedback(phrase, correct) {
  return `<div class="choice-feedback ${correct ? 'is-correct' : 'is-wrong'}" role="status"><strong class="choice-result">${correct ? '✓ Correct' : '✕ Try another choice'}</strong><span class="choice-caption">Your choice</span>${renderSpeakingPhrase(phrase, 'answer-phrase')}<span class="choice-meaning">Meaning: ${escapeHtml(phrase.english)}</span></div>`;
}

function renderAudioBuildCard() {
  const question = state.exercises.audioBuild;
  const chosen = new Set(state.audioSelected);
  const bank = question.bankOrder.filter(index => !chosen.has(index));
  const sentence = question.answer.join('');
  return `<span class="exercise-tag">Listen & build</span><h2>Build the sentence you hear</h2>
    <div class="speaker-symbol" aria-hidden="true">🔊</div><div class="card-actions"><button class="btn btn-primary" data-action="play-audio-build">🔊 Play the sentence</button><button class="btn btn-light" data-action="slow-audio-build">🐢 Play slowly</button></div>
    <div class="builder-answer" aria-label="Your Chinese sentence">${state.audioSelected.length ? state.audioSelected.map(index => `<button class="chunk hanzi" data-action="remove-audio-chunk" data-index="${index}" aria-label="Remove ${escapeHtml(question.answer[index])}" ${state.audioChecked ? 'disabled' : ''}>${escapeHtml(question.answer[index])}</button>`).join('') : '<span class="answer-placeholder">Listen, then tap the Chinese pieces in order</span>'}</div>
    <div class="builder-bank">${bank.map(index => `<button class="chunk hanzi" data-action="add-audio-chunk" data-index="${index}">${escapeHtml(question.answer[index])}</button>`).join('')}</div>
    ${state.audioHint ? `<div class="feedback ${state.audioChecked ? 'good' : 'try'}" role="status">${escapeHtml(state.audioHint)}</div>` : ''}
    ${state.audioChecked ? `<div class="audio-build-answer">${renderSpeakingPhrase({ chinese: sentence, pinyin: transcriptPinyin(sentence) })}<strong>${escapeHtml(question.english)}</strong></div>` : ''}
    <div class="card-actions"><button class="btn btn-light" data-action="clear-audio-build" ${state.audioChecked ? 'disabled' : ''}>Start over</button><button class="btn btn-primary" data-action="check-audio-build" ${state.audioSelected.length !== question.answer.length || state.audioChecked ? 'disabled' : ''}>Check answer</button>${state.audioChecked ? '<button class="btn btn-mint" data-action="next-audio-build">Continue →</button>' : ''}</div>
    <p class="hint">Tap a piece in your sentence to move it back. Tap a Chinese piece to hear it.</p>`;
}

function renderPictureCard(current) {
  const question = state.exercises.picture;
  const phrase = current.phrases[question.answer];
  const answered = state.pictureSelected !== null;
  const chosen = current.phrases[state.pictureLastChoice];
  return `<span class="exercise-tag">Picture match</span><h2>Which picture matches this sentence?</h2>
    ${renderSpeakingPhrase(phrase, 'exercise-prompt')}<button class="btn btn-light btn-small" data-action="play-picture">🔊 Hear the sentence</button>
    <div class="picture-options">${question.options.map((option, index) => {
      const correct = answered && option.phraseIndex === question.answer;
      const wrong = state.pictureWrongOptions.has(option.phraseIndex);
      return `<button class="option picture-choice ${correct ? 'correct' : wrong ? 'wrong' : ''}" data-action="choose-picture" data-picture="${option.phraseIndex}" aria-label="Picture ${index + 1}: ${escapeHtml(option.description)}${correct ? ', correct' : wrong ? ', wrong' : ''}" ${answered || wrong ? 'disabled' : ''}><span class="picture-scene scene-${index + 1}" aria-hidden="true">${escapeHtml(option.icons)}</span><span class="picture-number">Picture ${index + 1}</span>${correct || wrong ? `<span class="choice-mark" aria-hidden="true">${correct ? '✓' : '✕'}</span>` : ''}</button>`;
    }).join('')}</div>
    ${chosen ? renderPhraseChoiceFeedback(chosen, answered) : ''}
    ${answered ? '<div class="card-actions"><button class="btn btn-mint" data-action="next-picture">Continue →</button></div>' : ''}`;
}

function renderClozeCard(current) {
  const question = state.exercises.cloze;
  const answered = state.clozeSelected !== null;
  const chosen = question.options.find(option => option.text === state.clozeLastChoice);
  return `<span class="exercise-tag">Missing word</span><h2>Choose the missing Chinese word</h2>
    <p class="cloze-english">${escapeHtml(current.phrases[question.phraseIndex].english)}</p>
    <div class="cloze-sentence hanzi"><span>${escapeHtml(question.prefix)}</span><span class="cloze-gap" aria-label="missing word">？</span><span>${escapeHtml(question.suffix)}</span></div>
    <div class="options cloze-options">${question.options.map(option => {
      const correct = answered && option.text === question.answer;
      const wrong = state.clozeWrongOptions.has(option.text);
      return `<button class="option hanzi option-hanzi ${correct ? 'correct' : wrong ? 'wrong' : ''}" data-action="choose-cloze" data-word="${escapeHtml(option.text)}" ${answered || wrong ? 'disabled' : ''}>${escapeHtml(option.text)}${correct || wrong ? `<span class="choice-mark" aria-label="${correct ? 'Correct' : 'Wrong'}">${correct ? '✓' : '✕'}</span>` : ''}</button>`;
    }).join('')}</div>
    ${chosen ? answered ? renderPhraseChoiceFeedback(current.phrases[question.phraseIndex], true) : `<div class="choice-feedback is-wrong" role="status"><strong class="choice-result">✕ Try another word</strong><span class="choice-caption">Your choice</span><span class="choice-pinyin">${escapeHtml(transcriptPinyin(chosen.text))}</span><strong class="choice-hanzi hanzi">${escapeHtml(chosen.text)}</strong><span class="choice-meaning">Meaning: ${escapeHtml(chosen.meaning)}</span></div>` : ''}
    ${answered ? '<div class="card-actions"><button class="btn btn-mint" data-action="next-cloze">Continue →</button></div>' : ''}`;
}

function renderDialogueCard(current) {
  const question = state.exercises.dialogue;
  const answered = state.dialogueSelected !== null;
  const chosen = current.phrases[state.dialogueLastChoice];
  return `<span class="exercise-tag">Little dialogue</span><h2>Listen and reply</h2>
    <div class="dialogue-bubble"><span class="dialogue-avatar" aria-hidden="true">🧒</span><div>${renderSpeakingPhrase({ chinese: question.prompt, pinyin: transcriptPinyin(question.prompt) }, 'dialogue-prompt')}<span class="dialogue-english">${escapeHtml(question.english)}</span></div></div>
    <button class="btn btn-light btn-small" data-action="play-dialogue">🔊 Hear the question</button>
    <div class="options dialogue-options">${question.options.map(index => {
      const correct = answered && index === question.answer;
      const wrong = state.dialogueWrongOptions.has(index);
      return `<button class="option hanzi option-hanzi ${correct ? 'correct' : wrong ? 'wrong' : ''}" data-action="choose-dialogue" data-option="${index}" ${answered || wrong ? 'disabled' : ''}>${escapeHtml(current.phrases[index].chinese)}${correct || wrong ? `<span class="choice-mark" aria-label="${correct ? 'Correct' : 'Wrong'}">${correct ? '✓' : '✕'}</span>` : ''}</button>`;
    }).join('')}</div>
    ${chosen ? renderPhraseChoiceFeedback(chosen, answered) : ''}
    ${answered ? `<p class="dialogue-speak-hint">Now say your reply aloud.</p>${practiceControls('next-dialogue', 'Continue')}` : ''}`;
}

function renderToneCard() {
  const question = state.exercises.tone;
  const answered = state.toneSelected !== null;
  const correct = state.toneSelected === question.answer;
  const toneNames = ['1st · level', '2nd · rising', '3rd · dipping', '4th · falling'];
  const tonePaths = ['M4 23 L60 23', 'M4 38 L60 9', 'M4 12 Q23 46 38 33 Q48 24 60 11', 'M4 9 L60 38'];
  return `<span class="exercise-tag">Tone detective</span><h2>Which tone do you hear?</h2>
    <p class="tone-question">Listen to <strong class="hanzi">${escapeHtml(question.audio)}</strong>. Which tone is on <strong class="hanzi">${escapeHtml(question.hanzi)}</strong>?</p>
    <div class="card-actions"><button class="btn btn-primary" data-action="play-tone">🔊 Play the word</button><button class="btn btn-light" data-action="slow-tone">🐢 Play slowly</button></div>
    <div class="tone-options">${question.options.map((pinyin, index) => {
      const rightChoice = correct && index === question.answer;
      const wrongChoice = state.toneWrongOptions.has(index);
      return `<button class="option tone-option ${rightChoice ? 'correct' : wrongChoice ? 'wrong' : ''}" data-action="choose-tone" data-tone="${index}" ${answered || wrongChoice ? 'disabled' : ''}><span class="tone-pinyin">${escapeHtml(pinyin)}</span><svg viewBox="0 0 64 48" aria-hidden="true"><path d="${tonePaths[index]}"/></svg><span class="tone-name">${toneNames[index]}</span>${rightChoice || wrongChoice ? `<span class="choice-mark" aria-label="${rightChoice ? 'Correct' : 'Wrong'}">${rightChoice ? '✓' : '✕'}</span>` : ''}</button>`;
    }).join('')}</div>
    ${state.toneLastChoice !== null ? `<div class="feedback ${correct ? 'good' : 'try'}" role="status">${correct ? `✓ Yes! ${escapeHtml(question.hanzi)} means ${escapeHtml(question.meaning)}. Listen for the ${toneNames[question.answer]} tone.` : `✕ That tone did not match. Listen again and try another.`}</div>` : state.toneSelected === 'skipped' ? `<div class="feedback try" role="status">${escapeHtml(question.hanzi)} is ${escapeHtml(question.options[question.answer])}: ${toneNames[question.answer]}.</div>` : ''}
    <div class="card-actions">${answered ? '<button class="btn btn-mint" data-action="next-tone">Continue →</button>' : '<button class="btn btn-light btn-small" data-action="skip-tone">Skip this tone</button>'}</div>
    <p class="hint">Listen for the pitch shape. This is a listening game; speech recognition does not grade your tones.</p>`;
}

function lessonCard() {
  const current = lesson();
  if (state.step === 'learn') {
    const item = current.phrases[state.phraseIndex];
    return `<span class="exercise-tag">Listen & speak · ${state.phraseIndex + 1}/${current.phrases.length}</span><h2>Hear it, then say it</h2>
      ${renderSpeakingPhrase(item)}<p class="meaning">${escapeHtml(item.english)}</p><p class="word-tap-hint">Tap a word to hear it, see its meaning, and watch how to write it.</p>
      ${practiceControls('next-learn', state.phraseIndex === current.phrases.length - 1 ? 'Start meaning check' : 'Next phrase')}`;
  }
  if (state.step === 'quiz') {
    const question = state.exercises.translations[state.quizIndex];
    const item = current.phrases[question.phraseIndex];
    const chinesePrompt = question.direction === 'chinese-to-english';
    const chosen = state.quizLastChoice === null ? null : current.phrases[state.quizLastChoice];
    const answered = state.quizSelected !== null;
    return `<span class="exercise-tag">Translation choice · ${state.quizIndex + 1}/${state.exercises.translations.length}</span><h2>${chinesePrompt ? 'Choose the English meaning' : 'Choose the Chinese sentence'}</h2>
      ${chinesePrompt ? `${renderSpeakingPhrase(item, 'exercise-prompt')}<button class="btn btn-light btn-small" data-action="speak-quiz">🔊 Hear it</button>` : `<p class="translation-prompt">${escapeHtml(item.english)}</p>`}
      <div class="options">${question.options.map(optionIndex => {
        const correct = answered && optionIndex === question.phraseIndex;
        const wrong = state.quizWrongOptions.has(optionIndex);
        const className = correct ? 'correct' : wrong ? 'wrong' : '';
        return `<button class="option ${chinesePrompt ? '' : 'hanzi option-hanzi'} ${className}" data-action="choose" data-option="${optionIndex}" ${answered || wrong ? 'disabled' : ''}>${escapeHtml(chinesePrompt ? current.phrases[optionIndex].english : current.phrases[optionIndex].chinese)}${correct || wrong ? `<span class="choice-mark" aria-label="${correct ? 'Correct' : 'Wrong'}">${correct ? '✓' : '✕'}</span>` : ''}</button>`;
      }).join('')}</div>
      ${chosen ? `<div class="choice-feedback ${answered ? 'is-correct' : 'is-wrong'}" role="status"><strong class="choice-result">${answered ? '✓ Correct' : '✕ Try another choice'}</strong><span class="choice-caption">Your choice</span>${renderSpeakingPhrase(chosen, 'answer-phrase')}<span class="choice-meaning">Meaning: ${escapeHtml(chosen.english)}</span></div>` : ''}
      ${answered ? '<div class="card-actions"><button class="btn btn-primary" data-action="next-quiz">Continue →</button></div>' : ''}`;
  }
  if (state.step === 'build') {
    const question = state.exercises.builders[state.builderIndex];
    const chineseAnswer = question.direction === 'english-to-chinese';
    const selected = new Set(state.builderSelected);
    const bank = question.bankOrder.filter(index => !selected.has(index));
    return `<span class="exercise-tag">Sentence building · ${state.builderIndex + 1}/${state.exercises.builders.length}</span><h2>Build the ${chineseAnswer ? 'Chinese sentence' : 'English meaning'}</h2>
      <p class="${chineseAnswer ? 'meaning' : 'big-chinese hanzi'}">${escapeHtml(question.prompt)}</p>${chineseAnswer ? '' : '<button class="btn btn-light btn-small" data-action="speak-build">🔊 Hear the Chinese</button>'}
      <div class="builder-answer" aria-label="Your sentence">${state.builderSelected.length ? state.builderSelected.map(index => `<button class="chunk ${chineseAnswer ? 'hanzi' : ''}" data-action="remove-chunk" data-index="${index}" aria-label="Remove ${escapeHtml(question.answer[index])}" ${state.builderChecked ? 'disabled' : ''}>${escapeHtml(question.answer[index])}</button>`).join('') : '<span class="answer-placeholder">Tap the pieces below to build the sentence</span>'}</div>
      <div class="builder-bank">${bank.map(index => `<button class="chunk ${chineseAnswer ? 'hanzi' : ''}" data-action="add-chunk" data-index="${index}">${escapeHtml(question.answer[index])}</button>`).join('')}</div>
      ${state.builderHint ? `<div class="feedback ${state.builderChecked ? 'good' : 'try'}" role="status">${escapeHtml(state.builderHint)}</div>` : ''}
      <div class="card-actions"><button class="btn btn-light" data-action="clear-build" ${state.builderChecked ? 'disabled' : ''}>Start over</button><button class="btn btn-primary" data-action="check-build" ${state.builderSelected.length !== question.answer.length || state.builderChecked ? 'disabled' : ''}>Check answer</button>${state.builderChecked ? '<button class="btn btn-mint" data-action="next-build">Continue →</button>' : ''}</div>
      <p class="hint">Tap a piece in your sentence to move it back.</p>`;
  }
  if (state.step === 'listening') {
    const question = state.exercises.listening[state.listeningIndex];
    const answered = state.listeningSelected !== null;
    const correct = state.listeningSelected === question.answer.text;
    const chosen = question.options.find(option => option.text === state.listeningLastChoice);
    return `<span class="exercise-tag">Listening choice · ${state.listeningIndex + 1}/${state.exercises.listening.length}</span><h2>Which Chinese word do you hear?</h2>
      <div class="speaker-symbol" aria-hidden="true">🔊</div><div class="card-actions"><button class="btn btn-primary" data-action="play-listening">🔊 Play the word</button><button class="btn btn-light" data-action="slow-listening">🐢 Play slowly</button></div>
      <div class="options listening-options">${question.options.map(option => {
        const rightChoice = correct && option.text === question.answer.text;
        const wrongChoice = state.listeningWrongOptions.has(option.text);
        return `<button class="option hanzi option-hanzi ${rightChoice ? 'correct' : wrongChoice ? 'wrong' : ''}" data-action="choose-listening" data-word="${escapeHtml(option.text)}" ${answered || wrongChoice ? 'disabled' : ''}>${escapeHtml(option.text)}${rightChoice || wrongChoice ? `<span class="choice-mark" aria-label="${rightChoice ? 'Correct' : 'Wrong'}">${rightChoice ? '✓' : '✕'}</span>` : ''}</button>`;
      }).join('')}</div>
      ${chosen ? `<div class="choice-feedback ${correct ? 'is-correct' : 'is-wrong'}" role="status"><strong class="choice-result">${correct ? '✓ Correct' : '✕ Try another choice'}</strong><span class="choice-caption">Your choice</span><span class="choice-pinyin">${escapeHtml(chosen.pinyin)}</span><strong class="choice-hanzi hanzi">${escapeHtml(chosen.text)}</strong><span class="choice-meaning">Meaning: ${escapeHtml(chosen.meaning)}</span></div>` : answered ? `<div class="feedback try" role="status">You can practise this word again later.</div><div class="listening-answer"><span class="pinyin">${escapeHtml(question.answer.pinyin)}</span><strong class="hanzi">${escapeHtml(question.answer.text)}</strong><span>${escapeHtml(question.answer.meaning)}</span></div>` : ''}
      ${answered ? '<div class="card-actions"><button class="btn btn-mint" data-action="next-listening">Continue →</button></div>' : '<div class="card-actions"><button class="btn btn-light btn-small" data-action="skip-listening">Skip this word</button></div>'}
      <p class="hint">Audio uses the Chinese voice selected in Settings.</p>`;
  }
  if (state.step === 'audio-build') return renderAudioBuildCard();
  if (state.step === 'picture') return renderPictureCard(current);
  if (state.step === 'cloze') return renderClozeCard(current);
  if (state.step === 'dialogue') return renderDialogueCard(current);
  if (state.step === 'tone') return renderToneCard();
  if (state.step === 'speak') {
    const item = current.phrases[0];
    return `<span class="exercise-tag">Your voice</span><h2>Say it in Chinese</h2><div class="speech-wave" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      ${renderSpeakingPhrase(item)}<p class="word-tap-hint">Tap a word for meaning, pronunciation, and stroke order.</p>
      ${practiceControls('next-trace', 'Continue to tracing')}`;
  }
  if (state.step === 'trace') {
    return `<span class="exercise-tag">Character play</span><h2>Trace the character with a finger or mouse</h2><div class="trace-wrap"><span class="trace-guide hanzi">${escapeHtml(current.character)}</span><canvas id="trace-canvas" width="520" height="520" aria-label="Drawing area for ${escapeHtml(current.character)}"></canvas></div>
      <div class="card-actions"><button class="btn btn-light" data-action="clear-trace">Clear drawing</button><button class="btn btn-primary" data-action="finish-lesson" ${state.traceDrawn ? '' : 'disabled'}>Finish lesson ★</button></div><p class="hint">Draw at least one stroke and compare it with the guide. This activity does not grade handwriting.</p>`;
  }
  const earned = Math.max(1, Math.min(3, Math.ceil((state.right / Math.max(1, state.total)) * 3)));
  return `<span class="exercise-tag">Lesson complete</span><div class="result-stars" aria-label="${earned} stars">${'★'.repeat(earned)}${'☆'.repeat(3 - earned)}</div>
    <h2>Lovely work on <span class="hanzi">${escapeHtml(current.title)}</span>!</h2><p>You spoke, translated, built sentences, matched a picture, finished a dialogue, listened for tones, and drew a character.</p>
    <div class="result-stats"><span class="stat-pill">${state.right}/${state.total} first-try answers</span><span class="stat-pill">${current.phrases.length} phrases explored</span><span class="stat-pill">1 character drawn</span></div>
    <div class="card-actions"><button class="btn btn-light" data-action="start" data-lesson="${current.number}">Play again</button><button class="btn btn-mint" data-action="lesson-workbook" data-lesson="${current.number}">Workbook homework ✏️</button>${current.number < 12 ? `<button class="btn btn-primary" data-action="start" data-lesson="${current.number + 1}">Next lesson →</button>` : `<button class="btn btn-primary" data-action="home">See my path →</button>`}</div>`;
}

const buildEnglish = {
  1: 'I study at Chinese school.', 2: 'This is not my book.', 3: 'Today is Friday, school is over.',
  4: 'Please sit down.', 5: 'I’m really happy.', 6: 'I can tidy my little room.',
  7: 'Hands and brain.', 8: 'Why does the moon follow people?', 9: 'Where is winter?',
  10: 'I want to sprout.', 11: 'We love the Yangtze River.', 12: 'I want to go to the zoo.',
};

function renderLesson() {
  const current = lesson();
  return `<div class="lesson-shell"><div class="lesson-top"><button class="back" data-action="home">← Learning path</button></div>
    <div class="lesson-progress" role="progressbar" aria-valuenow="${lessonPercent()}" aria-valuemin="0" aria-valuemax="100" aria-label="Lesson progress"><span style="width:${lessonPercent()}%"></span></div>
    <div class="lesson-meta"><p class="eyebrow">Unit ${current.unit} · Lesson ${current.number} · textbook p. ${current.page}</p><h1 class="hanzi">${escapeHtml(current.title)}</h1><p>${escapeHtml(current.englishTitle)}</p></div>
    <section class="exercise-card panel" aria-live="polite">${lessonCard()}</section>
  </div>`;
}

function homeworkKey(number, mode) { return `${number}:${mode}`; }

function startReview(mode) {
  stopListening();
  if (state.wordDetail) closeWordDialog();
  state.homeworkMode = mode === 'english' ? 'english' : 'chinese';
  const number = state.homeworkLesson;
  state.homework = {
    lesson: number,
    mode: state.homeworkMode,
    lastRecognizer: state.speechRecognizer,
    queue: book.lessons.find(item => item.number === number).phrases.map((_, index) => ({ index, attempts: 0 })),
    matched: 0,
    closeMatches: 0,
    results: {},
    feedback: null,
    listening: false,
    capturePhase: '',
    error: '',
  };
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function homeworkTranscript(transcript, alternatives = [transcript]) {
  const homework = state.homework;
  if (!homework?.queue.length) return;
  homework.listening = false;
  homework.capturePhase = '';
  homework.error = '';
  const card = homework.queue[0];
  const phrases = book.lessons.find(item => item.number === homework.lesson).phrases;
  const expected = phrases[card.index].chinese;
  const result = evaluateSpeechAttempt(expected, alternatives, phrases.filter((_, index) => index !== card.index).map(item => item.chinese));
  if (result.kind === 'unheard') {
    homework.error = 'I did not catch any words. Please try again.';
    render();
    return;
  }
  if (result.kind === 'exact' || result.kind === 'close') {
    homework.matched++;
    if (result.kind === 'close') homework.closeMatches++;
    homework.results[card.index] = result.kind;
    homework.feedback = result;
    chime();
  } else {
    card.attempts++;
    homework.feedback = { kind: 'retry', transcript: result.transcript };
  }
  render();
}

function advanceHomework() {
  const homework = state.homework;
  if (!homework?.feedback || homework.feedback.kind === 'retry') return;
  const card = homework.queue.shift();
  if (homework.feedback.kind === 'skip') {
    homework.results[card.index] = 'practice';
  }
  homework.feedback = null;
  homework.error = '';
  if (!homework.queue.length) {
    const key = homeworkKey(homework.lesson, homework.mode);
    const previous = progress.speechHomework[key] || {};
    progress.speechHomework[key] = {
      bestMatched: Math.max(previous.bestMatched || 0, homework.matched),
      lastMatched: homework.matched,
      lastClose: homework.closeMatches,
      total: Object.keys(homework.results).length,
      completedAt: new Date().toISOString(),
    };
    saveProgress();
  }
  render();
}

function renderReview() {
  const homework = state.homework;
  const chosenLesson = book.lessons.find(item => item.number === state.homeworkLesson);
  if (!homework) {
    return `<div class="section-intro homework-intro"><span class="eyebrow">Speaking review</span><h1 class="page-title">Say it in Chinese ✨</h1><p class="lead">Choose a lesson and one of two speaking sets. Each set practises every phrase in that lesson.</p></div>
      <section class="homework-setup panel"><h2>Choose a lesson</h2>
        <label class="homework-field review-lesson-field">Lesson<select id="homework-lesson">${book.lessons.map(item => `<option value="${item.number}" ${state.homeworkLesson === item.number ? 'selected' : ''}>${item.number}. ${escapeHtml(item.title)} · ${escapeHtml(item.englishTitle)}</option>`).join('')}</select></label>
        <h2 class="review-sets-title">Choose a speaking set</h2>
        <div class="review-set-grid"><button class="review-set" data-action="review-start" data-mode="chinese"><span class="review-set-number">Set 1</span><strong>See Chinese, say Chinese</strong><span>Read each Chinese sentence aloud.</span><small>${chosenLesson.phrases.length} sentences${progress.speechHomework[homeworkKey(state.homeworkLesson, 'chinese')] ? ` · Best ${progress.speechHomework[homeworkKey(state.homeworkLesson, 'chinese')].bestMatched}/${chosenLesson.phrases.length}` : ''}</small></button>
          <button class="review-set" data-action="review-start" data-mode="english"><span class="review-set-number">Set 2</span><strong>See English, say Chinese</strong><span>Translate each English meaning into a spoken Chinese sentence.</span><small>${chosenLesson.phrases.length} sentences${progress.speechHomework[homeworkKey(state.homeworkLesson, 'english')] ? ` · Best ${progress.speechHomework[homeworkKey(state.homeworkLesson, 'english')].bestMatched}/${chosenLesson.phrases.length}` : ''}</small></button></div>
        <div class="speech-setting-summary"><div><span class="eyebrow">Speech recognition</span><strong>${escapeHtml(recognizerLabels[state.speechRecognizer])}</strong></div><button class="btn btn-light btn-small" data-action="settings">⚙ Change</button></div>
        <p class="homework-note">Every recognizer can mishear a child. The check compares recognized words, not pronunciation or tones. Each card has a skip option.</p>
      </section>`;
  }
  const lessonData = book.lessons.find(item => item.number === homework.lesson);
  const total = lessonData.phrases.length;
  if (!homework.queue.length) {
    return `<div class="section-intro homework-intro"><span class="eyebrow">Review set ${homework.mode === 'english' ? '2' : '1'} · Lesson ${homework.lesson}</span><h1 class="page-title">Set complete!</h1></div>
      <section class="homework-summary panel"><div class="result-stars" aria-hidden="true">${'★'.repeat(homework.matched)}${'☆'.repeat(total - homework.matched)}</div>
        <h2>${homework.matched} of ${total} phrases accepted</h2><p>You practised every phrase in <span class="hanzi">${escapeHtml(lessonData.title)}</span>. Exact and close word matches count here; this does not grade tones.</p>
        <div class="result-stats"><span class="stat-pill">${homework.matched} accepted checks</span><span class="stat-pill">${homework.closeMatches} close matches</span><span class="stat-pill">${total - homework.matched} to practise again</span></div>
        <div class="card-actions"><button class="btn btn-light" data-action="review-restart">Try this set again</button><button class="btn btn-primary" data-action="review-setup">Choose another set →</button></div>
      </section>`;
  }
  const card = homework.queue[0];
  const phrase = lessonData.phrases[card.index];
  const completed = total - homework.queue.length;
  const feedback = homework.feedback;
  const feedbackRecognizerName = recognizerName(homework.lastRecognizer || state.speechRecognizer);
  const answerVisible = !!feedback;
  const feedbackText = feedback?.kind === 'exact' ? `${feedbackRecognizerName} heard the expected Chinese words. ★`
    : feedback?.kind === 'close' ? `That was close enough for this practice! ${feedbackRecognizerName} may have misheard a word. ★`
    : feedback?.kind === 'retry' ? `${feedbackRecognizerName} heard different words. It may have misheard you—listen and try again.`
    : feedback?.kind === 'skip' ? 'Practice completed without a microphone. No match star was awarded.' : '';
  return `<div class="section-intro homework-intro"><button class="review-back" data-action="review-setup">← Choose another set</button><div class="eyebrow">Review set ${homework.mode === 'english' ? '2' : '1'} · Lesson ${homework.lesson}</div><h1 class="page-title">${escapeHtml(lessonData.englishTitle)}</h1><p class="lead">${homework.mode === 'english' ? 'Read the English meaning and say the Chinese sentence.' : 'Read the Chinese sentence out loud.'}</p></div>
    <div class="homework-top"><span>${completed} of ${total} cards finished</span><span class="homework-count">★ ${homework.matched} accepted · ${homework.queue.length} remaining</span></div>
    <div class="homework-meter" role="progressbar" aria-valuenow="${completed}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Review progress"><span style="width:${100 * completed / total}%"></span></div>
    <section class="homework-card panel" aria-live="polite"><span class="exercise-tag">Card ${card.index + 1} of ${total}${card.attempts ? ` · try ${card.attempts + 1}` : ''}</span>
      <h2>${homework.mode === 'english' ? 'Say this in Chinese' : 'Say this sentence'}</h2>
      ${homework.mode === 'english' ? `<div class="homework-prompt">${escapeHtml(phrase.english)}</div>` : renderSpeakingPhrase(phrase)}
      ${!answerVisible ? `<p class="homework-hint">${homework.mode === 'english' ? 'The Chinese words and pinyin appear after you try.' : 'Tap a word for its meaning, pronunciation, and writing strokes.'}</p>` : ''}
      ${feedback?.transcript ? renderTranscript(feedback.transcript) : ''}
      ${feedback ? `<div class="feedback ${feedback.kind === 'exact' || feedback.kind === 'close' ? 'good' : 'try'}">${feedbackText}</div>
        <div class="homework-answer">${homework.mode === 'english' ? renderSpeakingPhrase(phrase, 'answer') : ''}<div>${escapeHtml(phrase.english)}</div></div>` : ''}
      ${homework.error ? `<div class="feedback try" role="status">${escapeHtml(homework.error)}</div>` : ''}
      <div class="card-actions homework-actions">
        ${!feedback || feedback.kind === 'retry' ? `<button class="btn btn-primary" data-action="${['listening', 'recording'].includes(homework.capturePhase) ? 'review-done' : 'review-mic'}" ${homework.listening && !['listening', 'recording'].includes(homework.capturePhase) ? 'disabled' : ''}>${homework.capturePhase === 'loading' ? 'Loading speech model…' : homework.capturePhase === 'processing' ? 'Checking speech…' : ['listening', 'recording'].includes(homework.capturePhase) ? '✓ Done' : feedback ? '🎙 Try again' : '🎙 Speak it'}</button>` : ''}
        ${answerVisible ? `<button class="btn btn-light" data-action="review-hear">🔊 Hear the answer</button>` : ''}
        ${!feedback || feedback.kind === 'retry' ? '<button class="btn btn-light" data-action="review-skip">Skip speaking</button>' : ''}
        ${feedback && feedback.kind !== 'retry' ? `<button class="btn btn-mint" data-action="review-next">${homework.queue.length === 1 ? 'See my results' : 'Next card'} →</button>` : ''}
      </div>
      <p class="hint" role="status">${homework.capturePhase === 'loading' ? escapeHtml(homework.modelProgress || 'Loading model…') : ['listening', 'recording'].includes(homework.capturePhase) ? 'Speak the sentence, then tap Done. Recording stops automatically after 10 seconds.' : 'A close word match counts. Speech recognition does not judge pronunciation quality.'}</p>
    </section>`;
}

const workbookLabels = {
  write: 'Write a character', strokes: 'Count the strokes', parts: 'Build a character',
  spell: 'Choose the word', cloze: 'Fill the blank', order: 'Put words in order', read: 'Read aloud',
};
const workbookOptionMeanings = { 画: 'draw', 星期: 'week or weekday', 具: 'tool', 飞: 'fly', 条: 'measure word for long things', 本: 'measure word for books', 告诉: 'tell', 游泳: 'swim', 旅游: 'travel' };
const workbookCard = () => state.workbook?.pack.cards[state.workbook.index];
function startWorkbook(number, replay = false) {
  stopListening();
  if (state.wordDetail) closeWordDialog();
  const lessonData = book.lessons.find(item => item.number === number);
  if (!lessonData) return;
  const saved = progress.workbookHomework[number];
  state.workbookLesson = number;
  state.workbook = {
    lesson: number, pack: buildWorkbookHomework(lessonData),
    index: replay || saved?.completed ? 0 : saved?.index || 0,
    choice: null, lastChoice: null, wrong: new Set(), selected: [], checked: false,
    drawn: false, hint: '', practice: newPractice(),
  };
  state.view = 'workbook';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function advanceWorkbook() {
  const homework = state.workbook;
  if (!homework || homework.index >= homework.pack.cards.length) return;
  homework.index++;
  homework.choice = null; homework.lastChoice = null; homework.wrong = new Set();
  homework.selected = []; homework.checked = false; homework.drawn = false;
  homework.hint = ''; homework.practice = newPractice();
  progress.workbookHomework[homework.lesson] = {
    index: homework.index, completed: homework.index === homework.pack.cards.length,
  };
  saveProgress();
  if (homework.index === homework.pack.cards.length) chime();
  render();
}
function workbookChoiceOptions(card) {
  const homework = state.workbook;
  return `<div class="workbook-options">${card.options.map((option, index) => {
    const text = String(option);
    const right = homework.choice === text;
    const wrong = homework.wrong.has(text);
    return `<button type="button" class="option ${card.type === 'strokes' ? '' : 'hanzi option-hanzi'} ${right ? 'correct' : wrong ? 'wrong' : ''}" data-action="workbook-choose" data-option="${index}" ${homework.choice !== null || wrong ? 'disabled' : ''}>${escapeHtml(text)}${right || wrong ? `<span class="choice-mark" aria-label="${right ? 'Correct' : 'Wrong'}">${right ? '✓' : '✕'}</span>` : ''}</button>`;
  }).join('')}</div>`;
}
function workbookAnswerNote(card) {
  if (state.workbook.choice === null && !state.workbook.checked) return '';
  const sentence = card.type === 'cloze' ? card.prefix + card.answer + card.suffix
    : card.type === 'order' ? card.answer.join('') : '';
  if (sentence) return `<div class="workbook-answer"><div class="workbook-answer-pinyin">${escapeHtml(transcriptPinyin(sentence))}</div><div class="workbook-answer-chinese hanzi">${escapeHtml(sentence)}</div><p>${escapeHtml(card.english)}</p><button class="btn btn-light btn-small" data-action="workbook-hear" data-text="${escapeHtml(sentence)}">🔊 Hear it</button></div>`;
  if (card.type === 'strokes') return `<div class="workbook-answer"><strong class="hanzi">${escapeHtml(card.character)}</strong><p>${card.count} strokes</p></div>`;
  const meaning = card.meaning || (card.type === 'spell' ? wordMeanings[card.answer] : characterMeanings[card.answer] || wordMeanings[card.answer]);
  return `<div class="workbook-answer"><strong class="hanzi">${escapeHtml(card.answer)}</strong>${meaning ? `<p>${escapeHtml(meaning)}</p>` : ''}</div>`;
}
function renderWorkbookTask(card) {
  const homework = state.workbook;
  if (card.type === 'write') return `<h2>Write <span class="hanzi">${escapeHtml(card.character)}</span></h2>
    <p>Trace this character in the square, then compare it with the guide.</p>
    <div class="trace-wrap workbook-trace"><span class="trace-guide hanzi">${escapeHtml(card.character)}</span><canvas id="workbook-trace-canvas" width="520" height="520" aria-label="Drawing area for ${escapeHtml(card.character)}"></canvas></div>
    <div class="card-actions"><button class="btn btn-light" data-action="workbook-clear-drawing">Clear drawing</button><button class="btn btn-primary" data-action="workbook-next" ${homework.drawn ? '' : 'disabled'}>Continue →</button></div><p class="hint">At least one stroke unlocks Continue. Your handwriting is not automatically graded.</p>`;
  if (card.type === 'strokes') return `<h2>How many strokes?</h2><div class="workbook-big-char hanzi">${escapeHtml(card.character)}</div><p>Count each pen stroke in this character.</p>${workbookChoiceOptions(card)}${workbookFeedback(card)}${homework.choice !== null ? workbookAnswerNote(card) : ''}`;
  if (card.type === 'parts') return `<h2>Put the parts together</h2><div class="workbook-parts hanzi"><span>${escapeHtml(card.pieces[0])}</span><b>+</b><span>${escapeHtml(card.pieces[1])}</span><b>=</b><span>?</span></div><p>Which character do these parts make?</p>${workbookChoiceOptions(card)}${workbookFeedback(card)}${homework.choice !== null ? workbookAnswerNote(card) : ''}`;
  if (card.type === 'spell') return `<h2>Choose the Chinese word</h2><p class="workbook-clue">${escapeHtml(wordMeanings[card.answer] || 'Listen and find the matching word.')}</p><button class="btn btn-light btn-small" data-action="workbook-hear" data-text="${escapeHtml(card.answer)}">🔊 Hear the word</button>${workbookChoiceOptions(card)}${workbookFeedback(card)}${homework.choice !== null ? workbookAnswerNote(card) : ''}`;
  if (card.type === 'cloze') return `<h2>Fill the blank</h2><div class="workbook-sentence hanzi">${escapeHtml(card.prefix)}<span class="workbook-blank">?</span>${escapeHtml(card.suffix)}</div><p>Choose the missing Chinese word.</p>${workbookChoiceOptions(card)}${workbookFeedback(card)}${homework.choice !== null ? workbookAnswerNote(card) : ''}`;
  if (card.type === 'order') {
    const bank = card.bankOrder.filter(index => !homework.selected.includes(index));
    return `<h2>Put the words in order</h2><p class="workbook-clue">${escapeHtml(card.english)}</p>
      <div class="builder-answer workbook-builder" aria-label="Your Chinese sentence">${homework.selected.length ? homework.selected.map(index => `<button class="chunk hanzi" data-action="workbook-remove-chunk" data-index="${index}" ${homework.checked ? 'disabled' : ''}>${escapeHtml(card.answer[index])}</button>`).join('') : '<span class="answer-placeholder">Tap the Chinese pieces in order</span>'}</div>
      <div class="builder-bank workbook-builder">${bank.map(index => `<button class="chunk hanzi" data-action="workbook-add-chunk" data-index="${index}">${escapeHtml(card.answer[index])}</button>`).join('')}</div>
      ${homework.hint ? `<div class="feedback ${homework.checked ? 'good' : 'try'}" role="status">${escapeHtml(homework.hint)}</div>` : ''}
      ${homework.checked ? workbookAnswerNote(card) : ''}
      <div class="card-actions"><button class="btn btn-light" data-action="workbook-clear-order" ${homework.checked ? 'disabled' : ''}>Start over</button><button class="btn btn-primary" data-action="workbook-check-order" ${homework.selected.length !== card.answer.length || homework.checked ? 'disabled' : ''}>Check answer</button>${homework.checked ? '<button class="btn btn-mint" data-action="workbook-next">Continue →</button>' : ''}</div>`;
  }
  const practice = homework.practice;
  const busy = ['loading', 'listening', 'recording', 'processing'].includes(practice.status);
  const accepted = ['accepted', 'skipped'].includes(practice.status);
  return `<h2>Read this aloud</h2>${renderSpeakingPhrase(card.phrase, 'workbook-read-phrase')}
    <p class="word-tap-hint">Tap a word to hear it, see its meaning, and watch how to write it.</p>
    ${practice.transcript ? renderTranscript(practice.transcript) : ''}
    ${practice.message ? `<div class="feedback ${accepted ? 'good' : 'try'}" role="status">${escapeHtml(practice.message)}</div>` : ''}
    <div class="card-actions"><button class="btn btn-light" data-action="workbook-hear" data-text="${escapeHtml(card.phrase.chinese)}">🔊 Hear it</button>
      ${accepted ? '' : `<button class="btn btn-primary" data-action="${['listening', 'recording'].includes(practice.status) ? 'workbook-done' : 'workbook-speak'}" ${busy && !['listening', 'recording'].includes(practice.status) ? 'disabled' : ''}>${practice.status === 'loading' ? 'Loading speech model…' : practice.status === 'processing' ? 'Checking speech…' : ['listening', 'recording'].includes(practice.status) ? '✓ Done' : '🎙 Speak it'}</button><button class="btn btn-light" data-action="workbook-skip">Skip speaking</button>`}
      ${accepted ? '<button class="btn btn-mint" data-action="workbook-next">Continue →</button>' : ''}</div>
    <p class="hint" role="status">${escapeHtml(practice.progress || (busy ? 'Speak the sentence, then tap Done.' : 'A close word match counts. The recognizer does not grade tones or pronunciation quality.'))}</p>`;
}
function workbookFeedback(card) {
  const homework = state.workbook;
  const isCorrect = homework.choice !== null;
  const selected = homework.lastChoice;
  const chosenText = card.type === 'cloze' ? card.prefix + selected + card.suffix : selected;
  const meaning = wordMeanings[selected] || characterMeanings[selected] || workbookOptionMeanings[selected];
  const selectedNote = !isCorrect && selected !== null && card.type !== 'strokes'
    ? `<div class="workbook-attempt"><div class="workbook-answer-pinyin">${escapeHtml(transcriptPinyin(chosenText))}</div><div class="workbook-answer-chinese hanzi">${escapeHtml(chosenText)}</div><p>${meaning ? `Your chosen ${card.type === 'parts' ? 'character' : 'word'} means “${escapeHtml(meaning)}.”` : 'This choice does not make the word asked for here.'}</p></div>` : '';
  return `${homework.lastChoice !== null ? `<div class="feedback ${isCorrect ? 'good' : 'try'}" role="status">${isCorrect ? card.type === 'strokes' ? '✓ Correct stroke count!' : '✓ Correct! Listen and read the answer below.' : '✕ Try another choice. The correct answer stays hidden.'}</div>` : ''}
    ${selectedNote}
    ${isCorrect ? '<div class="card-actions"><button class="btn btn-mint" data-action="workbook-next">Continue →</button></div>' : ''}`;
}
function renderWorkbook() {
  const homework = state.workbook;
  const selected = book.lessons.find(item => item.number === state.workbookLesson);
  const selectedPack = buildWorkbookHomework(selected);
  if (!homework) {
    const saved = progress.workbookHomework[state.workbookLesson];
    return `<div class="section-intro workbook-intro"><span class="eyebrow">Book 2 · Workbooks A and B</span><h1 class="page-title">Workbook homework ✏️</h1><p class="lead">Pick a lesson. Each seven-card set follows pages from that lesson’s printed workbook, with short interactive versions of its exercises.</p></div>
      <section class="workbook-setup panel"><h2>Choose a lesson</h2><label class="homework-field">Lesson<select id="workbook-lesson">${book.lessons.map(item => `<option value="${item.number}" ${state.workbookLesson === item.number ? 'selected' : ''}>${item.number}. ${escapeHtml(item.title)} · ${escapeHtml(item.englishTitle)}</option>`).join('')}</select></label>
      <div class="workbook-source"><strong>Workbook ${selectedPack.booklet}</strong><span>Printed pages ${selectedPack.firstPage}–${selectedPack.lastPage}</span><span>7 activities · 5 workbook days</span></div>
      <div class="workbook-card-list">${selectedPack.cards.map(card => `<span>${escapeHtml(workbookLabels[card.type])} <small>p. ${card.page}</small></span>`).join('')}</div>
      <p class="homework-note">These are selected, adapted exercises. Wrong answers stay on the same card until corrected. Drawing and speaking have clear practice checks; the microphone can mishear a child.</p>
      <div class="card-actions"><button class="btn btn-primary" data-action="workbook-start">${saved?.completed ? 'Play again' : saved?.index ? `Continue card ${saved.index + 1}` : 'Start homework'} →</button></div></section>`;
  }
  const lessonData = book.lessons.find(item => item.number === homework.lesson);
  const total = homework.pack.cards.length;
  if (homework.index >= total) return `<div class="section-intro workbook-intro"><button class="review-back" data-action="workbook-back">← Choose another lesson</button><span class="eyebrow">Workbook ${homework.pack.booklet} · Lesson ${homework.lesson}</span><h1 class="page-title">Homework complete! ★</h1></div>
    <section class="workbook-card panel workbook-done"><div class="result-stars" aria-hidden="true">✓</div><h2>Great work on <span class="hanzi">${escapeHtml(lessonData.title)}</span>!</h2><p>You finished seven workbook activities. Play again any time to practise the words and reading card.</p><div class="card-actions"><button class="btn btn-light" data-action="workbook-replay">Play again</button><button class="btn btn-primary" data-action="workbook-back">Choose another lesson →</button></div></section>`;
  const card = workbookCard();
  return `<div class="section-intro workbook-intro"><button class="review-back" data-action="workbook-back">← Choose another lesson</button><span class="eyebrow">Workbook ${card.booklet} · Lesson ${homework.lesson} · ${card.day}</span><h1 class="page-title hanzi">${escapeHtml(lessonData.title)}</h1><p class="lead">Adapted from printed workbook page ${card.page}.</p></div>
    <div class="homework-top"><span>${homework.index} of ${total} cards finished</span><span>${escapeHtml(workbookLabels[card.type])} · p. ${card.page}</span></div>
    <div class="homework-meter" role="progressbar" aria-valuenow="${homework.index}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Workbook homework progress"><span style="width:${100 * homework.index / total}%"></span></div>
    <section class="workbook-card panel" aria-live="polite"><span class="exercise-tag">Card ${homework.index + 1} of ${total} · ${escapeHtml(card.day)}</span>${renderWorkbookTask(card)}</section>`;
}

function startWorkbookPractice() {
  const homework = state.workbook;
  const card = workbookCard();
  if (state.view !== 'workbook' || card?.type !== 'read') return;
  const practice = homework.practice;
  if (['accepted', 'skipped', 'loading', 'listening', 'recording', 'processing'].includes(practice.status)) return;
  const expected = card.phrase.chinese;
  const isCurrent = () => state.view === 'workbook' && state.workbook === homework && homework.practice === practice && workbookCard() === card &&
    ['loading', 'listening', 'recording', 'processing'].includes(practice.status);
  practice.message = ''; practice.transcript = ''; practice.progress = '';
  recognizeChinese(isCurrent, [expected], (words, alternatives) => {
    const result = evaluateSpeechAttempt(expected, alternatives, []);
    practice.transcript = result.transcript;
    practice.status = ['exact', 'close'].includes(result.kind) ? 'accepted' : 'retry';
    practice.message = practice.status === 'accepted' ? 'The recognizer heard the expected words. ✓' : 'I heard different words. Listen and try again, or skip speaking.';
    if (practice.status === 'accepted') chime();
    render();
  }, message => { practice.status = 'retry'; practice.message = `${message} Try again or skip speaking.`; render(); },
  (phase, progressMessage) => { practice.status = phase; practice.progress = progressMessage || ''; render(); });
}

function render() {
  clearWordWriters();
  app.innerHTML = (state.view === 'lesson' ? renderLesson() : state.view === 'review' ? renderReview() : state.view === 'workbook' ? renderWorkbook() : state.view === 'settings' ? renderSettings() : renderHome()) + renderWordDialog();
  const activeNav = state.view === 'lesson' ? 'home' : state.view;
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.classList.toggle('active', button.dataset.nav === activeNav);
    button.setAttribute('aria-current', button.dataset.nav === activeNav ? 'page' : 'false');
  });
  if (state.view === 'lesson' && state.step === 'trace') setupTrace();
  if (state.view === 'workbook' && workbookCard()?.type === 'write') setupWorkbookTrace();
  if (state.wordDetail) setupWordDialog();
}

function setupTrace() {
  const canvas = document.getElementById('trace-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ec755f'; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false;
  const point = event => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; };
  canvas.onpointerdown = event => { drawing = true; state.traceDrawn = true; document.querySelector('[data-action="finish-lesson"]').disabled = false; canvas.setPointerCapture(event.pointerId); const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + .1, p.y + .1); ctx.stroke(); };
  canvas.onpointermove = event => { if (!drawing) return; const p = point(event); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; };
}

function setupWorkbookTrace() {
  const canvas = document.getElementById('workbook-trace-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ec755f'; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false;
  const point = event => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; };
  canvas.onpointerdown = event => {
    drawing = true; state.workbook.drawn = true;
    document.querySelector('[data-action="workbook-next"]').disabled = false;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + .1, p.y + .1); ctx.stroke();
  };
  canvas.onpointermove = event => { if (!drawing) return; const p = point(event); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; };
}

function finishLesson() {
  const current = lesson();
  const stars = Math.max(1, Math.min(3, Math.ceil((state.right / Math.max(1, state.total)) * 3)));
  const previous = progress.lessons[current.number] || {};
  progress.lessons[current.number] = { completed: true, percent: 100, stars: Math.max(previous.stars || 0, stars), lastPlayed: new Date().toISOString(), plays: (previous.plays || 0) + 1 };
  saveProgress(); state.step = 'finish'; chime(); render();
}

function recognizeChinese(isCurrent, phrases, onWords, onError, onPhase) {
  const engine = state.speechRecognizer;
  if (engine === 'browser') {
    onPhase('listening');
    return listen('zh-CN', (words, alternatives) => {
      if (isCurrent()) onWords(words, alternatives);
    }, message => {
      if (isCurrent()) onError(message);
    }, phrases);
  }
  onPhase('loading');
  prepareBrowserRecognizer(engine, message => {
    if (isCurrent()) onPhase('loading', message);
  }).then(() => {
    if (!isCurrent()) return;
    recordAudio(engine, words => {
      if (isCurrent()) onWords(words, [words]);
    }, message => {
      if (isCurrent()) onError(message);
    }, phase => {
      if (isCurrent()) onPhase(phase);
    });
  }).catch(error => {
    if (isCurrent()) onError(error.message || 'The browser speech model could not load.');
  });
}

function startLessonPractice() {
  if (state.view !== 'lesson' || !['learn', 'dialogue', 'speak'].includes(state.step)) return;
  if (state.step === 'dialogue' && state.dialogueSelected === null) return;
  const practice = state.practice;
  if (['accepted', 'skipped', 'loading', 'listening', 'recording', 'processing'].includes(practice.status)) return;
  const step = state.step;
  const lessonData = lesson();
  const index = step === 'learn' ? state.phraseIndex : step === 'dialogue' ? state.exercises.dialogue.answer : 0;
  const expected = lessonData.phrases[index].chinese;
  const isCurrent = () => state.view === 'lesson' && state.step === step && state.practice === practice &&
    ['loading', 'listening', 'recording', 'processing'].includes(practice.status);
  practice.message = '';
  practice.transcript = '';
  practice.progress = '';
  recognizeChinese(isCurrent, lessonData.phrases.map(item => item.chinese), (words, alternatives) => {
    const result = evaluateSpeechAttempt(expected, alternatives, lessonData.phrases.filter((_, position) => position !== index).map(item => item.chinese));
    practice.transcript = result.transcript;
    practice.status = result.kind === 'exact' || result.kind === 'close' ? 'accepted' : 'retry';
    practice.message = result.kind === 'exact' ? 'The recognizer heard the expected words. Nice work! ✨'
      : result.kind === 'close' ? 'That was close enough for this practice. The recognizer may have misheard a word. ✨'
      : result.kind === 'unheard' ? 'I did not hear words. Try again, or skip this phrase.'
      : 'I heard different words. Hear it again and try once more, or skip this phrase.';
    if (practice.status === 'accepted') chime();
    render();
  }, message => {
    practice.status = 'retry';
    practice.message = `${message} You can try again or skip.`;
    render();
  }, (phase, progressMessage) => {
    if (practice.status === phase && practice.progress === (progressMessage || '')) return;
    practice.status = phase;
    practice.progress = progressMessage || '';
    render();
  });
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (target.tagName === 'A') event.preventDefault();
  if (['home', 'review', 'workbook', 'settings'].includes(action)) return nav(action);
  if (action === 'settings-back') return nav(state.settingsReturnView);
  if (action === 'voice-preview') return speak('你好！我喜欢学中文。');
  if (action === 'word-detail') {
    wordTrigger = target;
    state.wordDetail = { text: target.dataset.word, pinyin: target.dataset.pinyin, meaning: target.dataset.meaning };
    app.insertAdjacentHTML('beforeend', renderWordDialog());
    setupWordDialog();
    speak(state.wordDetail.text);
    return;
  }
  if (action === 'word-close') return closeWordDialog();
  if (action === 'word-listen' && state.wordDetail) return speak(state.wordDetail.text);
  if (action === 'word-replay' && state.wordDetail) {
    wordWriters.forEach(writer => writer.animateCharacter({ onComplete: () => writer.loopCharacterAnimation() }));
    return;
  }
  if (action === 'lesson-workbook') return startWorkbook(Number(target.dataset.lesson));
  if (action === 'workbook-start') return startWorkbook(state.workbookLesson);
  if (action === 'workbook-back') { stopListening(); state.workbook = null; return render(); }
  if (action === 'workbook-replay' && state.workbook) return startWorkbook(state.workbook.lesson, true);
  if (action === 'workbook-hear' && state.view === 'workbook') return speak(target.dataset.text);
  if (action === 'workbook-clear-drawing' && workbookCard()?.type === 'write') {
    document.getElementById('workbook-trace-canvas')?.getContext('2d')?.clearRect(0, 0, 520, 520);
    state.workbook.drawn = false;
    document.querySelector('[data-action="workbook-next"]').disabled = true;
    return;
  }
  if (action === 'workbook-choose' && state.view === 'workbook') {
    const homework = state.workbook;
    const card = workbookCard();
    const option = card?.options?.[Number(target.dataset.option)];
    if (option === undefined || homework.choice !== null || homework.wrong.has(String(option))) return;
    const selected = String(option);
    homework.lastChoice = selected;
    if (selected === String(card.answer ?? card.count)) { homework.choice = selected; chime(); }
    else homework.wrong.add(selected);
    render();
    if (card.type !== 'strokes') speak(card.type === 'cloze' ? card.prefix + selected + card.suffix : selected);
    return;
  }
  if (action === 'workbook-add-chunk' && workbookCard()?.type === 'order' && !state.workbook.checked) {
    const index = Number(target.dataset.index);
    const homework = state.workbook;
    if (!Number.isInteger(index) || index < 0 || index >= workbookCard().answer.length || homework.selected.includes(index)) return;
    homework.selected.push(index); homework.hint = ''; render(); speak(workbookCard().answer[index]); return;
  }
  if (action === 'workbook-remove-chunk' && workbookCard()?.type === 'order' && !state.workbook.checked) {
    state.workbook.selected = state.workbook.selected.filter(index => index !== Number(target.dataset.index));
    state.workbook.hint = ''; return render();
  }
  if (action === 'workbook-clear-order' && workbookCard()?.type === 'order' && !state.workbook.checked) {
    state.workbook.selected = []; state.workbook.hint = ''; return render();
  }
  if (action === 'workbook-check-order' && workbookCard()?.type === 'order' && !state.workbook.checked) {
    const homework = state.workbook;
    const card = workbookCard();
    if (homework.selected.length !== card.answer.length) return;
    homework.checked = homework.selected.every((item, index) => item === index);
    homework.hint = homework.checked ? '✓ Correct sentence!' : '✕ Try a different order. The answer stays hidden.';
    if (homework.checked) { chime(); speak(card.answer.join('')); }
    return render();
  }
  if (action === 'workbook-speak') return startWorkbookPractice();
  if (action === 'workbook-done' && ['listening', 'recording'].includes(state.workbook?.practice.status)) {
    if (finishActiveSpeech()) { state.workbook.practice.status = 'processing'; render(); }
    return;
  }
  if (action === 'workbook-skip' && workbookCard()?.type === 'read') {
    stopListening(); state.workbook.practice.status = 'skipped';
    state.workbook.practice.message = 'Read aloud practice skipped. You can return to it later.';
    return render();
  }
  if (action === 'workbook-next' && state.view === 'workbook') {
    const card = workbookCard();
    const homework = state.workbook;
    if (card?.type === 'write' && homework.drawn || card?.type === 'order' && homework.checked ||
      card?.type === 'read' && ['accepted', 'skipped'].includes(homework.practice.status) ||
      ['strokes', 'parts', 'spell', 'cloze'].includes(card?.type) && homework.choice !== null) return advanceWorkbook();
    return;
  }
  if (action === 'review-start') return startReview(target.dataset.mode);
  if (action === 'review-restart') return startReview(state.homeworkMode);
  if (action === 'review-setup') { stopListening(); state.homework = null; return render(); }
  if (action === 'review-hear') {
    const homework = state.homework;
    const phrase = book.lessons.find(item => item.number === homework.lesson).phrases[homework.queue[0].index];
    return speak(phrase.chinese);
  }
  if (action === 'review-mic') {
    const homework = state.homework;
    if (!homework || homework.listening || (homework.feedback && homework.feedback.kind !== 'retry')) return;
    homework.error = '';
    homework.listening = true;
    homework.lastRecognizer = state.speechRecognizer;
    homework.capturePhase = state.speechRecognizer === 'browser' ? 'listening' : 'loading';
    render();
    const isCurrent = () => state.view === 'review' && state.homework === homework && homework.listening;
    return recognizeChinese(isCurrent, book.lessons.find(item => item.number === homework.lesson).phrases.map(item => item.chinese), (words, alternatives) => {
      homeworkTranscript(words, alternatives);
    }, message => {
      homework.listening = false;
      homework.capturePhase = '';
      homework.error = message;
      render();
    }, (phase, progressMessage) => {
      homework.capturePhase = phase;
      if (progressMessage) homework.modelProgress = progressMessage;
      render();
    });
  }
  if (action === 'review-done' && state.homework?.listening) {
    if (finishActiveSpeech()) { state.homework.capturePhase = 'processing'; render(); }
    return;
  }
  if (action === 'review-skip' && state.homework) {
    stopListening();
    state.homework.listening = false;
    state.homework.capturePhase = '';
    state.homework.error = '';
    state.homework.feedback = { kind: 'skip', transcript: '' };
    return render();
  }
  if (action === 'review-next') return advanceHomework();
  if (action === 'practice-speak') return startLessonPractice();
  if (action === 'practice-done' && ['listening', 'recording'].includes(state.practice.status)) {
    if (finishActiveSpeech()) { state.practice.status = 'processing'; render(); }
    return;
  }
  if (action === 'practice-skip' && state.view === 'lesson' && ['learn', 'dialogue', 'speak'].includes(state.step)) {
    if (state.step === 'dialogue' && state.dialogueSelected === null) return;
    stopListening();
    state.practice.status = 'skipped';
    state.practice.message = 'You can move on and practise this phrase another time.';
    state.practice.transcript = '';
    return render();
  }
  if (action === 'start') return startLesson(Number(target.dataset.lesson));
  if (action === 'next-learn') {
    if (!['accepted', 'skipped'].includes(state.practice.status)) return;
    state.practice = newPractice();
    if (++state.phraseIndex >= lesson().phrases.length) { state.step = 'quiz'; state.phraseIndex = 0; }
    saveLessonCheckpoint();
    return render();
  }
  if (action === 'speak-phrase') return speak(lesson().phrases[state.step === 'learn' ? state.phraseIndex : state.step === 'dialogue' ? state.exercises.dialogue.answer : 0].chinese);
  if (action === 'speak-quiz') return speak(lesson().phrases[state.exercises.translations[state.quizIndex].phraseIndex].chinese);
  if (action === 'choose' && state.step === 'quiz' && state.quizSelected === null) {
    const option = Number(target.dataset.option);
    const question = state.exercises.translations[state.quizIndex];
    if (!question.options.includes(option) || state.quizWrongOptions.has(option)) return;
    state.quizLastChoice = option;
    const firstTry = state.quizWrongOptions.size === 0;
    if (firstTry) state.total++;
    if (option === question.phraseIndex) {
      state.quizSelected = option;
      if (firstTry) state.right++;
    } else state.quizWrongOptions.add(option);
    render(); speak(lesson().phrases[option].chinese); return;
  }
  if (action === 'next-quiz') {
    if (state.quizSelected === null) return;
    state.quizSelected = null; state.quizLastChoice = null; state.quizWrongOptions = new Set();
    if (++state.quizIndex >= state.exercises.translations.length) state.step = 'build';
    saveLessonCheckpoint();
    return render();
  }
  if (action === 'speak-build') return speak(state.exercises.builders[state.builderIndex].prompt);
  if (action === 'add-chunk' && !state.builderChecked) {
    const index = Number(target.dataset.index);
    if (!state.builderSelected.includes(index)) state.builderSelected.push(index);
    state.builderHint = ''; return render();
  }
  if (action === 'remove-chunk' && !state.builderChecked) { state.builderSelected = state.builderSelected.filter(i => i !== Number(target.dataset.index)); state.builderHint = ''; return render(); }
  if (action === 'clear-build' && !state.builderChecked) { state.builderSelected = []; state.builderHint = ''; return render(); }
  if (action === 'check-build' && !state.builderChecked) {
    const question = state.exercises.builders[state.builderIndex];
    if (state.builderSelected.length !== question.answer.length) return;
    const correct = state.builderSelected.every((item, index) => item === index);
    if (!state.builderAttempted) { state.total++; state.builderAttempted = true; if (correct) state.right++; }
    if (correct) { state.builderChecked = true; state.builderHint = 'Yes! You built the sentence. ✨'; chime(); }
    else state.builderHint = `Good try. Start with “${question.answer[0]}” and try again.`;
    return render();
  }
  if (action === 'next-build') {
    if (!state.builderChecked) return;
    state.builderIndex++;
    state.builderSelected = []; state.builderChecked = false; state.builderHint = ''; state.builderAttempted = false;
    if (state.builderIndex >= state.exercises.builders.length) {
      state.step = 'listening';
      saveLessonCheckpoint();
      render(); speak(state.exercises.listening[0].answer.text); return;
    }
    saveLessonCheckpoint();
    return render();
  }
  if (action === 'play-listening') return speak(state.exercises.listening[state.listeningIndex].answer.text);
  if (action === 'slow-listening') return speak(state.exercises.listening[state.listeningIndex].answer.text, 'zh-CN', .62);
  if (action === 'choose-listening' && state.step === 'listening' && state.listeningSelected === null) {
    const question = state.exercises.listening[state.listeningIndex];
    const word = target.dataset.word;
    if (!question.options.some(option => option.text === word) || state.listeningWrongOptions.has(word)) return;
    state.listeningLastChoice = word;
    const firstTry = state.listeningWrongOptions.size === 0;
    if (firstTry) state.total++;
    if (word === question.answer.text) {
      state.listeningSelected = word;
      if (firstTry) state.right++;
    } else state.listeningWrongOptions.add(word);
    render(); speak(word); return;
  }
  if (action === 'skip-listening' && state.step === 'listening' && state.listeningSelected === null) {
    state.listeningSelected = 'skipped';
    state.listeningLastChoice = null;
    if (!state.listeningWrongOptions.size) state.total++;
    return render();
  }
  if (action === 'next-listening' && state.step === 'listening' && state.listeningSelected !== null) {
    state.listeningSelected = null; state.listeningLastChoice = null; state.listeningWrongOptions = new Set();
    if (++state.listeningIndex >= state.exercises.listening.length) {
      state.step = 'audio-build'; saveLessonCheckpoint(); render(); speak(state.exercises.audioBuild.answer.join('')); return;
    }
    saveLessonCheckpoint();
    render(); speak(state.exercises.listening[state.listeningIndex].answer.text); return;
  }
  if (action === 'play-audio-build' && state.step === 'audio-build') return speak(state.exercises.audioBuild.answer.join(''));
  if (action === 'slow-audio-build' && state.step === 'audio-build') return speak(state.exercises.audioBuild.answer.join(''), 'zh-CN', .62);
  if (action === 'add-audio-chunk' && state.step === 'audio-build' && !state.audioChecked) {
    const index = Number(target.dataset.index);
    const question = state.exercises.audioBuild;
    if (!Number.isInteger(index) || index < 0 || index >= question.answer.length || state.audioSelected.includes(index)) return;
    state.audioSelected.push(index); state.audioHint = ''; render(); speak(question.answer[index]); return;
  }
  if (action === 'remove-audio-chunk' && state.step === 'audio-build' && !state.audioChecked) {
    const index = Number(target.dataset.index);
    state.audioSelected = state.audioSelected.filter(item => item !== index);
    state.audioHint = ''; render();
    if (Number.isInteger(index) && state.exercises.audioBuild.answer[index]) speak(state.exercises.audioBuild.answer[index]);
    return;
  }
  if (action === 'clear-audio-build' && state.step === 'audio-build' && !state.audioChecked) {
    state.audioSelected = []; state.audioHint = ''; return render();
  }
  if (action === 'check-audio-build' && state.step === 'audio-build' && !state.audioChecked) {
    const question = state.exercises.audioBuild;
    if (state.audioSelected.length !== question.answer.length) return;
    const correct = state.audioSelected.every((index, position) => index === position);
    if (!state.audioAttempted) { state.total++; state.audioAttempted = true; if (correct) state.right++; }
    if (correct) { state.audioChecked = true; state.audioHint = '✓ You heard and built the sentence!'; chime(); }
    else state.audioHint = '✕ The order does not match. Listen again and rearrange the pieces.';
    return render();
  }
  if (action === 'next-audio-build' && state.step === 'audio-build' && state.audioChecked) {
    state.step = 'picture'; saveLessonCheckpoint(); return render();
  }
  if (action === 'play-picture' && state.step === 'picture') return speak(lesson().phrases[state.exercises.picture.answer].chinese);
  if (action === 'choose-picture' && state.step === 'picture' && state.pictureSelected === null) {
    const index = Number(target.dataset.picture);
    const question = state.exercises.picture;
    if (!question.options.some(option => option.phraseIndex === index) || state.pictureWrongOptions.has(index)) return;
    state.pictureLastChoice = index;
    const firstTry = state.pictureWrongOptions.size === 0;
    if (firstTry) state.total++;
    if (index === question.answer) { state.pictureSelected = index; if (firstTry) state.right++; chime(); }
    else state.pictureWrongOptions.add(index);
    render(); speak(lesson().phrases[index].chinese); return;
  }
  if (action === 'next-picture' && state.step === 'picture' && state.pictureSelected !== null) {
    state.step = 'cloze'; saveLessonCheckpoint(); return render();
  }
  if (action === 'choose-cloze' && state.step === 'cloze' && state.clozeSelected === null) {
    const word = target.dataset.word;
    const question = state.exercises.cloze;
    if (!question.options.some(option => option.text === word) || state.clozeWrongOptions.has(word)) return;
    state.clozeLastChoice = word;
    const firstTry = state.clozeWrongOptions.size === 0;
    if (firstTry) state.total++;
    if (word === question.answer) { state.clozeSelected = word; if (firstTry) state.right++; chime(); }
    else state.clozeWrongOptions.add(word);
    render(); speak(word); return;
  }
  if (action === 'next-cloze' && state.step === 'cloze' && state.clozeSelected !== null) {
    state.step = 'dialogue'; saveLessonCheckpoint(); render(); speak(state.exercises.dialogue.prompt); return;
  }
  if (action === 'play-dialogue' && state.step === 'dialogue') return speak(state.exercises.dialogue.prompt);
  if (action === 'choose-dialogue' && state.step === 'dialogue' && state.dialogueSelected === null) {
    const index = Number(target.dataset.option);
    const question = state.exercises.dialogue;
    if (!question.options.includes(index) || state.dialogueWrongOptions.has(index)) return;
    state.dialogueLastChoice = index;
    const firstTry = state.dialogueWrongOptions.size === 0;
    if (firstTry) state.total++;
    if (index === question.answer) { state.dialogueSelected = index; if (firstTry) state.right++; chime(); }
    else state.dialogueWrongOptions.add(index);
    render(); speak(lesson().phrases[index].chinese); return;
  }
  if (action === 'next-dialogue' && state.step === 'dialogue' && state.dialogueSelected !== null && ['accepted', 'skipped'].includes(state.practice.status)) {
    state.practice = newPractice(); state.step = 'tone'; saveLessonCheckpoint(); render(); speak(state.exercises.tone.audio); return;
  }
  if (action === 'play-tone' && state.step === 'tone') return speak(state.exercises.tone.audio);
  if (action === 'slow-tone' && state.step === 'tone') return speak(state.exercises.tone.audio, 'zh-CN', .62);
  if (action === 'choose-tone' && state.step === 'tone' && state.toneSelected === null) {
    const index = Number(target.dataset.tone);
    const question = state.exercises.tone;
    if (!Number.isInteger(index) || index < 0 || index > 3 || state.toneWrongOptions.has(index)) return;
    state.toneLastChoice = index;
    const firstTry = state.toneWrongOptions.size === 0;
    if (firstTry) state.total++;
    if (index === question.answer) { state.toneSelected = index; if (firstTry) state.right++; chime(); }
    else state.toneWrongOptions.add(index);
    render(); if (index !== question.answer) speak(question.audio); return;
  }
  if (action === 'skip-tone' && state.step === 'tone' && state.toneSelected === null) {
    state.toneSelected = 'skipped'; state.toneLastChoice = null;
    if (!state.toneWrongOptions.size) state.total++;
    return render();
  }
  if (action === 'next-tone' && state.step === 'tone' && state.toneSelected !== null) {
    state.step = 'speak'; state.practice = newPractice(); saveLessonCheckpoint(); return render();
  }
  if (action === 'next-trace') {
    if (!['accepted', 'skipped'].includes(state.practice.status)) return;
    state.step = 'trace'; saveLessonCheckpoint(); return render();
  }
  if (action === 'clear-trace') { document.getElementById('trace-canvas')?.getContext('2d')?.clearRect(0, 0, 520, 520); state.traceDrawn = false; document.querySelector('[data-action="finish-lesson"]').disabled = true; return; }
  if (action === 'finish-lesson') return finishLesson();
});

document.addEventListener('cancel', event => {
  if (event.target.id !== 'word-dialog') return;
  event.preventDefault();
  closeWordDialog();
}, true);

document.addEventListener('change', event => {
  if (event.target.id === 'workbook-lesson') {
    state.workbookLesson = Number(event.target.value);
    render();
  }
  if (event.target.id === 'homework-lesson') {
    state.homeworkLesson = Number(event.target.value);
    render();
  }
  if (event.target.id === 'speech-recognizer') {
    const value = event.target.value;
    saveSpeechRecognizer(['whisper-small', 'sherpa', 'browser'].includes(value) ? value : 'whisper-small');
    render();
  }
  if (event.target.id === 'voice-style') {
    saveVoiceStyle(event.target.value);
    render();
  }
});

async function init() {
  try {
    const bookResponse = await fetch(new URL('data/book2.json', import.meta.url));
    if (!bookResponse.ok) throw new Error('Could not load the local learning files.');
    book = await bookResponse.json();
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => { if (state.view === 'settings') render(); });
    render();
  } catch (error) { app.innerHTML = `<div class="loading-card panel">${escapeHtml(error.message)}<br>Refresh this page to try again.</div>`; }
}

init();
