import type { Move, Player } from "../engine";
import { routeSquares, squareCenter } from "./moveGeometry";

interface RouteOverlayProps {
  move: Move;
  player: Player; // who made the move, for the colour
}

// Draws the last move on top of the board: a line with an arrow through
// every square the piece landed on, a ring on the start square, numbered
// rings on each landing of a multi jump, and a red cross on every captured
// piece. This is what makes a double jump readable.
export function RouteOverlay({ move, player }: RouteOverlayProps) {
  const points = routeSquares(move)
    .map(squareCenter)
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");
  const start = squareCenter(move.from);
  const numbered = move.path.length > 1;
  const arrow = `route-arrow-${player}`;

  return (
    <svg className={`route route-${player}`} viewBox="0 0 8 8" aria-hidden="true">
      <defs>
        <marker id={arrow} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M1,1 L9,5 L1,9" className="route-arrow" />
        </marker>
      </defs>

      {/* pathLength 1 lets the CSS draw the line from start to end. */}
      <polyline className="route-line" points={points} pathLength={1} markerEnd={`url(#${arrow})`} />
      <circle className="route-start" cx={start.x} cy={start.y} r={0.17} />
      {numbered &&
        move.path.map((square, index) => {
          const { x, y } = squareCenter(square);
          return (
            <g key={index} className="route-stop">
              <circle cx={x} cy={y} r={0.22} />
              <text x={x} y={y}>
                {index + 1}
              </text>
            </g>
          );
        })}

      {move.captured.map((square, index) => {
        const { x, y } = squareCenter(square);
        const d = 0.17;
        return (
          <g key={index} className="route-capture">
            <line x1={x - d} y1={y - d} x2={x + d} y2={y + d} />
            <line x1={x - d} y1={y + d} x2={x + d} y2={y - d} />
          </g>
        );
      })}
    </svg>
  );
}
