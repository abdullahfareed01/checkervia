// Turns the scripted lessons into a list of frames for playback. Every move is
// looked up in the engine's legal list, so a lesson can never show a move the
// game would not allow: a wrong script throws (and the tests run every one).
// Pure TypeScript: no React.
import { applyMove, getLegalMoves, getWinner, opponentOf, samePosition } from "../engine";
import type { Board, Move, Player, Position } from "../engine";
import { describeFacts, moveFacts } from "../state/moveFacts";
import type { FactLine } from "../state/moveFacts";

// A square as [row, column], counted from 0 like the engine.
export type Cell = readonly [number, number];

export interface LessonStep {
  // The piece's start square, then every square it lands on.
  readonly path: readonly Cell[];
  readonly caption: string; // what this move teaches
}

export interface Scene {
  readonly title: string;
  readonly intro: string; // shown before the first move
  readonly board: Board;
  readonly toMove: Player;
  readonly steps: readonly LessonStep[];
}

// One picture in the playback: the intro of a scene, or the position after
// one of its moves.
export interface Frame {
  readonly sceneIndex: number;
  readonly stepIndex: number; // 0 = the scene's intro, n = after move n
  readonly title: string;
  readonly caption: string;
  readonly board: Board;
  readonly previousBoard: Board | null;
  readonly move: Move | null;
  readonly mover: Player | null;
  readonly toMove: Player; // who moves next
  readonly winner: Player | null;
  // Pieces of the side to move that must capture (shown with a red ring).
  readonly mustCapture: readonly Position[];
  readonly facts: readonly FactLine[]; // engine-checked facts about `move`
  readonly captured: Readonly<Record<Player, number>>; // taken so far in this scene
}

const toPosition = ([row, col]: Cell): Position => ({ row, col });

// The legal move that follows exactly this path, or an error naming the step.
function findMove(board: Board, player: Player, path: readonly Cell[], where: string): Move {
  const [from, ...landings] = path.map(toPosition);
  if (!from || landings.length === 0) throw new Error(`${where}: a path needs a start and a landing`);

  const move = getLegalMoves(board, player).find(
    (candidate) =>
      samePosition(candidate.from, from) &&
      candidate.path.length === landings.length &&
      candidate.path.every((square, i) => samePosition(square, landings[i]!)),
  );
  if (!move) throw new Error(`${where}: not a legal move for ${player}`);
  return move;
}

// Pieces that must capture: if any legal move captures, every piece with a
// capture. Empty once the game is over.
function mustCaptureOf(board: Board, player: Player, winner: Player | null): Position[] {
  if (winner) return [];
  const captures = getLegalMoves(board, player).filter((move) => move.captured.length > 0);
  const squares: Position[] = [];
  for (const move of captures) {
    if (!squares.some((square) => samePosition(square, move.from))) squares.push(move.from);
  }
  return squares;
}

// The intro frame and one frame per move for one scene.
function sceneFrames(scene: Scene, sceneIndex: number): Frame[] {
  const intro: Frame = {
    sceneIndex,
    stepIndex: 0,
    title: scene.title,
    caption: scene.intro,
    board: scene.board,
    previousBoard: null,
    move: null,
    mover: null,
    toMove: scene.toMove,
    winner: null,
    mustCapture: mustCaptureOf(scene.board, scene.toMove, null),
    facts: [],
    captured: { black: 0, white: 0 },
  };

  const frames = [intro];
  scene.steps.forEach((step, i) => {
    const before = frames[frames.length - 1]!;
    if (before.winner) throw new Error(`${scene.title}, move ${i + 1}: the game is already over`);

    const mover = before.toMove;
    const move = findMove(before.board, mover, step.path, `${scene.title}, move ${i + 1}`);
    const board = applyMove(before.board, move);
    const toMove = opponentOf(mover);
    const winner = getWinner(board, toMove);

    frames.push({
      sceneIndex,
      stepIndex: i + 1,
      title: scene.title,
      caption: step.caption,
      board,
      previousBoard: before.board,
      move,
      mover,
      toMove,
      winner,
      mustCapture: mustCaptureOf(board, toMove, winner),
      facts: describeFacts(moveFacts(before.board, move, mover)),
      captured: { ...before.captured, [mover]: before.captured[mover] + move.captured.length },
    });
  });
  return frames;
}

/** Every frame of every scene, in order. Throws if any scripted move is illegal. */
export function buildFrames(scenes: readonly Scene[]): Frame[] {
  return scenes.flatMap(sceneFrames);
}
