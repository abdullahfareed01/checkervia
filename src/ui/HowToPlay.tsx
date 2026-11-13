import type { GameMode } from "../state/gameReducer";

interface HowToPlayProps {
  onBack: () => void;
  onPlay: (mode: GameMode) => void;
  onLearn: () => void;
}

// The rules as the engine plays them (docs/02-design/core-mechanics.md), in
// plain words. If a rule changes there, change it here too.
export const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "The goal",
    points: [
      "Take all of your opponent's pieces, or leave them with no legal move.",
      "Black moves first. Players take turns.",
    ],
  },
  {
    title: "Moving",
    points: [
      "Pieces stay on the dark squares.",
      "A piece moves one square diagonally forward onto an empty square.",
    ],
  },
  {
    title: "Capturing",
    points: [
      "Jump diagonally over an opponent's piece onto the empty square behind it. The jumped piece is removed.",
      "If the same piece can jump again, it keeps jumping in the same turn (a multi jump).",
      "Capturing is mandatory: if any capture is possible, you must capture. Pieces that must capture glow red.",
      "With several captures to choose from, you may pick any of them.",
    ],
  },
  {
    title: "Kings",
    points: [
      "A piece that reaches the far row becomes a King.",
      "A King moves and captures one square diagonally, forward or backward.",
      "Becoming a King during a capture ends the turn.",
    ],
  },
  {
    title: "Controls",
    points: [
      "Click a piece, then click where it should go.",
      "If two routes reach the same square, click the next landing square to choose.",
      "Use the history arrows (or the arrow keys) to look back. Looking back never changes the game.",
      "After an AI move, “Why this move?” shows the AI's reason and what the game can confirm about it.",
    ],
  },
];

// The rules page, opened from the home menu.
export function HowToPlay({ onBack, onPlay, onLearn }: HowToPlayProps) {
  return (
    <main className="rules">
      <header className="rules-head">
        <button type="button" className="button" onClick={onBack}>
          ← Menu
        </button>
        <h1>How to play</h1>
      </header>

      <div className="rules-body">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rules-section">
            <h2>{section.title}</h2>
            <ul>
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="rules-actions">
        <button type="button" className="button" onClick={onLearn}>
          Watch it played
        </button>
        <button type="button" className="button button-primary" onClick={() => onPlay("vs-ai")}>
          Play vs AI
        </button>
        <button type="button" className="button" onClick={() => onPlay("two-player")}>
          2 Players
        </button>
      </footer>
    </main>
  );
}
