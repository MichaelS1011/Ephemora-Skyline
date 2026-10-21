/**
 * Local fallback copy while share strings are consolidated in i18n.ts.
 * `tx` prefers DICT and uses this table only for keys that have not moved.
 *
 * Voice: friendly, plain, a little dry, honest about wanting to be seen. No
 * guilt, no countdown, no "one last click", nothing pre-ticked, and a refusal
 * is never asked a second time.
 */

import { DICT, t, type DictKey, type Lang } from "../i18n";

export type ShareKey =
  | "menu.item"
  | "studio.title"
  | "studio.intro"
  | "studio.media"
  | "studio.image"
  | "studio.video"
  | "studio.close"
  | "studio.format"
  | "studio.length"
  | "length.build"
  | "length.buildWaiting"
  | "length.15"
  | "length.30"
  | "length.manual"
  | "studio.quality"
  | "quality.resolution"
  | "quality.fps"
  | "quality.bitrate"
  | "quality.codec"
  | "studio.names"
  | "studio.namesDisclosure"
  | "studio.namesFileNote"
  | "studio.credit"
  | "studio.record"
  | "studio.stop"
  | "studio.preparing"
  | "studio.finalizing"
  | "studio.elapsed"
  | "studio.written"
  | "studio.errorNoCanvas"
  | "studio.errorNoRecorder"
  | "studio.errorEmpty"
  | "studio.errorSkew"
  | "studio.unsupported"
  | "card.title"
  | "card.sub"
  | "card.facts"
  | "card.size"
  | "card.duration"
  | "card.resolution"
  | "card.fps"
  | "card.fpsSet"
  | "card.crop"
  | "card.codec"
  | "card.fileName"
  | "card.frames"
  | "card.download"
  | "card.share"
  | "card.shareFileOnly"
  | "card.shareFailed"
  | "card.privacy"
  | "card.namesOff"
  | "card.namesOn"
  | "card.again"
  | "hint.text"
  | "hint.action"
  | "hint.dismiss"
  | "hint.aria"
  | "image.create"
  | "image.preparing"
  | "image.ready"
  | "image.preview"
  | "image.alt"
  | "image.crop"
  | "image.download"
  | "image.share"
  | "image.shareFileOnly"
  | "image.again"
  | "image.error";

const COPY: Record<ShareKey, { en: string; de: string }> = {
  "menu.item": { en: "City image or video", de: "Stadtbild oder -video" },
  "studio.title": { en: "Share your city", de: "Deine Stadt teilen" },
  "studio.intro": {
    en: "Create a picture or film the city as it rises. Preview first; nothing leaves this machine unless you share it.",
    de: "Erstelle ein Bild oder filme den Bau der Stadt. Prüfe erst die Vorschau; nichts verlässt diesen Rechner, bis du es teilst.",
  },
  "studio.media": { en: "What to make", de: "Was möchtest du erstellen?" },
  "studio.image": { en: "Image", de: "Bild" },
  "studio.video": { en: "Video", de: "Video" },
  "studio.close": { en: "Close", de: "Schließen" },
  "studio.format": { en: "Format", de: "Format" },
  "studio.length": { en: "Length", de: "Länge" },
  "length.build": {
    en: "The build, start to finish",
    de: "Die Bau-Animation, einmal durch",
  },
  "length.buildWaiting": {
    en: "Replays the construction and stops when the city is complete.",
    de: "Spielt den Stadtbau erneut ab und stoppt, sobald die Stadt fertig ist.",
  },
  "length.15": { en: "15 s", de: "15 s" },
  "length.30": { en: "30 s", de: "30 s" },
  "length.manual": { en: "I stop it", de: "Eigener Stopp" },
  "studio.quality": { en: "Quality", de: "Qualität" },
  "quality.resolution": { en: "Picture", de: "Bild" },
  "quality.fps": { en: "Frames", de: "Bilder" },
  "quality.bitrate": { en: "Bitrate set to", de: "Bitrate eingestellt" },
  "quality.codec": { en: "Codec", de: "Codec" },
  "studio.names": { en: "Show names", de: "Namen zeigen" },
  "studio.namesDisclosure": {
    en: "This puts your project name and district names into the file itself. Leave it off to show the city without those names.",
    de: "Das schreibt den Projektnamen und Bezirksnamen direkt in die Datei. Ohne Häkchen zeigt sie die Stadt ohne diese Namen.",
  },
  "studio.namesFileNote": {
    en: "The saved file has a generic name unless you enable names. No folder path is included.",
    de: "Die Datei bekommt einen neutralen Namen, solange du Namen nicht aktivierst. Ordnerpfade bleiben draußen.",
  },
  "studio.credit": {
    en: "Include a small Ephemora credit (optional)",
    de: "Kleinen Ephemora-Hinweis einblenden (optional)",
  },
  "studio.record": { en: "Record", de: "Aufnehmen" },
  "studio.stop": { en: "Stop", de: "Stopp" },
  "studio.preparing": { en: "Framing the shot", de: "Bild wird gerahmt" },
  "studio.finalizing": { en: "Closing the encoder", de: "Encoder wird geschlossen" },
  "studio.elapsed": { en: "{s} s", de: "{s} s" },
  "studio.written": { en: "{bytes} bytes so far", de: "{bytes} Bytes bisher" },
  "studio.errorNoCanvas": {
    en: "No 3D canvas on screen. A city has to be standing before it can be filmed.",
    de: "Kein 3D-Canvas auf dem Bildschirm. Eine Stadt muss erst dastehen, bevor sie gefilmt werden kann.",
  },
  "studio.errorNoRecorder": {
    en: "This browser has no MediaRecorder, so the city cannot be filmed here.",
    de: "Dieser Browser hat keinen MediaRecorder. Die Stadt lässt sich hier nicht filmen.",
  },
  "studio.errorEmpty": {
    en: "The recorder wrote 0 bytes. Nothing was saved.",
    de: "Der Encoder hat 0 Bytes geschrieben. Es wurde nichts gespeichert.",
  },
  "studio.errorSkew": {
    en: "The shot came out out of proportion ({skew}). Recording stopped, nothing was saved.",
    de: "Das Bild lief unverhältnismäßig aus der Form ({skew}). Aufnahme gestoppt, nichts gespeichert.",
  },
  "studio.unsupported": { en: "not available", de: "nicht verfügbar" },
  "card.title": { en: "Done. The city is a file.", de: "Fertig. Die Stadt ist eine Datei." },
  "card.sub": {
    en: "Measured while recording, not estimated afterwards.",
    de: "Während der Aufnahme gemessen, nicht danach geschätzt.",
  },
  "card.facts": { en: "What the file is", de: "Was die Datei ist" },
  "card.size": { en: "Size", de: "Größe" },
  "card.duration": { en: "Duration", de: "Dauer" },
  "card.resolution": { en: "Resolution", de: "Auflösung" },
  "card.fps": { en: "Frame rate", de: "Bildrate" },
  // A setting, not a measurement: what the file was asked to carry. The count
  // of frames that were actually composited is the measured row below it.
  "card.fpsSet": { en: "Frame rate set to", de: "Bildrate eingestellt" },
  "card.crop": { en: "Picture cut to fit", de: "Bild für das Format beschnitten" },
  "card.codec": { en: "Codec", de: "Codec" },
  "card.fileName": { en: "File name", de: "Dateiname" },
  "card.frames": { en: "Frames composited", de: "Gerahmte Bilder" },
  "card.download": { en: "Save the video", de: "Video speichern" },
  "card.share": { en: "Share the video", de: "Video teilen" },
  "card.shareFileOnly": {
    en: "Sharing hands over the video file only — no caption, no link.",
    de: "Beim Teilen wird nur die Videodatei übergeben — kein Text, kein Link.",
  },
  "card.shareFailed": {
    en: "Sharing did not open. You can save the file instead.",
    de: "Teilen ließ sich nicht öffnen. Du kannst die Datei stattdessen speichern.",
  },
  "card.privacy": {
    en: "Nothing left this machine on the way here. It leaves only if you attach it somewhere.",
    de: "Nichts hat diese Maschine auf dem Weg hier verlassen. Es geht erst raus, wenn du es selbst anhängst.",
  },
  "card.namesOff": {
    en: "No project, folder or file names in the picture.",
    de: "Keine Projekt-, Ordner- oder Dateinamen im Bild.",
  },
  "card.namesOn": {
    en: "Names are burned into the picture: {names}.",
    de: "Namen stehen im Bild eingebrannt: {names}.",
  },
  "card.again": { en: "Record another take", de: "Noch einmal aufnehmen" },
  "hint.text": {
    en: "The city is finished. It films well.",
    de: "Die Stadt ist fertig gebaut. Sie lässt sich gut filmen.",
  },
  "hint.action": { en: "Record it", de: "Jetzt aufnehmen" },
  "hint.dismiss": { en: "Not now, and not again", de: "Nicht jetzt, und nie wieder" },
  "hint.aria": { en: "City video suggestion", de: "Vorschlag für ein Stadtvideo" },
  "image.create": { en: "Create image", de: "Bild erstellen" },
  "image.preparing": { en: "Framing image…", de: "Bild wird gerahmt…" },
  "image.ready": { en: "Your city image is ready", de: "Dein Stadtbild ist fertig" },
  "image.preview": {
    en: "This is the file you can save or share.",
    de: "Dieses Bild kannst du speichern oder teilen.",
  },
  "image.alt": { en: "Preview of the city image", de: "Vorschau des Stadtbilds" },
  "image.crop": {
    en: "About {n}% of the view was cropped for this format. Try another format if the city feels cut off.",
    de: "Für dieses Format wurden etwa {n}% der Ansicht abgeschnitten. Probiere ein anderes Format, falls die Stadt am Rand fehlt.",
  },
  "image.download": { en: "Save image", de: "Bild speichern" },
  "image.share": { en: "Share image", de: "Bild teilen" },
  "image.shareFileOnly": {
    en: "Sharing hands over the image file only — no caption, no link.",
    de: "Beim Teilen wird nur die Bilddatei übergeben — kein Text, kein Link.",
  },
  "image.again": { en: "Choose another view", de: "Andere Ansicht wählen" },
  "image.error": {
    en: "The image could not be created. Move the camera and try again.",
    de: "Das Bild konnte nicht erstellt werden. Bewege die Kamera und versuche es erneut.",
  },
};

export function tx(lang: Lang, key: ShareKey, vars?: Record<string, string | number>): string {
  // The dictionary wins as soon as it carries the name. `t()` falls back to
  // printing the key, so the local table is consulted whenever DICT has not
  // taken the key over yet.
  const inDict = Object.prototype.hasOwnProperty.call(DICT, key);
  const text = inDict ? t(lang, key as DictKey, vars) : localText(lang, key, vars);
  return inDict && (text === key || text === "") ? localText(lang, key, vars) : text;
}

function localText(lang: Lang, key: ShareKey, vars?: Record<string, string | number>): string {
  const entry = COPY[key];
  let text = entry ? entry[lang] : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
