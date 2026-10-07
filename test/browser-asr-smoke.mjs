import { prepareBrowserRecognizer, transcribeInBrowser } from '/browser-asr.mjs';
import { recordedAudioToSamples } from '/audio-prep.mjs';
const status = document.getElementById('status');
document.addEventListener('click', async event => {
  const engine = event.target.dataset.engine;
  if (!engine) return;
  document.querySelectorAll('button').forEach(button => button.disabled = true);
  status.textContent = `Starting ${engine}…`;
  try {
    const samples = await recordedAudioToSamples(await (await fetch('/test/mandarin-smoke.wav')).blob());
    await prepareBrowserRecognizer(engine, message => { status.textContent = message; });
    status.textContent = `${engine} is transcribing…`;
    const start = performance.now();
    const transcript = await transcribeInBrowser(engine, samples);
    status.textContent = `${engine}: ${transcript || '(no words)'} (${((performance.now() - start) / 1000).toFixed(1)} s)`;
  } catch (error) { status.textContent = `${engine} ERROR: ${error.message}`; }
  document.querySelectorAll('button').forEach(button => button.disabled = false);
});
