// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  decodePose,
  encodePose,
  readVisitState,
  resolveVisit,
  writeCityParam,
  writeNavParams,
  writePoseParam,
  clearVisitParams,
  currentVisit,
  districtExists,
  pathOfSelectedFile,
  type CameraPose,
} from "../src/urlState";
import { useStore } from "../src/stores/useStore";
import {
  CITY_STORE_MAX,
  CITY_TTL_MS,
  cityAvailability,
  cityGoneForSure,
  hasCityVisit,
  recentCities,
  recordCityVisit,
} from "../src/recentCities";
import type { CityData, CityFile } from "../src/city/types";

/**
 * S8: the second visit continues the first one.
 *
 * Measured before this existed (a local measurement script that is not shipped D9,
 * `m10.log AFTER-RELOAD`): a reload of a city already on screen threw away the
 * district, the selection and the camera, and re-raised every building of the
 * construction cinematic. The three are the visit, so they live in the address,
 * and the cinematic is for a city this machine has never shown.
 */

const POSE: CameraPose = { x: 12.5, y: 8.25, z: -30.75, yaw: 1.2345, pitch: -0.4321 };

function file(id: string, path: string): CityFile {
  return {
    id,
    name: path.split("/").pop() ?? path,
    path,
    language: "TypeScript",
    linesOfCode: 40,
    cyclomaticComplexity: 2,
    threatLevel: "low",
    findings: [],
  };
}

const SRC = file("f-auth", "frontend/src/auth/session.ts");
const CFG = file("f-cfg", "backend/config/settings.ts");

function city(): CityData {
  return {
    repo: { owner: "local", name: "mein-repo", branch: "main" },
    analysisId: "visit-1",
    totalFiles: 2,
    renderedFiles: 2,
    totalLines: 80,
    findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
    languages: { TypeScript: 80 },
    tree: {
      name: "mein-repo",
      path: "",
      fileCount: 2,
      linesOfCode: 80,
      findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
      threatScore: 0,
      topFindings: [],
      children: [
        {
          name: "frontend",
          path: "frontend",
          fileCount: 1,
          linesOfCode: 40,
          findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
          threatScore: 0,
          topFindings: [],
          children: [
            {
              name: "src",
              path: "frontend/src",
              fileCount: 1,
              linesOfCode: 40,
              findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
              threatScore: 0,
              topFindings: [],
              children: [],
              detailFiles: [SRC],
              remainingFiles: 0,
              districtFiles: [SRC],
            },
          ],
          detailFiles: [],
          remainingFiles: 0,
          districtFiles: [],
        },
        {
          name: "backend",
          path: "backend",
          fileCount: 1,
          linesOfCode: 40,
          findingsBySeverity: { P0: 0, P1: 0, P2: 0 },
          threatScore: 0,
          topFindings: [],
          children: [],
          detailFiles: [CFG],
          remainingFiles: 0,
          districtFiles: [CFG],
        },
      ],
      detailFiles: [],
      remainingFiles: 0,
      districtFiles: [],
    },
    fileConnections: [],
    dirConnections: [],
    meta: {
      churn: false,
      deadCode: false,
      duplicates: false,
      cycles: false,
      coverage: false,
      blame: false,
    },
  } as unknown as CityData;
}

/** A browser at the empty world, the way a visit starts. */
function landingAt(path = "/"): void {
  window.history.replaceState(null, "", path);
}

function resetStore(data: CityData | null): void {
  useStore.setState({ ...useStore.getInitialState(), cityData: data }, true);
}

beforeEach(() => {
  localStorage.clear();
  landingAt("/");
  resetStore(null);
});

describe("the address of a visit", () => {
  it("round-trips a camera pose through the address", () => {
    const encoded = encodePose(POSE);
    expect(encoded).toBe("12.5,8.25,-30.75,1.235,-0.432");
    const back = decodePose(encoded);
    expect(back).not.toBeNull();
    expect(Math.abs(back!.yaw - POSE.yaw)).toBeLessThan(0.001);
    expect(back!.x).toBe(12.5);
    expect(back!.z).toBe(-30.75);
  });

  it("refuses to invent a pose out of a broken parameter", () => {
    expect(decodePose("1,2,3")).toBeNull();
    expect(decodePose("1,2,3,4,nonsense")).toBeNull();
    expect(decodePose(null)).toBeNull();
  });

  it("reads district, file and camera out of one address", () => {
    const visit = readVisitState(
      "?city=visit-1&district=frontend%2Fsrc&file=frontend%2Fsrc%2Fauth%2Fsession.ts&cam=1,2,3,0.5,-0.25",
    );
    expect(visit.cityId).toBe("visit-1");
    expect(visit.district).toEqual(["frontend", "src"]);
    expect(visit.filePath).toBe("frontend/src/auth/session.ts");
    expect(visit.pose).toEqual({ x: 1, y: 2, z: 3, yaw: 0.5, pitch: -0.25 });
  });

  it("writes the visit into the address and reads the same visit back", () => {
    landingAt("/?city=visit-1");
    writeNavParams(["frontend", "src"], "frontend/src/auth/session.ts");
    writePoseParam(POSE);
    const read = currentVisit();
    expect(read.district).toEqual(["frontend", "src"]);
    expect(read.filePath).toBe("frontend/src/auth/session.ts");
    expect(Math.abs(read.pose!.yaw - POSE.yaw)).toBeLessThan(0.001);
    expect(Math.abs(read.pose!.pitch - POSE.pitch)).toBeLessThan(0.001);
    // one address, three parameters: the city must survive the other writes
    expect(read.cityId).toBe("visit-1");
  });

  it("keeps the visit when the same city is named again, drops it for a new one", () => {
    landingAt("/?city=visit-1");
    writeNavParams(["frontend"], CFG.path);
    writeCityParam("visit-1");
    expect(currentVisit().filePath).toBe(CFG.path);
    writeCityParam("visit-2");
    expect(currentVisit().filePath).toBeNull();
    expect(currentVisit().district).toEqual([]);
  });

  it("clears the whole visit, optionally leaving the old address behind", () => {
    landingAt("/?city=visit-1&district=backend");
    clearVisitParams(true);
    expect(window.location.search).toBe("");
    expect(currentVisit().cityId).toBeNull();
  });
});

describe("resolving an address against the payload that arrived", () => {
  it("names the district and the file the address points at", () => {
    const hit = resolveVisit(city(), {
      cityId: "visit-1",
      district: ["frontend"],
      filePath: SRC.path,
      pose: null,
    });
    expect(hit.file?.id).toBe("f-auth");
    expect(hit.chain).toEqual(["frontend", "src"]);
  });

  it("drops a file the scan does not carry instead of guessing", () => {
    const hit = resolveVisit(city(), {
      cityId: "visit-1",
      district: ["backend"],
      filePath: "frontend/src/deleted/gone.ts",
      pose: null,
    });
    expect(hit.file).toBeNull();
    // the district the address names without the file is still a real place
    expect(hit.chain).toEqual(["backend"]);
  });

  it("falls back to the city root when the district chain is stale", () => {
    expect(districtExists(city(), ["frontend", "src"])).toBe(true);
    expect(districtExists(city(), ["frontend", "weg"])).toBe(false);
    const hit = resolveVisit(city(), {
      cityId: "x",
      district: ["frontend", "weg"],
      filePath: null,
      pose: null,
    });
    expect(hit.chain).toEqual([]);
  });

  it("answers a selected id with the path that belongs in the address", () => {
    expect(pathOfSelectedFile(city(), "f-cfg")).toBe("backend/config/settings.ts");
    expect(pathOfSelectedFile(city(), "nichts")).toBeNull();
    expect(pathOfSelectedFile(city(), null)).toBeNull();
  });
});

describe("the second visit continues the first", () => {
  it("holds the cinematic for a city this machine has never shown", () => {
    const data = city();
    landingAt("/?city=visit-1");
    resetStore(null);
    useStore.getState().setCityData(data);
    // first sight: the cinematic plays, and the visit is neutral
    expect(useStore.getState().buildPhase).toBe("constructing");
    expect(useStore.getState().focusPath).toEqual([]);
    expect(hasCityVisit("visit-1")).toBe(true);

    // a district and a selection the pilot actually made, through the store's
    // own actions — the same ones the click handlers call
    // echte Navigation: in den Bezirk hinein, dann das Gebäude anklicken
    useStore.getState().drillIn("frontend");
    useStore.getState().drillIn("src");
    useStore.getState().selectBuilding(SRC.id);
    writePoseParam(POSE);
    const address = window.location.search;

    // RELOAD: the address is what survives, the store starts from nothing
    resetStore(null);
    landingAt(address);
    useStore.getState().setCityData(data);

    expect(useStore.getState().buildPhase).toBe("built");
    expect(useStore.getState().focusPath).toEqual(["frontend", "src"]);
    expect(useStore.getState().selectedUnit).toEqual({ kind: "file", id: SRC.id });
    expect(useStore.getState().poseRequest?.pose).toEqual(expect.objectContaining({ x: POSE.x }));
    expect(Math.abs(useStore.getState().poseRequest!.pose.yaw - POSE.yaw)).toBeLessThan(0.001);
    // the address keeps naming the same visit after the reload
    expect(currentVisit().filePath).toBe(SRC.path);
  });

  it("writes the address as the pilot moves, without a history entry per district", () => {
    const data = city();
    landingAt("/?city=visit-1");
    resetStore(null);
    useStore.getState().setCityData(data);
    useStore.getState().drillIn("backend");
    expect(new URLSearchParams(window.location.search).get("district")).toBe("backend");
    useStore.getState().drillOut();
    expect(new URLSearchParams(window.location.search).get("district")).toBeNull();
    useStore.getState().selectBuilding(CFG.id);
    expect(new URLSearchParams(window.location.search).get("file")).toBe(CFG.path);
  });

  it("flies to a file the address names without a camera", () => {
    landingAt("/?city=visit-1&district=backend&file=backend/config/settings.ts");
    resetStore(null);
    useStore.getState().setCityData(city());
    expect(useStore.getState().selectedUnit).toEqual({ kind: "file", id: CFG.id });
    expect(useStore.getState().poseRequest).toBeNull();
    // the sanctioned flight is how a named file reaches the screen
    expect(useStore.getState().flyRequest).not.toBeNull();
    expect(useStore.getState().flyRequest?.nonce).toBeGreaterThan(0);
  });

  it("does not fly when the address already says where the camera stood", () => {
    landingAt("/?city=visit-1");
    writePoseParam(POSE);
    writeNavParams(["frontend"], SRC.path);
    const address = window.location.search;
    resetStore(null);
    landingAt(address);
    useStore.getState().setCityData(city());
    const asked = useStore.getState().poseRequest?.pose;
    expect(asked).not.toBeNull();
    // the address carries 3 decimals — a millimetre and a six-thousandth of a radian
    expect([asked!.x, asked!.y, asked!.z]).toEqual([POSE.x, POSE.y, POSE.z]);
    expect(Math.abs(asked!.yaw - POSE.yaw)).toBeLessThan(0.001);
    expect(Math.abs(asked!.pitch - POSE.pitch)).toBeLessThan(0.001);
    expect(useStore.getState().flyRequest).toBeNull();
  });

  it("keeps a new city neutral instead of carrying the last visit into it", () => {
    landingAt("/?city=visit-1&district=backend&file=backend/config/settings.ts&cam=1,2,3,0.1,0.2");
    resetStore(null);
    const other = city();
    other.analysisId = "visit-2";
    useStore.getState().setCityData(other);
    expect(useStore.getState().focusPath).toEqual([]);
    expect(useStore.getState().selectedUnit).toBeNull();
    expect(useStore.getState().poseRequest).toBeNull();
    expect(new URLSearchParams(window.location.search).get("district")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("file")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("cam")).toBeNull();
  });
});

describe("the index of cities this machine has opened", () => {
  it("records what was opened, newest first, and nothing more than the server keeps", () => {
    const data = city();
    recordCityVisit(data);
    const later = city();
    later.analysisId = "visit-2";
    later.repo.name = "anderes-repo";
    later.totalFiles = 900;
    later.findingsBySeverity = { P0: 1, P1: 1, P2: 0 };
    recordCityVisit(later);

    const list = recentCities();
    expect(list.map((e) => e.id)).toEqual(["visit-2", "visit-1"]);
    expect(list[0]).toMatchObject({ folder: "anderes-repo", files: 900, findings: 2 });
    expect(list[0]!.folder).toBe("anderes-repo");

    for (let i = 0; i < CITY_STORE_MAX + 5; i++) {
      const extra = city();
      extra.analysisId = `visit-${i}`;
      recordCityVisit(extra);
    }
    expect(recentCities().length).toBe(CITY_STORE_MAX);
  });

  it("opens a city again by moving it to the front, the way the server touches a read", () => {
    const data = city();
    recordCityVisit(data);
    const other = city();
    other.analysisId = "visit-2";
    recordCityVisit(other);
    recordCityVisit(data);
    expect(recentCities()[0]?.id).toBe("visit-1");
    expect(recentCities().filter((e) => e.id === "visit-1").length).toBe(1);
  });

  it("claims a city is gone only when its own clock says so", () => {
    const fresh = { id: "x", folder: "repo", openedAt: Date.now(), findings: 0, files: 1 };
    expect(cityGoneForSure(fresh)).toBe(false);
    expect(cityAvailability(fresh)).toBe("unknown");

    const stale = { ...fresh, openedAt: Date.now() - CITY_TTL_MS - 1000 };
    expect(cityGoneForSure(stale)).toBe(true);
    expect(cityAvailability(stale)).toBe("certain");
  });

  it("survives a storage that is not there without inventing a city", () => {
    expect(hasCityVisit(null)).toBe(false);
    expect(hasCityVisit("niemals-geoeffnet")).toBe(false);
    expect(recentCities()).toEqual([]);
    recordCityVisit(null);
    expect(recentCities()).toEqual([]);
  });
});
