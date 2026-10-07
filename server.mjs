import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalAsr } from './local-asr.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4178);
const host = '127.0.0.1';
const origin = `http://${host}:${port}`;
const localAsr = createLocalAsr();
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const files = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/chinese-font.css', ['public/chinese-font.css', 'text/css; charset=utf-8']],
  ['/speech-homework.css', ['public/speech-homework.css', 'text/css; charset=utf-8']],
  ['/word-study.css', ['public/word-study.css', 'text/css; charset=utf-8']],
  ['/exercise-types.css', ['public/exercise-types.css', 'text/css; charset=utf-8']],
  ['/fonts/lxgw-zhenkai-gb-regular.ttf', ['public/fonts/lxgw-zhenkai-gb-regular.ttf', 'font/ttf']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/word-study.mjs', ['public/word-study.mjs', 'text/javascript; charset=utf-8']],
  ['/exercise-data.mjs', ['public/exercise-data.mjs', 'text/javascript; charset=utf-8']],
  ['/voice-style.mjs', ['public/voice-style.mjs', 'text/javascript; charset=utf-8']],
  ['/vendor/hanzi-writer.min.js', ['public/vendor/hanzi-writer.min.js', 'text/javascript; charset=utf-8']],
  ['/browser-asr.mjs', ['public/browser-asr.mjs', 'text/javascript; charset=utf-8']],
  ['/audio-prep.mjs', ['public/audio-prep.mjs', 'text/javascript; charset=utf-8']],
  ['/workers/whisper-worker.bundle.mjs', ['public/workers/whisper-worker.bundle.mjs', 'text/javascript; charset=utf-8']],
  ['/workers/sherpa-worker.js', ['public/workers/sherpa-worker.js', 'text/javascript; charset=utf-8']],
  ['/speech-check.mjs', ['public/speech-check.mjs', 'text/javascript; charset=utf-8']],
  ['/transcript-pinyin.mjs', ['public/transcript-pinyin.mjs', 'text/javascript; charset=utf-8']],
  ['/vendor/pinyin-pro.mjs', ['public/vendor/pinyin-pro.mjs', 'text/javascript; charset=utf-8']],
  ['/vendor/opencc-t2cn.js', ['public/vendor/opencc-t2cn.js', 'text/javascript; charset=utf-8']],
  ['/data/book2.json', ['data/book2.json', 'application/json; charset=utf-8']],
  ['/workbooks/manifest.json', ['workbooks/manifest.json', 'application/json; charset=utf-8']],
  ['/source/zhongwen-02-textbook.pdf', ['source/zhongwen-02-textbook.pdf', 'application/pdf']],
  ['/test/browser-asr-smoke.html', ['test/browser-asr-smoke.html', 'text/html; charset=utf-8']],
  ['/test/browser-asr-smoke.mjs', ['test/browser-asr-smoke.mjs', 'text/javascript; charset=utf-8']],
  ['/test/mandarin-smoke.wav', ['test/mandarin-smoke.wav', 'audio/wav']],
]);

function json(res, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': encoded.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(encoded);
}

function serveFile(res, relative, type, method) {
  const path = join(root, relative);
  let stat;
  try { stat = statSync(path); }
  catch { return json(res, 404, { error: 'File not found.' }); }
  const headers = {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': /^public\/(models|vendor\/(sherpa|transformers))\//.test(relative) ? 'private, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'self'; base-uri 'none'",
  };
  if (type === 'application/pdf') headers['Content-Disposition'] = 'inline';
  res.writeHead(200, headers);
  if (method === 'HEAD') return res.end();
  createReadStream(path).pipe(res);
}

const server = http.createServer(async (req, res) => {
  // A loopback server still needs a Host and Origin check for microphone uploads.
  if (req.headers.host !== `${host}:${port}`) return json(res, 403, { error: 'Invalid host.' });
  const url = new URL(req.url || '/', origin);
  if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });
  if (url.pathname === '/api/speech/health' && req.method === 'GET') {
    return json(res, 200, await localAsr.health());
  }
  if (url.pathname === '/api/speech/transcribe' && req.method === 'POST') {
    if (req.headers.origin !== origin) return json(res, 403, { error: 'Invalid origin.' });
    if (!/^audio\/(webm|mp4|ogg|wav|wave|x-wav)(;|$)/i.test(req.headers['content-type'] || '')) {
      return json(res, 415, { error: 'Unsupported audio format.' });
    }
    if (Number(req.headers['content-length'] || 0) > MAX_AUDIO_BYTES) {
      return json(res, 413, { error: 'Recording is too large.' });
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_AUDIO_BYTES) {
          const error = new Error('Recording is too large.');
          error.status = 413;
          throw error;
        }
        chunks.push(chunk);
      }
      if (size < 200) return json(res, 400, { error: 'No usable recording was received.' });
      const transcript = await localAsr.transcribe(Buffer.concat(chunks));
      return json(res, 200, { transcript });
    } catch (error) {
      if (res.destroyed) return;
      const status = error.status || 502;
      return json(res, status, { error: status === 502 ? 'Local recognition failed. Please try again.' : error.message });
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
  let file = files.get(url.pathname);
  if (!file && /^\/models\/whisper-small\/(added_tokens|config|generation_config|normalizer|preprocessor_config|special_tokens_map|tokenizer|tokenizer_config|vocab)\.json$/.test(url.pathname)) {
    file = [`public${url.pathname}`, 'application/json; charset=utf-8'];
  }
  if (!file && url.pathname === '/models/whisper-small/merges.txt') file = [`public${url.pathname}`, 'text/plain; charset=utf-8'];
  if (!file && /^\/models\/whisper-small\/onnx\/(encoder_model|decoder_model_merged)_quantized\.onnx$/.test(url.pathname)) {
    file = [`public${url.pathname}`, 'application/octet-stream'];
  }
  if (!file && /^\/vendor\/transformers\/(transformers\.web\.min\.js|ort-wasm-simd-threaded\.jsep\.(mjs|wasm))$/.test(url.pathname)) {
    file = [`public${url.pathname}`, url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8'];
  }
  if (!file && /^\/vendor\/sherpa\/sherpa-onnx-(asr\.js|wasm-main-asr\.(js|wasm|data))$/.test(url.pathname)) {
    file = [`public${url.pathname}`, url.pathname.endsWith('.wasm') ? 'application/wasm' : url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream'];
  }
  let decodedPathname = '';
  try { decodedPathname = decodeURIComponent(url.pathname); } catch { /* Invalid paths are rejected below. */ }
  if (!file && /^\/strokes\/[\u3400-\u9fff]\.json$/u.test(decodedPathname)) {
    file = [`public${decodedPathname}`, 'application/json; charset=utf-8'];
  }
  if (!file && /^\/workbooks\/zhongwen-(0[1-9]|1[0-2])-[AB]\.pdf$/.test(url.pathname)) {
    file = [url.pathname.slice(1), 'application/pdf'];
  }
  if (!file) return json(res, 404, { error: 'Page not found.' });
  return serveFile(res, file[0], file[1], req.method);
});

server.listen(port, host, () => {
  console.log(`Little Lantern is ready at http://${host}:${port}`);
});
