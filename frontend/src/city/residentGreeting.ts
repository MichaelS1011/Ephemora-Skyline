/**
 * The resident's offer, and when the crowd still owes a wave.
 *
 * The announcement card speaks in a resident's voice for nine seconds and then
 * folds itself away. The offer outlives the card — the folded strip carries the
 * same verb — and a resident in the frame waves again every twenty seconds
 * while it stands. Both stop the moment the reader answers, and both stop
 * forever the moment the reader closes the card: a refusal is never asked a
 * second time.
 */

export type ResidentOffer = "open" | "taken" | "closed";

/** Between two waves: long enough not to twitch, short enough to be noticed. */
export const WAVE_REPEAT_S = 20;
/** How long a picked resident holds the wave. */
export const WAVE_HOLD_S = 3.4;

/**
 * Is a wave owed right now? `stageBusy` is true while a guided flow, a findings
 * list, an open file or a called resident owns the screen — none of them is the
 * moment for a figure in the crowd to start waving.
 */
export function owesWave(
  offer: ResidentOffer,
  stageBusy: boolean,
  nowS: number,
  lastWaveS: number,
): boolean {
  if (offer !== "open" || stageBusy) return false;
  return nowS - lastWaveS >= WAVE_REPEAT_S;
}
