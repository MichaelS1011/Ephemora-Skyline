/**
 * Craft/Audio — the two moments in a visit that deserve a sound, and nothing
 * else. Selecting a building stays silent (a click per hover-hunt is noise,
 * not feedback); saving a verdict answers with one soft stroke, so the hand
 * learns the button works even before the tally updates.
 *
 * No audio files: the tone is synthesised (a short exponential decay on two
 * frequencies — the verdict's own rising third), which keeps the shipped
 * bundle at zero bytes of media and the sound identical on every machine.
 *
 * The gate is the same one every motion in this app honours: a user who
 * asked the system to reduce motion is not handed a sound they did not ask
 * for. There is no new switch — reduced-motion IS the switch.
 */
import { prefersReducedMotion } from "./motion";

let ctx: AudioContext | null = null;

/** The two tones of the verdict stroke, in Hz — a perfect fifth, dry. */
export const VERDICT_TONES = [523.25, 784.0] as const;
/** Seconds each tone sounds; the second starts where the first has decayed. */
export const VERDICT_STEP_S = 0.09;
/** Peak gain of one tone — quiet enough to sit under a conversation. */
export const VERDICT_PEAK = 0.05;

/** The gain envelope of one tone at `t` seconds after its start. */
export function verdictGain(t: number): number {
  if (t < 0 || t > 0.25) return 0;
  return VERDICT_PEAK * Math.exp(-t * 18);
}

/** True while a sound may play at all. */
export function soundAllowed(): boolean {
  return !prefersReducedMotion();
}

function ensureContext(): AudioContext | null {
  if (!soundAllowed()) return null;
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    return ctx;
  } catch {
    // no WebAudio in this browser — the app loses the sound, never a frame
    return null;
  }
}

/** The verdict stroke: two short decaying tones, a rising fifth. */
export function playVerdict(): void {
  const ac = ensureContext();
  if (!ac) return;
  const t0 = ac.currentTime;
  VERDICT_TONES.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t0 + i * VERDICT_STEP_S;
    gain.gain.setValueAtTime(verdictGain(0), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.26);
  });
}
