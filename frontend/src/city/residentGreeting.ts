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

/**
 * What a called resident does with their arms.
 *
 * The reader's click already greeted them — and kept greeting for as long as the
 * card stayed open, which is not a greeting but a wave on a timer nobody set.
 * §04.08 makes it the short event the brief asks for: point at the finding the
 * reader opened if there is one (that is the resident's day job), greet while the
 * hold lasts, then stand and face the reader without an arm in the air.
 *
 * `greetUntil` is 0 while reduced motion is on, because the caller only starts a
 * greeting when motion is allowed. A frozen simulation clock would otherwise
 * never pass a deadline, and a resident would wave at a closed card forever.
 */
export function calledGesture(
  pointing: boolean,
  greetUntilS: number,
  nowS: number,
): "point" | "greet" | "idle" {
  if (pointing) return "point";
  return greetUntilS > nowS ? "greet" : "idle";
}
