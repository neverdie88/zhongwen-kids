import { evaluateSpeechAttempt } from './speech-check.mjs';
import { prepareBrowserRecognizer, releaseBrowserRecognizer, transcribeInBrowser } from './browser-asr.mjs';
import { recordedAudioToSamples } from './audio-prep.mjs';
import { tokenizePhrase } from './word-study.mjs';
import { chooseChineseVoice, voicePitch } from './voice-style.mjs';
import { renderTranscript } from './transcript-pinyin.mjs';
import { buildLessonExercises } from './exercise-data.mjs';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const STORAGE_KEY = 'little-lantern-progress-v2';
const SPEECH_SETTING_KEY = 'little-lantern-speech-recognizer-v1';
const VOICE_SETTING_KEY = 'little-lantern-chinese-voice-v1';
let book;
let toastTimer;
let activeRecognition = null;
let activeCapture = null;
let wordWriters = [];
let wordTrigger = null;

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      lessons: saved.lessons && typeof saved.lessons === 'object' ? saved.lessons : {},
      speechHomework: saved.speechHomework && typeof saved.speechHomework === 'object' ? saved.speechHomework : {},
    };
  } catch { return { lessons: {}, speechHomework: {} }; }
}
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
  quizSelected: null, quizWrongOptions: new Set(), exercises: null, right: 0, total: 0,
  builderIndex: 0, builderSelected: [], builderChecked: false, builderHint: '', builderAttempted: false,
  listeningIndex: 0, listeningSelected: null, listeningWrongOptions: new Set(),
  practice: newPractice(), traceDrawn: false,
  wordDetail: null,
  homeworkLesson: 1, homeworkMode: 'chinese', homework: null,
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
    <div class="card-actions word-actions"><button type="button" class="btn btn-primary" data-action="word-listen">🔊 Hear pronunciation</button></div>
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch { toast('Progress could not be saved on this device.'); }
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
  state.quizIndex = 0; state.quizSelected = null; state.quizWrongOptions = new Set(); state.right = 0; state.total = 0;
  state.builderIndex = 0; state.builderSelected = []; state.builderChecked = false; state.builderHint = ''; state.builderAttempted = false;
  state.listeningIndex = 0; state.listeningSelected = null; state.listeningWrongOptions = new Set();
  state.practice = newPractice(); state.traceDrawn = false;
  state.exercises = buildLessonExercises(lesson(), buildEnglish[number]);
  render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function lessonPercent() {
  const count = lesson().phrases.length;
  return {
    learn: 8 + 27 * ((state.phraseIndex + 1) / count),
    quiz: 38 + 22 * ((state.quizIndex + 1) / state.exercises.translations.length),
    build: 63 + 14 * ((state.builderIndex + 1) / state.exercises.builders.length),
    listening: 79 + 10 * ((state.listeningIndex + 1) / state.exercises.listening.length),
    speak: 92, trace: 97, finish: 100,
  }[state.step];
}

function renderHome() {
  const completed = doneCount();
  const next = book.lessons.find(item => !progress.lessons[item.number]?.completed)?.number || 1;
  return `<section class="hero panel">
    <div class="hero-copy"><div class="eyebrow">Your Chinese adventure</div><h1>Small steps.<br>Big discoveries.</h1>
      <p>Listen, speak, translate, build sentences, and draw characters from <span class="hanzi">《中文》第二册</span>. One cheerful lesson at a time.</p>
      <div class="hero-actions"><button class="btn btn-primary" data-action="start" data-lesson="${next}">${completed ? 'Keep learning' : 'Start Lesson 1'} <span aria-hidden="true">→</span></button></div>
    </div><div class="mascot-scene" aria-hidden="true"><span class="spark one">✦</span><div class="mascot"><div class="mascot-mouth"></div><div class="mascot-top"></div><div class="mascot-tassel"></div></div><span class="spark two">✧</span></div>
  </section>
  <div class="overview"><div><div class="eyebrow">The learning path</div><h2>12 lessons · 4 little worlds</h2></div><div class="progress-badge">★ ${completed} of 12 complete</div></div>
  <div class="unit-grid">${book.units.map(unit => `<section class="unit-card panel"><div class="unit-head"><span class="unit-number">${unit.number}</span><div><h3>${escapeHtml(unit.title)}</h3><small>Lessons ${unit.number * 3 - 2}–${unit.number * 3}</small></div></div><div class="lesson-list">${book.lessons.filter(item => item.unit === unit.number).map(item => {
    const done = progress.lessons[item.number]?.completed;
    return `<button class="lesson-tile ${done ? 'done' : ''}" data-action="start" data-lesson="${item.number}"><span class="lesson-icon hanzi">${escapeHtml(item.character)}</span><span class="lesson-info"><strong class="hanzi">${escapeHtml(item.title)}</strong><small>${escapeHtml(item.englishTitle)}</small></span><span class="tile-end" aria-hidden="true">${done ? '★' : '›'}</span></button>`;
  }).join('')}</div></section>`).join('')}</div>`;
}

function renderSettings() {
  const backLabel = state.settingsReturnView === 'lesson' ? 'Back to lesson' : state.settingsReturnView === 'review' ? 'Back to Review' : 'Back';
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
    return `<span class="exercise-tag">Translation choice · ${state.quizIndex + 1}/${state.exercises.translations.length}</span><h2>${chinesePrompt ? 'Choose the English meaning' : 'Choose the Chinese sentence'}</h2>
      ${chinesePrompt ? `${renderSpeakingPhrase(item, 'exercise-prompt')}<button class="btn btn-light btn-small" data-action="speak-quiz">🔊 Hear it</button>` : `<p class="translation-prompt">${escapeHtml(item.english)}</p>`}
      <div class="options">${question.options.map(optionIndex => {
        const correct = state.quizSelected === question.phraseIndex;
        const wrong = state.quizWrongOptions.has(optionIndex);
        const className = correct && optionIndex === question.phraseIndex ? 'correct' : wrong ? 'wrong' : '';
        return `<button class="option ${chinesePrompt ? '' : 'hanzi option-hanzi'} ${className}" data-action="choose" data-option="${optionIndex}" ${correct || wrong ? 'disabled' : ''}>${escapeHtml(chinesePrompt ? current.phrases[optionIndex].english : current.phrases[optionIndex].chinese)}</button>`;
      }).join('')}</div>
      ${state.quizSelected !== null ? `<div class="feedback good" role="status">Nice choice! ✨</div><div class="translation-answer">${renderSpeakingPhrase(item, 'answer-phrase')}<strong>${escapeHtml(item.english)}</strong></div><div class="card-actions"><button class="btn btn-primary" data-action="next-quiz">Continue →</button></div>` : state.quizWrongOptions.size ? '<div class="feedback try" role="status">Not quite. Try another answer to keep going.</div>' : ''}`;
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
    return `<span class="exercise-tag">Listening choice · ${state.listeningIndex + 1}/${state.exercises.listening.length}</span><h2>Which Chinese word do you hear?</h2>
      <div class="speaker-symbol" aria-hidden="true">🔊</div><div class="card-actions"><button class="btn btn-primary" data-action="play-listening">🔊 Play the word</button><button class="btn btn-light" data-action="slow-listening">🐢 Play slowly</button></div>
      <div class="options listening-options">${question.options.map(option => `<button class="option hanzi option-hanzi ${correct && option.text === question.answer.text ? 'correct' : state.listeningWrongOptions.has(option.text) ? 'wrong' : ''}" data-action="choose-listening" data-word="${escapeHtml(option.text)}" ${answered || state.listeningWrongOptions.has(option.text) ? 'disabled' : ''}>${escapeHtml(option.text)}</button>`).join('')}</div>
      ${answered ? `<div class="feedback ${correct ? 'good' : 'try'}" role="status">${correct ? 'You heard it! ✨' : 'You can practise this word again later.'}</div><div class="listening-answer"><span class="pinyin">${escapeHtml(question.answer.pinyin)}</span><strong class="hanzi">${escapeHtml(question.answer.text)}</strong><span>${escapeHtml(question.answer.meaning)}</span></div><div class="card-actions"><button class="btn btn-mint" data-action="next-listening">Continue →</button></div>` : `${state.listeningWrongOptions.size ? '<div class="feedback try" role="status">Not quite. Listen again and choose another word.</div>' : ''}<div class="card-actions"><button class="btn btn-light btn-small" data-action="skip-listening">Skip this word</button></div>`}
      <p class="hint">Audio uses the Chinese voice selected in Settings.</p>`;
  }
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
    <h2>Lovely work on <span class="hanzi">${escapeHtml(current.title)}</span>!</h2><p>You spoke, translated, built sentences, listened for Chinese words, and drew a character.</p>
    <div class="result-stats"><span class="stat-pill">${state.right}/${state.total} first-try answers</span><span class="stat-pill">${current.phrases.length} phrases explored</span><span class="stat-pill">1 character drawn</span></div>
    <div class="card-actions"><button class="btn btn-light" data-action="start" data-lesson="${current.number}">Play again</button>${current.number < 12 ? `<button class="btn btn-primary" data-action="start" data-lesson="${current.number + 1}">Next lesson →</button>` : `<button class="btn btn-primary" data-action="home">See my path →</button>`}</div>`;
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

function render() {
  clearWordWriters();
  app.innerHTML = (state.view === 'lesson' ? renderLesson() : state.view === 'review' ? renderReview() : state.view === 'settings' ? renderSettings() : renderHome()) + renderWordDialog();
  const activeNav = state.view === 'lesson' ? 'home' : state.view;
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.classList.toggle('active', button.dataset.nav === activeNav);
    button.setAttribute('aria-current', button.dataset.nav === activeNav ? 'page' : 'false');
  });
  if (state.view === 'lesson' && state.step === 'trace') setupTrace();
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

function finishLesson() {
  const current = lesson();
  const stars = Math.max(1, Math.min(3, Math.ceil((state.right / Math.max(1, state.total)) * 3)));
  const previous = progress.lessons[current.number] || {};
  progress.lessons[current.number] = { completed: true, stars: Math.max(previous.stars || 0, stars), lastPlayed: new Date().toISOString(), plays: (previous.plays || 0) + 1 };
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
  if (state.view !== 'lesson' || !['learn', 'speak'].includes(state.step)) return;
  const practice = state.practice;
  if (['accepted', 'skipped', 'loading', 'listening', 'recording', 'processing'].includes(practice.status)) return;
  const step = state.step;
  const lessonData = lesson();
  const index = step === 'learn' ? state.phraseIndex : 0;
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
  if (['home', 'review', 'settings'].includes(action)) return nav(action);
  if (action === 'settings-back') return nav(state.settingsReturnView);
  if (action === 'voice-preview') return speak('你好！我喜欢学中文。');
  if (action === 'word-detail') {
    wordTrigger = target;
    state.wordDetail = { text: target.dataset.word, pinyin: target.dataset.pinyin, meaning: target.dataset.meaning };
    app.insertAdjacentHTML('beforeend', renderWordDialog());
    setupWordDialog();
    return;
  }
  if (action === 'word-close') return closeWordDialog();
  if (action === 'word-listen' && state.wordDetail) return speak(state.wordDetail.text);
  if (action === 'word-replay' && state.wordDetail) {
    wordWriters.forEach(writer => writer.animateCharacter({ onComplete: () => writer.loopCharacterAnimation() }));
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
  if (action === 'practice-skip' && state.view === 'lesson' && ['learn', 'speak'].includes(state.step)) {
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
    return render();
  }
  if (action === 'speak-phrase') return speak(lesson().phrases[state.step === 'learn' ? state.phraseIndex : 0].chinese);
  if (action === 'speak-quiz') return speak(lesson().phrases[state.exercises.translations[state.quizIndex].phraseIndex].chinese);
  if (action === 'choose' && state.step === 'quiz' && state.quizSelected === null) {
    const option = Number(target.dataset.option);
    const question = state.exercises.translations[state.quizIndex];
    if (!question.options.includes(option) || state.quizWrongOptions.has(option)) return;
    const firstTry = state.quizWrongOptions.size === 0;
    if (firstTry) state.total++;
    if (option === question.phraseIndex) {
      state.quizSelected = option;
      if (firstTry) state.right++;
      chime();
    } else state.quizWrongOptions.add(option);
    return render();
  }
  if (action === 'next-quiz') {
    if (state.quizSelected === null) return;
    state.quizSelected = null; state.quizWrongOptions = new Set();
    if (++state.quizIndex >= state.exercises.translations.length) state.step = 'build';
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
      render(); speak(state.exercises.listening[0].answer.text); return;
    }
    return render();
  }
  if (action === 'play-listening') return speak(state.exercises.listening[state.listeningIndex].answer.text);
  if (action === 'slow-listening') return speak(state.exercises.listening[state.listeningIndex].answer.text, 'zh-CN', .62);
  if (action === 'choose-listening' && state.step === 'listening' && state.listeningSelected === null) {
    const question = state.exercises.listening[state.listeningIndex];
    const word = target.dataset.word;
    if (!question.options.some(option => option.text === word) || state.listeningWrongOptions.has(word)) return;
    const firstTry = state.listeningWrongOptions.size === 0;
    if (firstTry) state.total++;
    if (word === question.answer.text) {
      state.listeningSelected = word;
      if (firstTry) state.right++;
      chime();
      return render();
    }
    state.listeningWrongOptions.add(word);
    render(); speak(question.answer.text); return;
  }
  if (action === 'skip-listening' && state.step === 'listening' && state.listeningSelected === null) {
    state.listeningSelected = 'skipped';
    if (!state.listeningWrongOptions.size) state.total++;
    return render();
  }
  if (action === 'next-listening' && state.step === 'listening' && state.listeningSelected !== null) {
    state.listeningSelected = null; state.listeningWrongOptions = new Set();
    if (++state.listeningIndex >= state.exercises.listening.length) {
      state.step = 'speak'; state.practice = newPractice(); return render();
    }
    render(); speak(state.exercises.listening[state.listeningIndex].answer.text); return;
  }
  if (action === 'next-trace') {
    if (!['accepted', 'skipped'].includes(state.practice.status)) return;
    state.step = 'trace'; return render();
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
