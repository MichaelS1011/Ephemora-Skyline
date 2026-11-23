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
import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import type { BoardCopy } from "../city/teachBoards";
import { reviewKeyFor } from "../reviews";
import type { CityFile, CityFinding } from "../city/types";

export function TeachBoardsReading() {
  const cityData = useStore((s) => s.cityData);
  const lang = useStore((s) => s.prefs.lang);
  const reviews = useStore((s) => s.reviews);
  const taught = useStore((s) => s.taughtBoards);

  const [boards, setBoards] = useState<BoardCopy[]>([]);

  // `boardCopy` shares its module with the plates' geometry — and that module
  // pulls in three.js. A static import here would drag ~1 MB of 3D onto the
  // start screen's critical path just to render a handful of sentences in an
  // sr-only div, so the words arrive as a chunk when there are boards to read.
  useEffect(() => {
    let alive = true;
    if (!cityData || taught.length === 0) {
      setBoards([]);
      return;
    }
    const answered = (file: CityFile, index: number, finding: CityFinding): boolean =>
      reviews[reviewKeyFor(file, index, finding)] !== undefined;
    void import("../city/teachBoards").then(({ boardCopy }) => {
      if (!alive) return;
      const painted = new Map(boardCopy(cityData, lang, answered).map((b) => [b.id, b]));
      setBoards(
        taught.flatMap((id) => {
          const board = painted.get(id);
          return board ? [board] : [];
        }),
      );
    });
    return () => {
      alive = false;
    };
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
