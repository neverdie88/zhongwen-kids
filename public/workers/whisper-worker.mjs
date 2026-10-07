import { env, pipeline } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('../models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/transformers/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;

let transcriber;

function describeProgress(event) {
  if (event.status === 'progress' && event.total) {
    const percent = Math.round(100 * event.loaded / event.total);
    return `Loading Whisper Small: ${percent}%`;
  }
  if (event.status === 'initiate') return 'Loading Whisper Small model…';
  if (event.status === 'done') return 'Preparing Whisper Small…';
  return null;
}

self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    try {
      transcriber = await pipeline('automatic-speech-recognition', 'whisper-small', {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: event => {
          const message = describeProgress(event);
          if (message) self.postMessage({ type: 'progress', message });
        },
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: error?.message || 'Whisper Small could not load.' });
    }
    return;
  }
  if (data.type === 'transcribe') {
    try {
      const result = await transcriber(data.samples, { language: 'chinese', task: 'transcribe' });
      self.postMessage({ type: 'result', id: data.id, transcript: result.text?.trim() || '' });
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, message: error?.message || 'Whisper Small could not read the recording.' });
    }
  }
};
