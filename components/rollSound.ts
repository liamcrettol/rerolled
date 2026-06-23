// Tiny Web Audio helper for roll feedback — no audio files, synthesized on the
// fly. All calls are no-ops on the server or if the browser blocks audio.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, duration: number, gain = 0.05, type: OscillatorType = "sine") {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + startOffset;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Short blip played repeatedly while a slot is spinning. */
export function playTick() {
  tone(880, 0, 0.04, 0.025, "square");
}

/** Soft two-note confirm for a manual pick from the browser (no spin). */
export function playPick() {
  tone(659.25, 0, 0.09, 0.045, "sine"); // E5
  tone(987.77, 0.05, 0.12, 0.045, "sine"); // B5
}

/** Played when a slot settles. Exotic gets a brighter ascending triad. */
export function playReveal(exotic: boolean) {
  if (exotic) {
    tone(523.25, 0, 0.14, 0.06, "triangle"); // C5
    tone(659.25, 0.08, 0.14, 0.06, "triangle"); // E5
    tone(783.99, 0.16, 0.22, 0.07, "triangle"); // G5
    tone(1046.5, 0.24, 0.3, 0.05, "triangle"); // C6
  } else {
    tone(587.33, 0, 0.12, 0.05, "sine"); // D5
    tone(880, 0.06, 0.16, 0.05, "sine"); // A5
  }
}
