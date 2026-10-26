// @vitest-environment node
/**
 * Arbeitspräsenz — der Wächter über die Sitzregel.
 *
 * Die Bewohner ziehen dorthin, wo noch eine Entscheidung offen ist
 * (`city/epheDuty.ts`). Vier Dinge können dabei still kaputtgehen, und jeder
 * Fall hier ist gegen einen davon gebaut:
 *
 * 1. Die Menge würde bei jedem Urteil umspringen — der Leser sähe, wie die
 *    halbe Stadt teleportiert, nur weil er eine Zeile entschieden hat.
 * 2. Ein entschiedener Bezirk bekäme trotzdem Publikum — die Präsenz wäre dann
 *    keine Aussage mehr, sondern Dekoration.
 * 3. Ohne offene Arbeit würde die Stadt aussterben — Präsenz ohne Adresse ist
    schlechter als kein Bewohner, also muss dann der alte Rundlauf gelten.
 * 4. Die Identität einer Figur (Name, Aussehen) würde mit dem Sitz wandern —
 *    derselbe Bewohner wäre nach einer Entscheidung ein anderer.
 *
 * Die Zahlen, die diese Datei liefert, sind die Abnahme aus dem Auftrag:
 * Sitzanteil auf offener Arbeit, Abdeckung der offenen Parzellen, und der
 * Rest, den eine zu kleine Crowd nicht erreichen kann.
 */
import { describe, expect, it } from "vitest";
import {
  presenceCoverage,
  presenceSeats,
  seatHome,
  ephePresenceIdentity,
  type PlotWork,
} from "../src/city/epheDuty";
import { epheIdentityOf } from "../src/city/epheIdentity";

const P = (total: number, open: number): PlotWork => ({ total, open });

describe("the seats follow the open work", () => {
  /**
   * p0: 5 Befunde, 3 offen — die meiste Arbeit
   * p1: 2 Befunde, keiner offen — entschieden, bekommt KEINEN Sitz
   * p2: keine Befunde — Alltag
   * p3: 1 Befund, 1 offen
   */
  const plots = [P(5, 3), P(2, 0), P(0, 0), P(1, 1)];

  it("seats the open plots worst-first, then the repeats, then the quiet life", () => {
    expect(presenceSeats(plots, 4)).toEqual([0, 3, 0, 0]);
    expect(presenceSeats(plots, 8)).toEqual([0, 3, 0, 0, 2, 0, 3, 0]);
  });

  it("leaves a decided plot empty while open work is left to seat", () => {
    for (const crowd of [1, 2, 4, 8, 13, 40]) {
      expect(
        presenceSeats(plots, crowd).includes(1),
        `crowd ${crowd}: p1 traegt nur entschiedene Befunde`,
      ).toBe(false);
    }
  });

  it("reports the coverage the crowd actually reaches", () => {
    const small = presenceCoverage(presenceSeats(plots, 2), plots);
    expect(small).toEqual({ residentShare: 1, unstaffedOpenPlots: 0, coverage: 1 });
    const wide = presenceCoverage(presenceSeats(plots, 8), plots);
    expect(wide.residentShare, "sieben von acht Sitzen stehen auf offener Arbeit").toBeCloseTo(
      7 / 8,
      10,
    );
    expect(wide.coverage).toBe(1);
    expect(wide.unstaffedOpenPlots).toBe(0);
  });

  it("names the open plots a too-small crowd cannot reach", () => {
    const many = [P(9, 9), P(8, 8), P(7, 7), P(6, 6), P(5, 5)];
    const seats = presenceSeats(many, 2);
    // Die Regel sitzt erst einmal eine Figur pro offener Parzel, schwerste
    // zuerst: Breite vor Tiefe. Eine Crowd von zwei erreicht also zwei Parzellen
    // und nicht zweimal dieselbe.
    expect(
      seats,
      "die beiden Sitze stehen auf der schwersten und der zweit-schweren Arbeit",
    ).toEqual([0, 1]);
    const cov = presenceCoverage(seats, many);
    expect(cov.coverage, "von funf offenen Parzellen sind zwei erreicht").toBeCloseTo(2 / 5, 10);
    expect(cov.unstaffedOpenPlots).toBe(3);
    expect(cov.residentShare).toBe(1);
    const four = presenceCoverage(presenceSeats(many, 4), many);
    expect(four.coverage, "vier Figuren decken vier der funf offenen Parzellen").toBeCloseTo(
      4 / 5,
      10,
    );
  });
});

describe("a city without open work keeps its everyday life", () => {
  const plots = [P(2, 0), P(1, 0), P(0, 0)];

  it("falls back to the round-robin the crowd was always built on", () => {
    expect(presenceSeats(plots, 7)).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(seatHome(4, presenceSeats(plots, 7), plots.length)).toBe(1);
  });

  it("counts its coverage as full, because there is nothing to point at", () => {
    expect(presenceCoverage(presenceSeats(plots, 5), plots).coverage).toBe(1);
  });

  it("keeps an empty level empty instead of inventing a door", () => {
    expect(presenceSeats([], 9)).toEqual([]);
    expect(seatHome(3, [], 0)).toBe(-1);
  });
});

describe("the rule is a function of the data, not of the moment", () => {
  const plots = [P(5, 3), P(2, 0), P(0, 0), P(1, 1)];

  it("gives the same seats for the same city and the same verdicts", () => {
    const a = presenceSeats(plots, 12);
    const b = presenceSeats(
      plots.map((p) => ({ ...p })),
      12,
    );
    expect(b).toEqual(a);
  });

  it("moves a seat only when the open work actually changes", () => {
    const before = presenceSeats(plots, 6);
    const decided = [P(5, 2), P(2, 0), P(0, 0), P(1, 1)];
    expect(
      presenceSeats(decided, 6).slice(0, 2),
      "ein Urteil weniger ändert die Reihenfolge nicht, solange p0 die schwerste Arbeit bleibt",
    ).toEqual(before.slice(0, 2));
  });
});

describe("a resident stays the same resident", () => {
  const unitIds = ["f-src/a.ts", "f-src/b.ts", "f-src/c.ts"];

  it("agrees with the index identity when the seats are the everyday round-robin", () => {
    const plots = [P(2, 0), P(1, 0), P(0, 0)];
    const seats = presenceSeats(plots, 9);
    for (let i = 0; i < 9; i++) {
      expect(ephePresenceIdentity(i, unitIds, seats)).toEqual(epheIdentityOf(i, unitIds));
    }
  });

  it("keeps the address stable for the figure that sits on the same plot", () => {
    const plots = [P(5, 3), P(2, 0), P(0, 0), P(1, 1)];
    const seats = presenceSeats(plots, 4);
    const onA = [0, 2, 3].map((i) => ephePresenceIdentity(i, unitIds, seats));
    expect(
      onA.every((id) => id.plot === "f-src/a.ts"),
      "drei Sitze stehen auf p0",
    ).toBe(true);
    expect(
      onA.map((id) => id.seat),
      "und sind dort verschiedene Bewohner",
    ).toEqual([0, 1, 2]);
  });

  it("refuses to name a door the plan could not name", () => {
    const seats = [0, 1];
    expect(ephePresenceIdentity(0, [null, "f-x.ts"], seats)).toEqual({ plot: null, seat: 0 });
  });
});
