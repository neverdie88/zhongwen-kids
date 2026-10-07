import { Converter } from './vendor/opencc-t2cn.js';

const toSimplified = Converter({ from: 't', to: 'cn' });

// Recognizers may add punctuation or return Traditional Chinese even when the
// textbook uses Simplified Chinese. This is a word check, not a tone grade.
export function normalizeSpokenChinese(value) {
  return Array.from(toSimplified(String(value ?? '').normalize('NFKC')))
    .filter(character => /[\u3400-\u9fff\uf900-\ufaff]/u.test(character))
    .join('');
}

export function transcriptMatches(expected, heard) {
  const target = normalizeSpokenChinese(expected);
  return target.length > 0 && normalizeSpokenChinese(heard) === target;
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column++) {
      const above = previous[column];
      previous[column] = Math.min(
        above + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

// A close match is intentionally conservative: one Hanzi for short phrases,
// at most two for ordinary sentences. Another lesson phrase winning or tying
// the comparison makes the result ambiguous rather than accepted.
export function evaluateSpeechAttempt(expected, alternatives, otherPhrases = []) {
  const target = normalizeSpokenChinese(expected);
  const options = (Array.isArray(alternatives) ? alternatives : [alternatives])
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  const primary = options[0] || '';
  if (!target || !options.length) return { kind: 'unheard', transcript: primary };

  const exact = options.find(value => normalizeSpokenChinese(value) === target);
  if (exact) return { kind: 'exact', transcript: exact };

  const otherTargets = otherPhrases.map(normalizeSpokenChinese).filter(value => value && value !== target);
  const maxChanges = target.length < 3 ? 0 : target.length < 8 ? 1 : 2;
  let closest = null;
  for (const transcript of options) {
    const heard = normalizeSpokenChinese(transcript);
    if (!heard || Math.abs(heard.length - target.length) > maxChanges) continue;
    const distance = editDistance(target, heard);
    if (distance > maxChanges) continue;
    if (otherTargets.some(other => editDistance(other, heard) <= distance)) continue;
    if (!closest || distance < closest.distance) closest = { transcript, distance };
  }
  return closest ? { kind: 'close', transcript: closest.transcript } : { kind: 'different', transcript: primary };
}
