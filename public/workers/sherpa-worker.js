/* The sherpa-onnx release is a classic Emscripten worker bundle. */
let recognizer;
let loading = false;

self.Module = {
  locateFile: path => new URL(`../vendor/sherpa/${path}`, self.location.href).href,
  setStatus(status) {
    const match = status.match(/Downloading data\.\.\. \((\d+)\/(\d+)\)/);
    const message = match
      ? `Loading sherpa-onnx: ${Math.round(Number(match[1]) / Number(match[2]) * 100)}%`
      : status === 'Running...' ? 'Preparing sherpa-onnx…' : status;
    if (message) self.postMessage({ type: 'progress', message });
  },
  onRuntimeInitialized() {
    try {
      recognizer = createOnlineRecognizer(self.Module);
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: error?.message || 'sherpa-onnx could not start.' });
    }
  },
};

self.onunhandledrejection = event => {
  self.postMessage({ type: 'error', message: event.reason?.message || 'sherpa-onnx model could not load.' });
};

function decode(samples) {
  const stream = recognizer.createStream();
  const phrases = [];
  try {
    for (let offset = 0; offset < samples.length; offset += 4096) {
      stream.acceptWaveform(16000, samples.subarray(offset, offset + 4096));
      while (recognizer.isReady(stream)) recognizer.decode(stream);
      if (recognizer.isEndpoint(stream)) {
        const text = recognizer.getResult(stream).text?.trim();
        if (text) phrases.push(text);
        recognizer.reset(stream);
      }
    }
    stream.acceptWaveform(16000, new Float32Array(16000));
    stream.inputFinished();
    while (recognizer.isReady(stream)) recognizer.decode(stream);
    const text = recognizer.getResult(stream).text?.trim();
    if (text) phrases.push(text);
    return phrases.join('');
  } finally {
    stream.free();
  }
}

self.onmessage = ({ data }) => {
  if (data.type === 'load') {
    if (loading) return;
    loading = true;
    try {
      importScripts(new URL('../vendor/sherpa/sherpa-onnx-asr.js', self.location.href).href, new URL('../vendor/sherpa/sherpa-onnx-wasm-main-asr.js', self.location.href).href);
    } catch (error) {
      self.postMessage({ type: 'error', message: error?.message || 'sherpa-onnx files could not load.' });
    }
    return;
  }
  if (data.type === 'transcribe') {
    try {
      self.postMessage({ type: 'result', id: data.id, transcript: decode(data.samples) });
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, message: error?.message || 'sherpa-onnx could not read the recording.' });
    }
  }
};
