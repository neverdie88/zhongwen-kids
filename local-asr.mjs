import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const defaultModel = path.resolve(root, '../voice-bridge/models/ggml-small.bin');
const defaultVad = path.join(root, 'models/ggml-silero-v6.2.0.bin');

async function available(binary) {
  try { await run('which', [binary], { timeout: 3000 }); return true; }
  catch { return false; }
}

async function hasFile(file, minSize) {
  try { return (await stat(file)).size >= minSize; }
  catch { return false; }
}

async function runTool(binary, args, timeout) {
  await run(binary, args, { timeout, maxBuffer: 2 * 1024 * 1024 });
}

export function createLocalAsr({
  modelPath = process.env.ZHONGWEN_WHISPER_MODEL || defaultModel,
  vadPath = process.env.ZHONGWEN_VAD_MODEL || defaultVad,
  ffmpeg = 'ffmpeg',
  whisper = 'whisper-cli',
  runCommand = runTool,
} = {}) {
  let busy = false;

  async function health() {
    const [model, vad, converter, recognizer] = await Promise.all([
      hasFile(modelPath, 50_000_000), hasFile(vadPath, 100_000),
      available(ffmpeg), available(whisper),
    ]);
    return {
      ready: model && vad && converter && recognizer,
      model, vad, ffmpeg: converter, whisper: recognizer,
    };
  }

  async function transcribe(audio) {
    if (busy) {
      const error = new Error('The local recognizer is finishing another phrase. Try again.');
      error.status = 429;
      throw error;
    }
    busy = true;
    let directory;
    try {
      if (!(await health()).ready) {
        const error = new Error('Local recognition is not ready. Check Whisper, FFmpeg, and the model.');
        error.status = 503;
        throw error;
      }
      directory = await mkdtemp(path.join(os.tmpdir(), 'zhongwen-asr-'));
      const input = path.join(directory, 'speech.input');
      const wav = path.join(directory, 'speech.wav');
      const output = path.join(directory, 'result');
      await writeFile(input, audio);
      await runCommand(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
        '-t', '12', '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], 30000);
      await runCommand(whisper, ['-ng', '-m', modelPath, '-f', wav, '-l', 'zh',
        '--vad', '-vm', vadPath, '-nt', '-np', '-otxt', '-of', output], 90000);
      // whisper-cli can exit successfully without writing a transcript when VAD finds no speech.
      let transcript = '';
      try { transcript = (await readFile(`${output}.txt`, 'utf8')).trim(); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      return transcript.slice(0, 500);
    } finally {
      try { if (directory) await rm(directory, { recursive: true, force: true }); }
      finally { busy = false; }
    }
  }

  return { health, transcribe };
}
