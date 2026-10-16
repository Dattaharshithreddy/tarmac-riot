/* ---------- audio (all synthesised, no files) ---------- */
function createSound() {
  let ac = null, master = null, engOsc = null, engGain = null, windGain = null, sirenOsc = null, sirenGain = null, noiseBuf = null;
  let muted = false;
  function init() {
    if (ac) { if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} } return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      engOsc = [ac.createOscillator(), ac.createOscillator()];
      engOsc[0].type = 'sawtooth'; engOsc[1].type = 'square';
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
      engGain = ac.createGain(); engGain.gain.value = 0;
      engOsc.forEach((o) => { o.frequency.value = 60; o.connect(lp); o.start(); });
      lp.connect(engGain); engGain.connect(master);
      const wind = ac.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
      windGain = ac.createGain(); windGain.gain.value = 0; wind.connect(bp); bp.connect(windGain); windGain.connect(master); wind.start();
      sirenOsc = ac.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 700;
      sirenGain = ac.createGain(); sirenGain.gain.value = 0; sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
    } catch (e) { ac = null; }
  }
  function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ac.currentTime, 0.02); }
  function drive(sp, boost, active, siren) {
    if (!ac) return;
    const t = ac.currentTime, f = 48 + sp * 140 + (boost ? 24 : 0);
    engOsc[0].frequency.setTargetAtTime(f, t, 0.06); engOsc[1].frequency.setTargetAtTime(f * 0.5, t, 0.06);
    engGain.gain.setTargetAtTime(active ? 0.08 + sp * 0.09 : 0, t, 0.12);
    windGain.gain.setTargetAtTime(active ? sp * sp * 0.2 : 0, t, 0.12);
    sirenGain.gain.setTargetAtTime(siren ? 0.04 : 0, t, 0.1);
    if (siren) sirenOsc.frequency.setTargetAtTime(Math.floor(t * 2.2) % 2 ? 880 : 640, t, 0.02);
  }
  function noise(dur, ftype, f0, f1, vol) {
    if (!ac) return; const t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = ftype;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  function tone(freq, dur, type, vol, to, delay) {
    if (!ac) return; const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function sfx(name) {
    if (!ac || muted) return;
    switch (name) {
      case 'swing': noise(0.1, 'bandpass', 1800, 700, 0.18); break;
      case 'hit': noise(0.15, 'lowpass', 900, 200, 0.5); tone(150, 0.16, 'square', 0.25, 55); break;
      case 'takedown': tone(523, 0.12, 'square', 0.12); tone(784, 0.18, 'square', 0.12, null, 0.1); break;
      case 'crash': noise(0.55, 'lowpass', 1400, 150, 0.7); tone(95, 0.4, 'sawtooth', 0.3, 38); break;
      case 'wipe': noise(0.95, 'lowpass', 1100, 90, 0.8); tone(110, 0.6, 'sawtooth', 0.25, 30); break;
      case 'pickup': tone(880, 0.07, 'sine', 0.18); tone(1320, 0.1, 'sine', 0.18, null, 0.07); break;
      case 'near': tone(1100, 0.09, 'triangle', 0.14, 1800); break;
      case 'beep': tone(440, 0.16, 'sine', 0.3); break;
      case 'go': tone(880, 0.4, 'sine', 0.32); break;
      case 'busted': tone(260, 0.7, 'sawtooth', 0.3, 90); break;
      case 'finish': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.14, null, i * 0.11)); break;
      case 'firework': tone(900 + Math.random() * 600, 0.5, 'sine', 0.05, 200); setTimeout(() => noise(0.7, 'lowpass', 2400, 120, 0.45), 380); break;
      case 'cannon': noise(0.35, 'lowpass', 1800, 200, 0.6); tone(120, 0.25, 'square', 0.2, 50); break;
      case 'cheer': for (let k = 0; k < 6; k++) setTimeout(() => noise(1.6, 'bandpass', 1300 + k * 120, 700, 0.12), k * 220); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.24, 'triangle', 0.12, null, 0.3 + i * 0.13)); break;
      case 'ui': tone(660, 0.05, 'square', 0.1); break;
      case 'buy': tone(700, 0.07, 'square', 0.12); tone(1050, 0.1, 'square', 0.12, null, 0.07); break;
      default: break;
    }
  }
  return { init: init, setMuted: setMuted, drive: drive, sfx: sfx, get muted() { return muted; } };
}
