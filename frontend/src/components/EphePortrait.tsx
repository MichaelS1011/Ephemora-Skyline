import { EPHE_PALETTE } from "../city/palette";
import { FIGURE, writeEpheLimbPose, type EpheLimbPose } from "./Pedestrians";
import { t, type Lang } from "../i18n";

/**
 * MASTER-2027 §03.04 — the existing Ephe, at the centre of the start screen.
 *
 * The landing showed a schematic city and no resident. This puts the figure
 * front and centre — and it is the SAME figure, not a redraw of it: every
 * landmark is read out of the shipped `FIGURE` (the crowd's own body plan) and
 * every colour out of `EPHE_PALETTE`, and the stance comes from the real idle
 * pose (`writeEpheLimbPose`). There is one source of truth, so a change to the
 * resident's proportions moves this portrait too. `tests/ephe-portrait.test.ts`
 * holds that equation.
 *
 * It is a portrait, not the live 3D resident: a flat front view, so the start
 * screen stays light and no second figure renderer is added (the crowd's eleven
 * instanced draws belong to the city, not here). The interactive 3D preview of
 * the figure is §04.02's own step.
 */

/** Pixels per world unit and the plate the figure stands on. */
export const SC = 180;
export const VB_W = 220;
export const VB_H = 300;
export const CX = VB_W / 2;
/** world y = 0 (the feet) lands here; the crown (1.35) reaches y ≈ 15. */
export const GROUND_Y = 258;
export const svgY = (worldY: number): number => GROUND_Y - worldY * SC;

/** The first resident family in the palette — index 0, the same one a crowd draws. */
const C = {
  coat: EPHE_PALETTE.jackets[0],
  sleeve: EPHE_PALETTE.sleeves[0],
  trouser: EPHE_PALETTE.trousers[0],
  skin: EPHE_PALETTE.shells[0],
  hair: EPHE_PALETTE.hair[0],
  boot: EPHE_PALETTE.boots,
  eye: EPHE_PALETTE.eyes,
  contact: EPHE_PALETTE.contact,
};

/** The coat is a lathe: its outline is `FIGURE.coat`, mirrored about the axis. */
function coatPath(): string {
  const right = FIGURE.coat.map(
    ([r, h]) => `${(CX + r * SC).toFixed(1)} ${svgY(FIGURE.bodyY + h).toFixed(1)}`,
  );
  const left = [...FIGURE.coat]
    .reverse()
    .map(([r, h]) => `${(CX - r * SC).toFixed(1)} ${svgY(FIGURE.bodyY + h).toFixed(1)}`);
  return `M ${right.join(" L ")} L ${left.join(" L ")} Z`;
}

export function EphePortrait({ lang, width = 150 }: { lang: Lang; width?: number }) {
  // The real standing pose decides the leg stance — the same call the crowd and
  // the readability test make, so the portrait cannot drift from the figure.
  const pose: EpheLimbPose = {
    footX: 0,
    footY: 0,
    footZ: 0,
    handX: 0,
    handY: 0,
    handZ: 0,
    kneeForward: 0,
  };
  writeEpheLimbPose(pose, 0, 1, "idle");
  const stanceX = pose.footX * SC; // half the gap between the two legs
  const shinR = 0.07 * SC; // the shin radius the frame loop writes beside this call
  const legTop = svgY(FIGURE.hipY);
  const legBottom = svgY(FIGURE.ankleY);
  const bootTop = svgY(FIGURE.ankleY);
  const bootBottom = svgY(pose.footY);

  const headCy = svgY(FIGURE.headY);
  const headR = FIGURE.headR * SC;
  const faceCy = svgY(FIGURE.headY + FIGURE.faceY);
  const faceRx = FIGURE.faceR * SC;
  const faceRy = FIGURE.faceUp * SC;
  const eyeCy = svgY(FIGURE.headY + FIGURE.eyeY);
  const eyeCx = FIGURE.eyeSide * SC;
  const eyeR = 0.02 * SC;

  const shoulderCy = svgY(FIGURE.bodyY + FIGURE.shoulderY);
  const handCy = svgY(pose.handY);
  const shoulderX = FIGURE.shoulderWidth * SC; // the arm's top meets the coat's collar
  const handX = pose.handX * SC; // and angles out to the hand, as in the crowd
  const armW = 0.15 * SC; // the sleeve's own width (the readability band's 2.86 px)

  return (
    <figure className="start-ephe" aria-label={t(lang, "landing.epheAria")}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={width}
        height={(width * VB_H) / VB_W}
        role="img"
        aria-label={t(lang, "landing.epheAria")}
      >
        {/* the ground the figure meets, not a shadow it floats over */}
        <ellipse
          cx={CX}
          cy={GROUND_Y}
          rx={stanceX + shinR + 6}
          ry={7}
          fill={C.contact}
          opacity={0.26}
        />
        {/* legs + boots */}
        {[-1, 1].map((side) => (
          <g key={side}>
            <rect
              x={CX + side * stanceX - shinR}
              y={legTop}
              width={shinR * 2}
              height={legBottom - legTop}
              rx={shinR}
              fill={C.trouser}
            />
            <rect
              x={CX + side * stanceX - shinR}
              y={bootTop}
              width={shinR * 2}
              height={bootBottom - bootTop + shinR}
              rx={shinR * 0.7}
              fill={C.boot}
            />
          </g>
        ))}
        {/* arms hang in front of the coat — from the collar out to the hand, so
            they meet the body instead of floating beside it (the real figure's
            arm is a capsule from shoulder to hand, not a detached column) */}
        {[-1, 1].map((side) => (
          <line
            key={side}
            x1={CX + side * shoulderX}
            y1={shoulderCy}
            x2={CX + side * handX}
            y2={handCy}
            stroke={C.sleeve}
            strokeWidth={armW}
            strokeLinecap="round"
          />
        ))}
        {/* the coat, from the shipped lathe profile */}
        <path d={coatPath()} fill={C.coat} />
        {/* head: dark skull, light face band in its lower part, two eyes */}
        <circle cx={CX} cy={headCy} r={headR} fill={C.hair} />
        <ellipse cx={CX} cy={faceCy} rx={faceRx} ry={faceRy} fill={C.skin} />
        <circle cx={CX - eyeCx} cy={eyeCy} r={eyeR} fill={C.eye} />
        <circle cx={CX + eyeCx} cy={eyeCy} r={eyeR} fill={C.eye} />
      </svg>
      <figcaption>{t(lang, "landing.epheCaption")}</figcaption>
    </figure>
  );
}
