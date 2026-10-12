import { describe, it, expect } from "vitest";
import {
  expectedOrigins,
  isForeignBrowserRequest,
  localOnlyRoute,
  refusalFor,
} from "../src/server/local-only.js";

/**
 * The second sentence a refused write can speak, and the case the first drive
 * fell into.
 *
 * Befund 2 of the first drive: a second checkout on the same machine opened its
 * dev server on 3011 — Vite slides one port when 3010 is busy — and every write
 * answered `403 This request came from another website`. The refusal was right.
 * The sentence was wrong: it sent a person who had changed a port on a search
 * for an attacker.
 *
 * `refusalFor()` splits that now. These cases hold the split open on the two
 * shapes the drive never walked into, because a drive only ever runs the one
 * spelling it was written with: the same port under the other loopback name, and
 * the loopback name worn by somebody else's host.
 *
 * The decision these tests encode, stated once, in the open:
 *
 *   A page that can name `localhost`, `127.0.0.1` or `::1` is a page on this
 *   machine. It is refused when the process was not told to serve it — the door
 *   stays shut — but it is never called a visitor from another website, because
 *   the only way to say one of those names is to have been served by this
 *   machine or to be one. A port is not an identity and an attacker does not
 *   live on the loopback range; a *look-alike* host does, and a look-alike is
 *   not a port mixup, so it keeps the old sentence.
 */
const SERVED = ["http://localhost:3010", "http://127.0.0.1:3010", "tauri://localhost"];
const FOREIGN =
  "This request came from another website — Ephemora Skyline only accepts its own page.";

describe("same port, other loopback spelling", () => {
  /**
   * `expectedOrigins()` answers with both spellings of the dev port and one
   * configured origin, so the twin of the port a person is on is served by
   * default. Nothing here is a decision to let more through: it is the list the
   * process already builds.
   */
  it("is the app's own page when the port is the one it serves", () => {
    expect(
      isForeignBrowserRequest({ origin: "http://127.0.0.1:3010" }, SERVED),
      "127.0.0.1 twin",
    ).toBe(false);
    expect(expectedOrigins({})).toContain("http://127.0.0.1:3010");
  });

  /**
   * Recorded as it behaves, not as one would wish, because the two halves of
   * this are the finding the drive reports: `expectedOrigins()` appends
   * `http://127.0.0.1:3010` to every list, whatever FRONTEND_ORIGIN says, while
   * `http://localhost:3010` — the same machine, the same port, the other
   * spelling — is not in it and is refused. One address of this machine is
   * therefore always allowed to drive the routes that run code, and whoever
   * binds that address (a second checkout, any dev server) is inside the door
   * the guard was built for.
   */
  it("admits the 127.0.0.1 twin of the dev port whatever was configured", () => {
    const served = expectedOrigins({ FRONTEND_ORIGIN: "http://localhost:3011" });
    expect(served).toContain("http://127.0.0.1:3010");
    expect(
      isForeignBrowserRequest({ origin: "http://127.0.0.1:3010", host: "127.0.0.1:4110" }, served),
      "the twin is never refused",
    ).toBe(false);
  });

  it("refuses the other spelling of the very same port on the very same machine", () => {
    const served = expectedOrigins({ FRONTEND_ORIGIN: "http://localhost:3011" });
    expect(
      isForeignBrowserRequest({ origin: "http://localhost:3010", host: "127.0.0.1:4110" }, served),
    ).toBe(true);
    expect(refusalFor("http://localhost:3010", served)).toContain(
      "FRONTEND_ORIGIN=http://localhost:3010",
    );
  });

  /**
   * …and the answer it gets is the one about settings, not the one about an
   * attacker. Same port, other name — a person on this machine, on a port the
   * process was not told to serve.
   */
  it("says which origins this process serves instead of blaming a website", () => {
    const said = refusalFor("http://127.0.0.1:3010", ["http://localhost:3011"]);
    expect(said).toContain("FRONTEND_ORIGIN=http://127.0.0.1:3010");
    expect(said, "the served list, so the two can be compared").toContain("http://localhost:3011");
    expect(said, "no attacker is claimed where none is").not.toContain("another website");
  });

  it("speaks the same way about the address a loopback page really arrives on", () => {
    for (const origin of ["http://[::1]:3010", "http://127.0.0.1:3011", "http://localhost:3011"]) {
      const said = refusalFor(origin, SERVED);
      expect(said, origin).toContain(`FRONTEND_ORIGIN=${origin}`);
      expect(said, origin).not.toContain("another website");
    }
  });
});

describe("same port, somebody else's host", () => {
  /**
   * The other half of the decision, and the half that keeps the guard worth
   * having. A host that merely contains the word is not this machine: it is
   * reachable from outside, and it is exactly the shape that would walk into the
   * friendly sentence if the test were "same port" instead of "loopback name".
   */
  it("keeps the old sentence for a look-alike host on the served port", () => {
    for (const origin of [
      "http://localhost.evil.example:3010",
      "http://127001.evil.example:3010",
      "http://evil.example:3010",
      "http://localhost.evil.example:3010/",
    ]) {
      expect(refusalFor(origin, SERVED), origin).toBe(FOREIGN);
    }
  });

  /**
   * Recorded rather than demanded: the split reads the name, not the scheme, so
   * a loopback page served over https gets the settings sentence too. That is
   * consistent with the decision above — it is still this machine — and it is
   * written down because a future change to either half should have to answer
   * this case, not discover it.
   */
  it("answers a loopback name over another scheme the same way as over http", () => {
    const said = refusalFor("https://localhost:3011", SERVED);
    expect(said).toContain("FRONTEND_ORIGIN=https://localhost:3011");
    expect(said).not.toContain("another website");
  });

  it("refuses it too, so the wording is the only thing that changed", () => {
    for (const origin of ["http://[::1]:3011", "http://localhost.evil.example:3010"]) {
      const answer: { status: number; body: string; passed: boolean } = {
        status: 0,
        body: "",
        passed: false,
      };
      localOnlyRoute(
        { headers: { origin, "sec-fetch-site": "cross-site", host: "127.0.0.1:4110" } } as never,
        {
          status(code: number) {
            answer.status = code;
            return {
              json(b: unknown) {
                answer.body = JSON.stringify(b);
              },
            };
          },
        } as never,
        () => {
          answer.passed = true;
        },
      );
      expect(answer.status, origin).toBe(403);
      expect(answer.passed, `${origin} must not reach the route`).toBe(false);
      expect(answer.body, origin).toContain("Ephemora Skyline only accepts its own page");
    }
  });
});

/**
 * The drive's own shape, pinned as a case: a second instance on 4110 serving a
 * dev page on 3011. This is the run that made the four sentences above, and it
 * only works because FRONTEND_ORIGIN was set. Without it the drive would have
 * got the friendly refusal — the drive's numbers would still be right, the
 * upload would not have happened.
 */
describe("the second instance the drive runs", () => {
  it("serves the port it was told to serve and says so about the others", () => {
    const served = expectedOrigins({ FRONTEND_ORIGIN: "http://localhost:3011" });
    expect(isForeignBrowserRequest({ origin: "http://localhost:3011" }, served)).toBe(false);
    expect(
      isForeignBrowserRequest({ origin: "http://localhost:3012", host: "127.0.0.1:4110" }, served),
    ).toBe(true);
    const said = refusalFor("http://localhost:3012", served);
    expect(said).toContain("FRONTEND_ORIGIN=http://localhost:3012");
    expect(said).toContain("http://localhost:3011");
  });

  it("does not invent a served list when nothing was configured", () => {
    expect(expectedOrigins({ FRONTEND_ORIGIN: "  " })).toEqual([
      "http://localhost:3010",
      "http://127.0.0.1:3010",
      "tauri://localhost",
    ]);
  });
});
