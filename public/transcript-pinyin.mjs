import { pinyin } from './vendor/pinyin-pro.mjs';

export function transcriptPinyin(transcript) {
  const text = String(transcript || '').trim();
  if (!/\p{Script=Han}/u.test(text)) return '';
  return pinyin(text, { toneType: 'symbol' })
    .replace(/\s+([，。！？,.!?])/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function renderTranscript(transcript) {
  const pinyin = transcriptPinyin(transcript);
  return `<div class="heard-result" role="status"><div class="heard-label">I heard</div>${pinyin ? `<div class="heard-pinyin" aria-label="Pinyin for recognized words">${escapeHtml(pinyin)}</div>` : ''}<div class="heard-chinese hanzi" aria-label="Recognized words">${escapeHtml(transcript)}</div></div>`;
}
