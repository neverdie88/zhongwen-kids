// Keep only one large speech model resident in memory at a time.
let current = null;

export function releaseBrowserRecognizer() {
  if (!current) return;
  const instance = current;
  instance.worker.terminate();
  clearTimeout(instance.loadTimer);
  const error = new Error('Speech model was changed before it finished.');
  instance.readyReject(error);
  for (const pending of instance.pending.values()) pending.reject(error);
  instance.pending.clear();
  current = null;
}

export function prepareBrowserRecognizer(engine, onProgress = () => {}) {
  if (current?.engine !== engine) releaseBrowserRecognizer();
  if (current) {
    current.onProgress = onProgress;
    return current.ready;
  }

  const path = new URL(engine === 'whisper-small' ? './workers/whisper-worker.bundle.mjs' : './workers/sherpa-worker.js', import.meta.url);
  const worker = new Worker(path, { type: engine === 'whisper-small' ? 'module' : 'classic' });
  const instance = { engine, worker, onProgress, nextId: 0, pending: new Map() };
  instance.ready = new Promise((resolve, reject) => {
    instance.readyResolve = resolve;
    instance.readyReject = reject;
  });
  instance.loadTimer = setTimeout(() => {
    if (current !== instance) return;
    instance.readyReject(new Error('The browser speech model took too long to load. Try another choice.'));
    releaseBrowserRecognizer();
  }, 120000);
  current = instance;
  worker.onmessage = ({ data }) => {
    if (current !== instance) return;
    if (data.type === 'progress') return instance.onProgress(data.message);
    if (data.type === 'ready') {
      clearTimeout(instance.loadTimer);
      return instance.readyResolve();
    }
    if (data.type === 'error' && data.id == null) {
      instance.readyReject(new Error(data.message));
      releaseBrowserRecognizer();
      return;
    }
    const pending = instance.pending.get(data.id);
    if (!pending) return;
    instance.pending.delete(data.id);
    if (data.type === 'error') pending.reject(new Error(data.message));
    else pending.resolve(data.transcript || '');
  };
  worker.onerror = event => {
    const error = new Error(event.message || 'The browser speech model could not start.');
    instance.readyReject(error);
    for (const pending of instance.pending.values()) pending.reject(error);
    instance.pending.clear();
    releaseBrowserRecognizer();
  };
  worker.postMessage({ type: 'load' });
  return instance.ready;
}

export async function transcribeInBrowser(engine, samples, onProgress) {
  await prepareBrowserRecognizer(engine, onProgress);
  const instance = current;
  return new Promise((resolve, reject) => {
    const id = ++instance.nextId;
    instance.pending.set(id, { resolve, reject });
    instance.worker.postMessage({ type: 'transcribe', id, samples }, [samples.buffer]);
  });
}
