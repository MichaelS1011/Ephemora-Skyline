/**
 * Timing of the construction cinematic, kept free of three.js on purpose.
 *
 * `PHASE_0_MS` is defined next to the cinematic that plays it — but `CityTree`
 * is a 3D component, and the HUD needs the same number to pace its own
 * construction chrome. A static import of `CityTree` from the HUD would drag
 * the whole 3D world into the entry chunk, so the shared number lives here
 * and `CityTree` re-exports it for the cinematic's own consumers.
 */

/** Phase 0 of the construction cinematic: empty terrain while the Ephe's move in. */
export const PHASE_0_MS = 1600;
