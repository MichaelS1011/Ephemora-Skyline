import type { Lang } from "../i18n";

/**
 * The words the postcard panel and its missions use.
 *
 * Kept out of `DICT` for the same reason `startCopy.ts` and `learningCopy.ts`
 * keep their bridge text: this lane owns the strings it adds, and both
 * languages sit in one file next to the rule that chooses them. A mission
 * carries keys and measured values; nothing in the pure challenge module knows
 * German or English.
 */
const COPY = {
  "section.title": { en: "Postcard Challenges", de: "Postkarten-Aufträge" },
  "section.intro": {
    en: "Local photo missions from this scan. Fly to a target, then create an image with the PNG export above. Nothing is uploaded and no score is kept.",
    de: "Lokale Foto-Aufträge aus diesem Scan. Fliege zum Ziel und erstelle dann oben ein Bild mit dem PNG-Export. Nichts wird hochgeladen, und es gibt keine Punkte.",
  },
  "section.empty": {
    en: "This scan does not support a postcard mission.",
    de: "Dieser Scan unterstützt keinen Postkarten-Auftrag.",
  },
  "section.noScan": {
    en: "Completion marks need a scan id. This city has none, so a capture is shown but not saved.",
    de: "Aufnahme-Marken brauchen eine Scan-ID. Diese Stadt hat keine, deshalb wird eine Aufnahme angezeigt, aber nicht gespeichert.",
  },
  "section.unreadable": {
    en: "Saved completion marks could not be read. They are kept untouched on this machine; new marks are stored separately.",
    de: "Gespeicherte Aufnahme-Marken konnten nicht gelesen werden. Sie bleiben auf diesem Rechner unangetastet; neue Marken werden getrennt gespeichert.",
  },
  "section.count": {
    en: "{done} of {total} captured",
    de: "{done} von {total} aufgenommen",
  },
  "section.clear": { en: "Forget completion marks", de: "Aufnahme-Marken vergessen" },
  "action.fly": { en: "Fly to target", de: "Zum Ziel fliegen" },
  "action.flyAria": { en: "Fly to {path}", de: "Zum Ziel {path} fliegen" },
  "state.captured": { en: "Captured", de: "Aufgenommen" },
  "state.pending": { en: "Not captured yet", de: "Noch nicht aufgenommen" },
  "state.selected": {
    en: "Selected — create the image now to mark it captured.",
    de: "Ausgewählt — erstelle jetzt das Bild, um es als aufgenommen zu markieren.",
  },
  "target.label": { en: "Target", de: "Ziel" },
  "unshielded.title": {
    en: "The tallest unchecked tower",
    de: "Der höchste ungeprüfte Turm",
  },
  "unshielded.reasonUnverified": {
    en: "At {loc} lines it is the tallest building no enabled scanner checked ({engines}).",
    de: "Mit {loc} Zeilen ist es das höchste Gebäude, das kein aktiver Scanner geprüft hat ({engines}).",
  },
  "unshielded.reasonCoverage": {
    en: "At {loc} lines it is the tallest building with only {pct}% line coverage.",
    de: "Mit {loc} Zeilen ist es das höchste Gebäude mit nur {pct}% Zeilenabdeckung.",
  },
  "unshielded.action": {
    en: "Fly to the tower and photograph what nobody checked.",
    de: "Fliege zum Turm und fotografiere, was niemand geprüft hat.",
  },
  "cycle.title": { en: "A building in a loop", de: "Ein Gebäude im Kreis" },
  "cycle.reason": {
    en: "This file sits in a circular import chain, so a change can travel back to it.",
    de: "Diese Datei liegt in einer zyklischen Importkette; eine Änderung kann zu ihr zurücklaufen.",
  },
  "cycle.action": {
    en: "Fly to the building and photograph the loop.",
    de: "Fliege zum Gebäude und fotografiere den Kreis.",
  },
  "blast.title": { en: "The most-imported building", de: "Das meistimportierte Gebäude" },
  "blast.reasonOne": {
    en: "1 file imports this one, so its blast radius is the widest in this city.",
    de: "1 Datei importiert dieses; sein Wirkungsradius ist der größte in dieser Stadt.",
  },
  "blast.reasonMany": {
    en: "{n} files import this one, so its blast radius is the widest in this city.",
    de: "{n} Dateien importieren dieses; sein Wirkungsradius ist der größte in dieser Stadt.",
  },
  "blast.action": {
    en: "Fly to the hub and photograph the building everyone depends on.",
    de: "Fliege zum Knoten und fotografiere das Gebäude, von dem alle abhängen.",
  },
  "coverage.title": { en: "An old or untested building", de: "Ein altes oder ungeprüftes Gebäude" },
  "coverage.reasonCoverage": {
    en: "Only {pct}% of this file is covered by the scan's coverage report.",
    de: "Nur {pct}% dieser Datei sind vom Abdeckungsbericht des Scans erfasst.",
  },
  "coverage.reasonAge": {
    en: "This file had not changed for {days} days when the scan ran.",
    de: "Diese Datei war beim Scan seit {days} Tagen unverändert.",
  },
  "coverage.action": {
    en: "Fly to the building and photograph the untested ground.",
    de: "Fliege zum Gebäude und fotografiere den ungetesteten Grund.",
  },
  "clone.title": { en: "A duplicated twin", de: "Ein doppeltes Geschwister" },
  "clone.reason": {
    en: "It shares {lines} duplicated lines with {path}.",
    de: "Es teilt {lines} doppelte Zeilen mit {path}.",
  },
  "clone.action": {
    en: "Fly to one of the twins and photograph the duplication.",
    de: "Fliege zu einem der Geschwister und fotografiere die Doppelung.",
  },
  "district.title": { en: "The largest district", de: "Der größte Bezirk" },
  "district.reason": {
    en: "{district} is the largest district ({loc} lines); its tallest building is {file}.",
    de: "{district} ist der größte Bezirk ({loc} Zeilen); sein höchstes Gebäude ist {file}.",
  },
  "district.action": {
    en: "Fly to the district's tallest building and photograph the largest district.",
    de: "Fliege zum höchsten Gebäude des Bezirks und fotografiere den größten Bezirk.",
  },
} as const;

export type PostcardCopyKey = keyof typeof COPY;

export interface PostcardText {
  key: PostcardCopyKey;
  vars?: Record<string, string | number>;
}

/** Render one mission phrase in the language the studio is speaking. */
export function postcardText(lang: Lang, text: PostcardText): string {
  const source: string = COPY[text.key][lang];
  if (!text.vars) return source;
  return Object.entries(text.vars).reduce(
    (out, [name, value]) => out.split(`{${name}}`).join(String(value)),
    source,
  );
}
