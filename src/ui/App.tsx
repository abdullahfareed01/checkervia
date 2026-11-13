import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AiLevel } from "../ai";
import { useGame } from "../state/useGame";
import { isCaptureMandatory, isGameInProgress, pieceCounts } from "../state/selectors";
import { canGoBack, canGoForward, displayedPosition, moveList } from "../state/history";
import type { MoveListItem } from "../state/history";
import type { GameMode, GameOptions } from "../state/gameReducer";
import { AiMoveNote } from "./AiMoveNote";
import { AiReasonDialog } from "./AiReasonDialog";
import { Board } from "./Board";
import { boardViewOf, cardFor, nameOf, winReasonOf } from "./gameView";
import { HistoryControls } from "./HistoryControls";
import { LevelDialog } from "./LevelDialog";
import { ModeSelector } from "./ModeSelector";
import { NewGameButton } from "./NewGameButton";
import { ResultDialog } from "./ResultDialog";
import { RulesDialog } from "./RulesDialog";
import { SpeechBubble } from "./SpeechBubble";
import type { SpeechMessage } from "./SpeechBubble";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { useAiExplanation } from "./useAiExplanation";
import { useGameDuration, useResultPopup } from "./useResultPopup";
import { useAnimationKey, useHistoryKeys } from "./useHistoryView";

interface AppProps {
  initial?: GameOptions | undefined; // the first game's setup
  onMenu?: () => void; // shows a Menu button that leaves the game
  onAiLevel?: (level: AiLevel) => void; // told when a level is chosen (to remember it)
}

// Thin shell: reads state, renders it, forwards clicks.
// Layout: the board column (opponent card, board, your card) and a sidebar
// (title, mode, status, history, controls). See styles.css for the layout.
export function App({ initial, onMenu, onAiLevel }: AppProps) {
  const { state, click, newGame, setMode, retryAi, goHistory, setAiLevel } = useGame(initial);
  const inProgress = isGameInProgress(state);
  const durationMs = useGameDuration(state.movesPlayed, state.winner);
  const result = useResultPopup(state.winner, state.lastMove);
  const shown = displayedPosition(state);
  const moveKey = useAnimationKey(shown.index);
  const why = useAiExplanation(state.mode, shown);
  const [askLevel, setAskLevel] = useState(false);
  // The move list only changes when the history does (DEV-010).
  const moves = useMemo(() => moveList(state), [state.history]);
  const moveNameOf = useCallback((item: MoveListItem) => nameOf(state.mode, item.player), [state.mode]);
  const [rulesOpen, setRulesOpen] = useState(false);
  useHistoryKeys(goHistory, !result.open && !why.open && !askLevel && !rulesOpen);
  const loseQuestion = (what: string) => (inProgress ? `${what} The current game will be lost.` : undefined);

  // Switching to "Play vs AI" first asks for the AI's level.
  const chooseMode = useCallback((mode: GameMode) => (mode === "vs-ai" ? setAskLevel(true) : setMode(mode)), [setMode]);
  const openRules = useCallback(() => setRulesOpen(true), []);
  const menuItems = useMemo(
    () => [
      { label: "New game", onSelect: newGame, confirm: loseQuestion("Start a new game?") },
      { label: "How to play", onSelect: openRules },
      ...(onMenu ? [{ label: "Main menu", onSelect: onMenu, confirm: loseQuestion("Back to the main menu?") }] : []),
    ],
    [inProgress, newGame, openRules, onMenu],
  );
  const startVsAi = (level: AiLevel) => {
    setAskLevel(false);
    setAiLevel(level);
    onAiLevel?.(level);
    setMode("vs-ai");
  };

  // The AI's speech bubble: typing dots while it thinks, then its reason,
  // which stays until the player plays their move (or its time runs out).
  // While the player holds a piece it fades so the board stays visible.
  const thinking = state.mode === "vs-ai" && state.aiPhase === "thinking" && shown.live;
  const reason = why.explanation?.reason ?? null;
  const reaction = why.explanation?.reaction ?? null;
  const speech: SpeechMessage | null = thinking
    ? { key: `thinking-${state.aiRequestId}`, text: null }
    : reason
      ? {
          key: `move-${shown.index}`,
          text: reason,
          lead: reaction ?? undefined,
          leadTone: shown.judgement ? (shown.judgement.verdict === "great" ? "praise" : "tease") : "banter",
        }
      : null;

  return (
    <main className="app">
      <header className="topbar">
        <TopBar
          title="Draft"
          onBack={onMenu}
          backConfirm={loseQuestion("Back to the main menu?")}
          items={menuItems}
        />
        <ModeSelector mode={state.mode} needsConfirmation={inProgress} onChange={chooseMode} />
      </header>

      <section className="game" aria-label="Game">
        {cardFor(state, shown.board, "white", "top")}
        <Board view={boardViewOf(state, shown, moveKey)} onSquareClick={click} />
        {cardFor(state, shown.board, "black", "bottom")}
        <SpeechBubble
          message={speech}
          faded={state.selected !== null}
          hidden={result.open}
          onWhy={reason ? why.openWhy : undefined}
        />
      </section>

      <aside className="sidebar">
        <StatusBar
          currentPlayer={state.currentPlayer}
          winner={state.winner}
          winReason={winReasonOf(state)}
          captureMandatory={isCaptureMandatory(state)}
          choosingRoute={state.pendingRoutes.length > 0}
          aiPhase={state.aiPhase}
          aiFailureReasons={state.aiFailureReasons}
          onRetryAi={retryAi}
        />
        <AiMoveNote explanation={why.explanation} onWhy={why.openWhy} />
        <HistoryControls
          index={shown.index}
          total={shown.total}
          live={shown.live}
          canBack={canGoBack(state)}
          canForward={canGoForward(state)}
          moves={moves}
          nameOf={moveNameOf}
          onGo={goHistory}
        />
        <div className="controls">
          {state.winner && !result.open && (
            <button type="button" className="button" onClick={result.reopen}>
              Show result
            </button>
          )}
          <NewGameButton needsConfirmation={inProgress} onNewGame={newGame} />
        </div>
      </aside>

      {state.winner && result.open && (
        <ResultDialog
          winner={state.winner}
          mode={state.mode}
          reason={winReasonOf(state) ?? ""}
          stats={state.stats}
          pieces={pieceCounts(state.board)}
          totalMoves={state.movesPlayed}
          durationMs={durationMs}
          onPlayAgain={newGame}
          onClose={result.close}
        />
      )}

      {/* Rendered under <body> so no stacking layer can trap it under the
          board's route line (BUG-002). */}
      {why.open &&
        why.explanation &&
        createPortal(
          <AiReasonDialog
            moveLabel={why.explanation.label}
            moveNumber={why.explanation.index}
            reason={why.explanation.reason}
            facts={why.explanation.facts}
            onClose={why.closeWhy}
          />,
          document.body,
        )}

      {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} />}

      {askLevel && <LevelDialog initial={state.aiLevel} onStart={startVsAi} onCancel={() => setAskLevel(false)} />}
    </main>
  );
}
