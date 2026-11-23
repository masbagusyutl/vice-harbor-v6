// Vice Harbor — sound, synthesized live with WebAudio: no audio files, no network.
// An engine hum that follows the car's speed, a two-tone police siren, and short blips for
// pickups, job completions and menu moves. Everything is guarded so a browser without audio
// (or a headless screenshot run) simply stays silent.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let enabled = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ctx.destination);
      sirenOsc.start();
      enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, vol, type) {
    if (!ensure() || !enabled) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    } catch { /* silent */ }
  }

  return {
    /** Call from a user gesture (start button / keypress) to unlock audio. */
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    engine(speed, maxSpeed) {
      if (!ensure() || !enabled) return;
      const f = Math.abs(speed) / Math.max(1, maxSpeed);
      engineOsc.frequency.value = 45 + f * 140;
      engineGain.gain.value = f > 0.02 ? 0.03 + f * 0.04 : 0;
    },
    siren(on) {
      if (!ensure() || !enabled) return;
      if (on) {
        sirenOsc.frequency.setTargetAtTime(700 + Math.sin(ctx.currentTime * 4) * 250, ctx.currentTime, 0.05);
        sirenGain.gain.value = 0.02;
      } else sirenGain.gain.value = 0;
    },
    pickup() { blip(880, 0.18, 0.12); setTimeout(() => blip(1320, 0.22, 0.12), 90); },
    jobDone() { blip(523, 0.2, 0.14); setTimeout(() => blip(659, 0.2, 0.14), 120); setTimeout(() => blip(784, 0.35, 0.14), 240); },
    click() { blip(440, 0.07, 0.08, 'square'); },
    busted() { blip(220, 0.5, 0.12, 'sawtooth'); },
  };
}
