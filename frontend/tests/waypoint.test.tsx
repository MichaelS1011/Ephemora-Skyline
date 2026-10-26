// @vitest-environment jsdom
/**
 * Der Wächter, den `city/waypoint.ts` verspricht.
 *
 * Der Wegpunkt am Bildschirmrand und der Flug zur Fund-Voxel teilen sich eine
 * einzige Rechnquelle. Zwei Dinge können dabei kaputtgehen, und beide still:
 * (1) die Quelle driftet auseinander — das Schild zeigt dann eine Richtung, in
 * die die Kamera nie fliegt; (2) die Kegel-Geometrie passt nicht mehr zur
 * Kamera, weil eine Zahl an zwei Stellen lebt. Diese Datei nagelt beides fest,
 * bevor irgend jemand "sieht doch richtig aus" als Beweis akzeptiert.
 *
 * Sichtnachweis (Pixel am laufenden Schirm) ist damit NICHT erbracht — der steht
 * in einem eigenen Browser-Slot aus.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAMERA_FOV_DEG,
  edgeSignalForWaypoint,
  worldTargetForFinding,
  type WorldTarget,
} from "../src/city/waypoint";
import { city, dir, file, finding } from "./helpers/cityFixture";
import { useStore } from "../src/stores/useStore";
import { HudOverlay } from "../src/components/HudOverlay";
import type { CityData } from "../src/city/types";

const OPEN = file("src/open.ts", "TypeScript", [
  finding({ severity: "P0", type: "HARDCODED_SECRET", line: 12 }),
]);
const DECIDED = file("src/decided.ts", "TypeScript", [
  finding({ severity: "P1", type: "SQL_INJECTION", line: 7 }),
]);

function probeCity(): CityData {
  return city({
    tree: dir({
      path: "",
      name: "repo",
      children: [dir({ path: "src", name: "src", detailFiles: [OPEN, DECIDED] })],
    }),
  });
}

const APP_SOURCE = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const fovLiteral = (): number => Number(/fov:\s*(\d+)/.exec(APP_SOURCE)?.[1]);

let host: HTMLDivElement;
let root: Root;

/** Die Sprache lebt in den_prefs, nicht auf dem Store-Stamm. */
function setLang(lang: "en" | "de") {
  setState({ prefs: { ...useStore.getInitialState().prefs, lang } } as StorePatch);
}

type StorePatch = Partial<ReturnType<typeof useStore.getState>>;

function setState(patch: StorePatch) {
  act(() => useStore.setState(patch as never));
}

function renderHud() {
  act(() => root.render(createElement(HudOverlay)));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  setState({
    cityData: probeCity(),
    reviews: {},
    threatFilter: "all",
    ruleFilter: null,
    triageActive: false,
    triageCursor: 0,
    triageTotal: 0,
    focusedFindingKey: null,
    flyRequest: null,
    selectedUnit: null,
    focusPath: [],
    tourActive: false,
    triageAnnounce: null,
    buildPhase: "built",
    cameraMode: "free",
    cameraInfo: { x: 0, z: 0, angle: 0, dist: 80 },
  } as never);
  setLang("en");
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the waypoint and the flight read one address", () => {
  it("has exactly one FOV number in the app and in the cone test", () => {
    expect(fovLiteral(), "App.tsx setzt eine fov-Zahl, und die muss die Kegelzahl sein").toBe(
      CAMERA_FOV_DEG,
    );
  });

  it("lands the camera exactly where the edge sign points", () => {
    const cityData = useStore.getState().cityData!;
    setState({ reviews: { [`${DECIDED.id}#0`]: "reviewed" } });
    useStore.getState().startTriage();
    const fly = useStore.getState().flyRequest;
    if (!fly) throw new Error("startTriage produced no flight");
    const target = worldTargetForFinding(cityData, OPEN.id, 12);
    expect(
      target,
      "die offene Zeile hat ein Voxzel, sonst ist der Flug ein Blindflug",
    ).not.toBeNull();
    expect(Number(fly.x.toFixed(6))).toBe(Number(target!.x.toFixed(6)));
    expect(Number(fly.z.toFixed(6))).toBe(Number(target!.z.toFixed(6)));
    expect(Number((fly.targetY ?? -1).toFixed(6))).toBe(Number(target!.y.toFixed(6)));
  });

  it("says nothing about a file the payload cannot place", () => {
    const cityData = useStore.getState().cityData!;
    expect(worldTargetForFinding(cityData, "file:does/not/exist.ts", 1)).toBeNull();
    expect(worldTargetForFinding(cityData, OPEN.id, 9999)).toBeNull();
  });
});

describe("the cone that decides 'already in the picture'", () => {
  const at = (x: number, z: number): WorldTarget => ({ x, y: 1, z });
  const cam = (angle: number) => ({ x: 0, z: 0, angle });

  /**
   * Die Erwartung kommt NICHT aus dem Kopf, sondern aus der drei.js-Geometrie:
   * Blickrichtung f = (sin h, 0, cos h), rechts = cross(f, up) = (-f.z, 0, f.x).
   * Eine Kamera, die auf +Z schaut, hat damit -X als Bildrand rechts. Wer diese
   * Rechnung in der Implementation verbiegt, sieht hier rot — nicht weil eine
   * Meinung sich ändert, sondern weil Vektoren es tun.
   */
  function expectedSide(target: WorldTarget, heading: number): "left" | "right" | "ahead" {
    const f = { x: Math.sin(heading), z: Math.cos(heading) };
    const right = { x: -f.z, z: f.x };
    const d = { x: target.x, z: target.z };
    const along = d.x * f.x + d.z * f.z;
    const across = d.x * right.x + d.z * right.z;
    // Nur seitliche Ziele (jenseits 45 Grad) sind fuer jede Fensteroeffnung
    // garantiert aus dem Kegel heraus. Alles andere ist eine Kegel-Frage und
    // steht in den eigenen Stille-Faellen.
    if (Math.abs(across) <= Math.abs(along)) return "ahead";
    return across > 0 ? "right" : "left";
  }

  /**
   * Jeder Seit-Fall wird gegen die Vektorrechnung geprueft, aber nur fuer Ziele,
   * die nach derselben Rechnung ueberhaupt seitlich liegen. Ein Ziel geradeaus
   * darf das Signal nicht zeigen - dafuer steht der Stille-Fall.
   */
  function sidesAgreeWithVectors(
    targets: readonly (readonly [number, number])[],
    heading: number,
    mode: "free" | "orbit",
  ) {
    for (const [x, z] of targets) {
      const t = at(x, z);
      const signal = edgeSignalForWaypoint(t, cam(0), mode, 1.6);
      const vector = expectedSide(t, heading);
      if (vector === "ahead") {
        expect(
          signal,
          `Ziel (${x}, ${z}) liegt vor dem Blick — das Signal hat nichts zu zeigen`,
        ).toBeNull();
      } else {
        expect(signal?.side, `Ziel (${x}, ${z}) liegt ${vector}`).toBe(vector);
      }
    }
  }

  it("stays silent for a target the camera already faces", () => {
    expect(edgeSignalForWaypoint(at(0, 50), cam(0), "free", 1.6)).toBeNull();
    expect(edgeSignalForWaypoint(at(10, 50), cam(0), "free", 1.6)).toBeNull();
  });

  it("names left and right by the camera's own turn, and the straight line", () => {
    sidesAgreeWithVectors(
      [
        [-50, 0],
        [50, 0],
        [50, -35],
        [-60, 20],
      ],
      0,
      "free",
    );
    expect(edgeSignalForWaypoint(at(-50, 0), cam(0), "free", 1.6)?.distance).toBeCloseTo(50, 6);
    expect(
      edgeSignalForWaypoint(at(0, -50), cam(0), "free", 1.6)?.distance,
      "Luftlinie, nicht Pfadlaenge",
    ).toBeCloseTo(50, 6);
  });

  it("calls a target behind the reader behind, not sideways", () => {
    const signal = edgeSignalForWaypoint(at(0, -50), cam(0), "free", 1.6);
    expect(signal?.side, "hinten ist nicht links und nicht rechts").toBe("behind");
    expect(edgeSignalForWaypoint(at(-30, -50), cam(0), "free", 1.6)?.side).toBe("behind");
  });

  it("knows an orbit camera looks at its pivot, not away from it", () => {
    // Im Orbit ist `angle` die Richtung vom Drehpunkt ZUR Kamera, der Betrachter
    // schaut also angle + π. Genau das muss das Signal benutzen.
    sidesAgreeWithVectors(
      [
        [-50, 0],
        [50, 0],
        [0, -50],
        [35, 35],
      ],
      Math.PI,
      "orbit",
    );
    // Die Seite kehrt sich gegenueber der freien Kamera um, weil der Blick sich
    // um 180 Grad dreht - die Probe, dass die Implementation diesen Unterschied
    // wirklich zieht und nicht nur den Winkel weiterreicht.
    expect(edgeSignalForWaypoint(at(-50, 0), cam(0), "orbit", 1.6)?.side).toBe(
      edgeSignalForWaypoint(at(50, 0), cam(0), "free", 1.6)?.side,
    );
  });

  it("widens the quiet cone with the window and never invents one", () => {
    const target = at(50, 30);
    expect(edgeSignalForWaypoint(target, cam(0), "free", 4), "sehr breites Fenster").toBeNull();
    const narrow = edgeSignalForWaypoint(target, cam(0), "free", 0.5);
    expect(narrow?.side, "schmales Fenster: das Ziel liegt seitlich").toBe(expectedSide(target, 0));
    expect(
      edgeSignalForWaypoint(at(0, 0), cam(0), "free", 1.6),
      "kein Ziel auf der Kamera",
    ).toBeNull();
  });
});

describe("the pill in the HUD", () => {
  const pill = () => host.querySelector<HTMLButtonElement>("[data-waypoint-edge]");

  it("points at the next open finding with a word, an aria name and no colour alone", () => {
    setState({ reviews: { [`${OPEN.id}#0`]: "reviewed" } });
    setState({ cameraInfo: { x: 0, z: 0, angle: 0, dist: 80 } });
    renderHud();
    const edge = pill();
    expect(
      edge,
      "das Ziel liegt seitlich hinter dem Kegel, also muss das Signal stehen",
    ).toBeTruthy();
    expect(edge!.dataset.waypointEdge).toBe("left");
    expect(edge!.textContent).toContain("left");
    expect(edge!.getAttribute("aria-label")).toContain("Next open finding left");
    expect(edge!.getAttribute("title")).toContain("without a verdict");
  });

  it("translates the same sign into German", () => {
    setState({ reviews: { [`${OPEN.id}#0`]: "reviewed" } });
    setLang("de");
    renderHud();
    expect(pill()?.textContent).toContain("links");
    expect(pill()?.getAttribute("aria-label")).toContain("Nächster offener Fund links");
  });

  it("says nothing while the target faces the reader", () => {
    setState({ reviews: { [`${OPEN.id}#0`]: "reviewed" } });
    const target = worldTargetForFinding(useStore.getState().cityData!, DECIDED.id, 7)!;
    setState({ cameraInfo: { x: 0, z: 0, angle: Math.atan2(target.x, target.z), dist: 80 } });
    renderHud();
    expect(pill(), "ein Ziel im Blickfeld braucht keinen Wegweiser").toBeNull();
  });

  it("gives way to the crane and to the tour — one navigator at a time", () => {
    setState({ reviews: { [`${OPEN.id}#0`]: "reviewed" } });
    setState({ buildPhase: "constructing" });
    renderHud();
    expect(pill(), "der Kran fliegt schon").toBeNull();
    setState({ buildPhase: "built", tourActive: true });
    renderHud();
    expect(pill(), "der Tour-Pilot fliegt schon").toBeNull();
  });

  it("disappears when every finding has a verdict", () => {
    setState({ reviews: { [`${OPEN.id}#0`]: "reviewed", [`${DECIDED.id}#0`]: "false-positive" } });
    renderHud();
    expect(pill(), "keine offene Entscheidung, kein Wegweiser").toBeNull();
  });

  it("flies the dock's own step when pressed, not a second flight", () => {
    setState({ reviews: { [`${OPEN.id}#0`]: "reviewed" } });
    renderHud();
    const before = useStore.getState().focusedFindingKey;
    act(() => pill()!.click());
    expect(useStore.getState().focusedFindingKey, "der Druck ist der Dock-Schritt").not.toBe(
      before,
    );
    expect(useStore.getState().flyRequest, "und fliegt mit derselben Quelle").toBeTruthy();
  });
});

describe("the counter-proof", () => {
  it("reads the camera's number, and would notice if it moved", () => {
    expect(fovLiteral(), "die Kamera steht bei 52 Grad").toBe(52);
    expect(CAMERA_FOV_DEG, "und der Kegel testet genau diese 52").toBe(52);
    // Gegenprobe ohne Eingriff in die App: dieselbe Lesestelle an einem
    // verbogenen Quelltext. Waere die Abfrage blind, waere dieser Fall gruen.
    const bent = APP_SOURCE.replace(/fov:\s*52/, "fov: 51");
    expect(/fov:\s*(\d+)/.exec(bent)?.[1], "die Sonde sieht eine verschobene Zahl").toBe("51");
    expect(Number(/fov:\s*(\d+)/.exec(bent)?.[1]) === CAMERA_FOV_DEG).toBe(false);
  });
});
