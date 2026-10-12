/**
 * Shared colour measurement for the guards that pin the city's palette.
 *
 * This is the block `worldPicture.test.ts` carried inline since the palette was
 * built. It moved here unchanged so the alarm-band guard (`farbband-*.test.ts`)
 * can measure the same way instead of writing a second copy of CIEDE2000 —
 * two copies of a colour formula drift apart silently, and a drift here would
 * read as "the palette is safe" while the numbers say otherwise.
 *
 * sRGB hex → linear → XYZ → Lab → ΔE00, plus Viénot/Brettel-Mollon dichromacy
 * simulation and WCAG relative luminance.
 */

export const hexRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
export const srgbToLin = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
export const linToSrgb = (v: number): number => {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, s)) * 255);
};
export function lab(h: string): [number, number, number] {
  const [r, g, b] = hexRgb(h);
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  const f = (t: number): number => (t > 0.008856451679 ? Math.cbrt(t) : 7.787037 * t + 16 / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function deltaE00(l1: [number, number, number], l2: [number, number, number]): number {
  const [L1, a1, b1] = l1;
  const [L2, a2, b2] = l2;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const deg = (r: number): number => ((r * 180) / Math.PI + 360) % 360;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : deg(Math.atan2(b1, a1p));
  const h2p = C2p === 0 ? 0 : deg(Math.atan2(b2, a2p));
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else {
    const d = Math.abs(h1p - h2p);
    hbp =
      d <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) +
      Math.pow(dCp / Sc, 2) +
      Math.pow(dHp / Sh, 2) +
      Rt * (dCp / Sc) * (dHp / Sh),
  );
}
export const dE = (a: string, b: string): number => deltaE00(lab(a), lab(b));

/** Viénot/Brettel-Mollon: lineares RGB eines Dichromaten. */
export const CVD_MATRIX = {
  protan: [
    [0.152286, 1.052585, -0.204876],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048119, 1.051999],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.042994, 0.968826],
  ],
} as const;
export function simulate(hex: string, kind: keyof typeof CVD_MATRIX): [number, number, number] {
  const [r, g, b] = hexRgb(hex);
  const lr = [srgbToLin(r), srgbToLin(g), srgbToLin(b)];
  const m = CVD_MATRIX[kind];
  const o = m.map(([r0, g0, b0]) => r0 * lr[0]! + g0 * lr[1]! + b0 * lr[2]!);
  const hex2 = "#" + o.map((v) => linToSrgb(v).toString(16).padStart(2, "0")).join("");
  return lab(hex2);
}
export function relLum(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
export const contrast = (a: string, b: string): number => {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * The number an alarm tone has to earn: its smallest CIEDE2000 distance to a
 * neighbour over the three vision types the palette is held to. A pair that is
 * far apart for a tricolour observer and 6 apart for a deuteranope is one
 * colour on screen for a seventh of the male pilots, so the minimum is the
 * measurement and the normal-vision value is decoration.
 */
export function worstSeharten(a: string, b: string): number {
  return Math.min(
    deltaE00(lab(a), lab(b)),
    deltaE00(simulate(a, "protan"), simulate(b, "protan")),
    deltaE00(simulate(a, "deutan"), simulate(b, "deutan")),
  );
}
