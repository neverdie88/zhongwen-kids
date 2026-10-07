// Both browser models expect mono floating-point audio sampled at 16 kHz.
export async function recordedAudioToSamples(blob) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext || !window.OfflineAudioContext) throw new Error('This browser cannot prepare audio for offline recognition.');
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const length = Math.ceil(decoded.duration * 16000);
    const offline = new OfflineAudioContext(1, length, 16000);
    const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const target = mono.getChannelData(0);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const source = decoded.getChannelData(channel);
      for (let i = 0; i < source.length; i++) target[i] += source[i] / decoded.numberOfChannels;
    }
    const player = offline.createBufferSource();
    player.buffer = mono;
    player.connect(offline.destination);
    player.start();
    const resampled = await offline.startRendering();
    return new Float32Array(resampled.getChannelData(0));
  } finally { await context.close(); }
}
