/**
 * What the read budget is NOT for.
 *
 * The budget counts reads of the user's own data, so a caller must not be
 * locked out of their city by asking for the city again. These calls are not
 * that:
 * — a running scan's progress, its upload and its abort. The upload and the
 *   cancel are writes with their own budget (`localAnalyzeLimiter`, 120 per
 *   15 min) and a loopback guard, so counting them inside the read budget
 *   charged a scan twice for itself;
 * — the test runner's poll. `frontend/src/hooks/useTestRunner.ts:49` asks
 *   `GET /api/tests/run/:id` once a second while the project's own suite runs —
 *   the same shape as the progress bar the first fix was written for: a
 *   ten-minute suite spent the whole 600-slot window, and the read that came
 *   afterwards, the city itself, answered 429;
 * — the shipped rule-pack list. Server metadata, identical on every call, read
 *   whenever the profile chips mount.
 *
 * Exported as its own module because importing the server would start it.
 */
export const READ_BUDGET_EXEMPT =
  /^\/api\/(status\/[^/]+|tests\/run\/[^/]+|rule-packs|analyze-local(\/[0-9a-f-]+\/cancel)?)$/;
