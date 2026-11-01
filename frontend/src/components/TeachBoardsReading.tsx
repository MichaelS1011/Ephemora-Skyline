/**
 * The teaching boards, spoken.
 *
 * The plates are painted into the 3D picture: `TeachBoards.tsx` draws them onto
 * canvas textures, so no screen reader reaches their words, no keyboard can
 * stop on them, and nothing can be selected there. That is the chosen look of
 * the boards, not an accident to design around — so the words are mirrored here
 * instead, in the one order that is honest: `taughtBoards` names the boards the
 * picture actually carries, which on a real project is fewer than three.
 *
 * One source for both channels: `boardCopy()` is called with the same `answered`
 * rule the plates use, so a sentence cannot be true in the picture and different
 * in the reading.
 */
import { useMemo } from "react";
import { useStore } from "../stores/useStore";
import { boardCopy, type BoardCopy } from "../city/teachBoards";
import { reviewKeyFor } from "../reviews";
import type { CityFile, CityFinding } from "../city/types";

export function TeachBoardsReading() {
  const cityData = useStore((s) => s.cityData);
  const lang = useStore((s) => s.prefs.lang);
  const reviews = useStore((s) => s.reviews);
  const taught = useStore((s) => s.taughtBoards);

  const boards = useMemo<BoardCopy[]>(() => {
    if (!cityData || taught.length === 0) return [];
    const answered = (file: CityFile, index: number, finding: CityFinding): boolean =>
      reviews[reviewKeyFor(file, index, finding)] !== undefined;
    const painted = new Map(boardCopy(cityData, lang, answered).map((b) => [b.id, b]));
    return taught.flatMap((id) => {
      const board = painted.get(id);
      return board ? [board] : [];
    });
  }, [cityData, lang, reviews, taught]);

  if (boards.length === 0) return null;

  return (
    <div className="sr-only" data-teach-boards-reading="true">
      {boards.map((board) => (
        <div key={board.id} role="note">
          <p>{board.text.title}</p>
          {board.text.lines.map((line, i) => (
            <p key={`${board.id}-${i}`}>{line}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
