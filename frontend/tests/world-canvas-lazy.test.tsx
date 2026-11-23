/**
 * Guard für die faule 3D-Grenze (Batch 2, Startbildschirm-Leichtbau).
 *
 * Die Stadt (three.js + @react-three/*) und die Vitrine dürfen den
 * Startbildschirm nichts kosten: App.tsx und Landing.tsx laden
 * WorldCanvas/EphePreview ausschließlich über `lazy(() => import(...))`,
 * ShareStudio und TeachBoardsReading holen ihre 3D-nahen Module per
 * dynamischem import(). Der Tracer (Node-Importwanderung ab main.tsx) und
 * die Modulvorladeliste von dist/index.html wurden im Build verifiziert —
 * dieser Test fixiert die QUELLTEXT-Seite davon, damit ein späteres
 * `import { Canvas } from "@react-three/fiber"` in App.tsx sofort rot wird.
 *
 * Der dist/index.html-Teil ist der Grund, warum die vite.config-Gruppen
 * `entriesAware: true` tragen: ohne diese Option hoistet Rolldown die
 * geteilten 3D-Chunks in die Modulvorladeliste der Entry — jedes Start-
 * bild lädt dann ~267 KB gzip three.js + r3f, obwohl es sie nie importiert.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string): string => readFileSync(resolve(process.cwd(), rel), "utf8");

/** Statische Imports erkennen, aber NICHT `import type` und keine
 *  dynamischen `import(...)`-Aufrufe und keine Kommentare (Zeilenanker). */
const STATIC_3D_IMPORT =
  /(?:^|\n)\s*import(?! type)[^;]*?from\s*["'](?:@react-three|three|postprocessing)/;

describe("die 3D-Grenze des Startbildschirms", () => {
  it("App.tsx importiert kein 3D und öffnet Stadt wie Vitrine nur lazy", () => {
    const src = read("src/App.tsx");
    expect(
      STATIC_3D_IMPORT.test(src),
      "App.tsx darf die 3D-Pakete nicht statisch importieren",
    ).toBe(false);
    expect(
      /(?:^|\n)\s*import(?! type)[^;]*?from\s*["']\.\/components\/(?:WorldCanvas|CityScene)["']/.test(
        src,
      ),
      "WorldCanvas/CityScene dürfen in App.tsx nur als dynamische import() auftauchen",
    ).toBe(false);
    expect(src, "WorldCanvas muss über lazy(() => import(...)) geöffnet werden").toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\/components\/WorldCanvas["']\s*\)/,
    );
    expect(src, "EphePreview muss über lazy(() => import(...)) geöffnet werden").toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\/components\/EphePreview["']/,
    );
  });

  it("Landing.tsx hält die Vitrine hinter einem Klick lazy", () => {
    const src = read("src/components/Landing.tsx");
    expect(
      STATIC_3D_IMPORT.test(src),
      "Landing.tsx darf die 3D-Pakete nicht statisch importieren",
    ).toBe(false);
    expect(src, "EphePreview muss in Landing lazy geladen werden").toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\/EphePreview["']/,
    );
  });

  it("WorldCanvas.tsx ist alleiniger Besitzer der 3D-Pakete der Stadt", () => {
    const src = read("src/components/WorldCanvas.tsx");
    expect(
      src,
      "WorldCanvas muss @react-three/fiber importieren (sonst liegt 3D woanders)",
    ).toMatch(/from\s*["']@react-three\/fiber["']/);
    expect(src, "und three direkt").toMatch(/from\s*["']three["']/);
    expect(src, "die Kamera literalisiert 52 Grad (Sonde in waypoint.test)").toMatch(/fov:\s*52/);
  });

  it("ShareStudio holt Heldenaufnahme und Oberfläche dynamisch", () => {
    const src = read("src/components/ShareStudio.tsx");
    expect(
      STATIC_3D_IMPORT.test(src),
      "ShareStudio darf die 3D-Pakete nicht statisch importieren",
    ).toBe(false);
    expect(src).toMatch(/import\(\s*["']\.\.\/share\/heroShot["']\s*\)/);
    expect(src).toMatch(/import\(\s*["']\.\.\/city\/worldSurface["']\s*\)/);
  });

  it("TeachBoardsReading holt die Tafeltexte dynamisch und typen nur als Typ", () => {
    const src = read("src/components/TeachBoardsReading.tsx");
    expect(
      /(?:^|\n)\s*import(?! type)[^;]*?from\s*["']\.\.\/city\/teachBoards["']/.test(src),
      "teachBoards darf nur als dynamisches import() auftauchen",
    ).toBe(false);
    expect(src).toMatch(/import\(\s*["']\.\.\/city\/teachBoards["']\s*\)/);
    expect(src, "BoardCopy darf nur als import type kommen").toMatch(
      /import\s+type\s*\{[^}]*\bBoardCopy\b[^}]*\}\s*from\s*["']\.\.\/city\/teachBoards["']/,
    );
  });
});

describe("die Bänderung hält das 3D von der Entry fern", () => {
  const config = read("vite.config.ts");

  it("three-core- und r3f-Gruppe laufen entriesAware (kein Hoist in den Startbildschirm)", () => {
    // `[^}]*`, nicht `[^\n]*`: prettier läuft auf jedem Commit und bricht eine
    // Gruppen-Zeile um, sobald sie zu lang wird — eine Guard, die an der
    // Zeilenlage hängt, wird dann rot, obwohl die Gruppe stimmt. Der Bereich
    // endet am schließenden `}` des Objekts, also bleibt er bei der Gruppe.
    expect(
      config,
      "three-core braucht entriesAware, sonst modulepreloaded es der Startbildschirm",
    ).toMatch(/name:\s*"three-core"[^}]*entriesAware:\s*true/);
    expect(config, "r3f braucht entriesAware aus demselben Grund").toMatch(
      /name:\s*"r3f"[^}]*entriesAware:\s*true/,
    );
    expect(
      config,
      "zustand braucht eine eigene Hoch-Prioritäts-Gruppe, sonst frisst die r3f-Gruppe es rekursiv",
    ).toMatch(/name:\s*"state-vendor"[\s\S]{0,200}priority:\s*10/);
  });

  it("dist/index.html (falls gebaut) modulepreloaded kein 3D", () => {
    const htmlPath = resolve(process.cwd(), "dist/index.html");
    if (!existsSync(htmlPath)) {
      // Der Build-Artefakt-Check ist ein Bonus: `npm run test` vor `npm run build`
      // hat keine dist/ — die Quellen und die vite.config oben sind der Pflichtteil.
      return;
    }
    const html = readFileSync(htmlPath, "utf8");
    expect(html, "der Startbildschirm darf three-core nicht modulepreloaded").not.toMatch(
      /modulepreload[^>]*three-core/,
    );
    expect(html, "der Startbildschirm darf r3f nicht modulepreloaded").not.toMatch(
      /modulepreload[^>]*["']\/?assets\/r3f/,
    );
  });
});
