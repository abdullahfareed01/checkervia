import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AiLevel } from "../ai";
import { useGame } from "../state/useGame";
import { isCaptureMandatory, isGameInProgress, pieceCounts } from "../state/selectors";
import { canGoBack, canGoForward, displayedPosition, moveList } from "../state/history";
import type { MoveListItem } from "../state/history";
import type { GameMode, GameOptions } from "../state/gameReducer";
import { AiMoveNote } from "./AiMoveNote";
import { useStrongestGate } from "./ConsentDialog";
import { Board } from "./Board";
import { boardViewOf, cardFor, nameOf, winReasonOf } from "./gameView";
import { HistoryControls } from "./HistoryControls";
import { LevelDialog } from "./LevelDialog";
import { MenuSetup } from "./MenuSetup";
import { ModeSelector } from "./ModeSelector";
import { NewGameButton } from "./NewGameButton";
import { ResultDialog } from "./ResultDialog";
import { RulesDialog } from "./RulesDialog";
import { ChatBubble } from "./ChatBubble";
import { LanguageInfo } from "./LanguageInfo";
import { ResignButton } from "./ResignButton";
import { usePersonality } from "./usePersonality";
import { reactionBubble } from "./bubble";
import { LANDSCAPE_PHONE, PHONE, useMediaQuery } from "./useMediaQuery";
import { WhySheet } from "./WhyContent";
import { StatusBar } from "./StatusBar";
import { TermsDialog } from "./TermsDialog";
import { TopBar } from "./TopBar";
import type { MenuRun } from "./TopBar";
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
  const { state, click, newGame, setMode, retryAi, goHistory, playAi, resign } = useGame(initial);
  const inProgress = isGameInProgress(state);
  const durationMs = useGameDuration(state.movesPlayed, state.winner);
  const result = useResultPopup(state.winner, state.lastMove);
  const shown = displayedPosition(state);
  const moveKey = useAnimationKey(shown.index);
  const why = useAiExplanation(state.mode, shown);
  const phone = useMediaQuery(PHONE);
  const landscapePhone = useMediaQuery(LANDSCAPE_PHONE);
  const [askLevel, setAskLevel] = useState(false);
  // The move list only changes when the history does (DEV-010).
  const moves = useMemo(() => moveList(state), [state.history]);
  const moveNameOf = useCallback((item: MoveListItem) => nameOf(state.mode, item.player), [state.mode]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  useHistoryKeys(goHistory, !result.open && !(why.open && phone) && !askLevel && !rulesOpen && !termsOpen);
  const loseQuestion = (what: string) => (inProgress ? `${what} The current game will be lost.` : undefined);

  // Switching to "Play vs AI" first asks for the AI's level.
  const chooseMode = useCallback((mode: GameMode) => (mode === "vs-ai" ? setAskLevel(true) : setMode(mode)), [setMode]);
  const openRules = useCallback(() => setRulesOpen(true), []);
  const openTerms = useCallback(() => setTermsOpen(true), []);
  const openLanguage = useCallback(() => setLanguageOpen(true), []);
  // Resign (Change 4): the player against the AI, otherwise the side to move.
  const resignQuestion =
    state.mode === "vs-ai" ? "Resign this game? The AI wins." : `Resign this game? ${state.currentPlayer === "black" ? "White" : "Black"} wins.`;
  const canResign = state.winner === null;
  const menuItems = useMemo(
    () => [
      { label: "New game", onSelect: newGame, confirm: loseQuestion("Start a new game?") },
      ...(canResign ? [{ label: "Resign", onSelect: resign, confirm: resignQuestion }] : []),
      { label: "How to play", onSelect: openRules },
      { label: "Terms and notices", onSelect: openTerms },
      ...(onMenu ? [{ label: "Main menu", onSelect: onMenu, confirm: loseQuestion("Back to the main menu?") }] : []),
    ],
    [inProgress, newGame, openRules, openTerms, onMenu, canResign, resign, resignQuestion],
  );
  // A new game against the AI at `level` (from the level dialog or the
  // Menu). Strongest asks the 18+ consent first (D45); after No or Cancel the
  // current game and level stay as they were.
  const startAt = useCallback(
    (level: AiLevel) => {
      playAi(level);
      onAiLevel?.(level);
    },
    [playAi, onAiLevel],
  );
  const [requestLevel, consent] = useStrongestGate(startAt);
  const startVsAi = useCallback(
    (level: AiLevel) => {
      setAskLevel(false);
      requestLevel(level);
    },
    [requestLevel],
  );
  // The Menu sheet's mode and level controls.
  const setup = useCallback(
    (run: MenuRun) => (
      <MenuSetup
        mode={state.mode}
        level={state.aiLevel}
        run={run}
        loseQuestion={loseQuestion}
        onTwoPlayers={() => setMode("two-player")}
        onPlayAi={startVsAi}
      />
    ),
    [state.mode, state.aiLevel, inProgress, setMode, startVsAi],
  );

  // The AI's chat bubble (Change 3): typing dots while it thinks, then its
  // reaction, until the player picks up a piece for their next move.
  const [dismissedAt, setDismissedAt] = useState(0);
  const startedMove = state.selected !== null || state.pendingRoutes.length > 0;
  useEffect(() => {
    if (startedMove) setDismissedAt(state.history.length);
  }, [startedMove, state.history.length]);
  // Greeting, idle lines, the resign hint and the end of the game (Change 4).
  // Idle lines wait while anything covers the board or the player is busy.
  const covered = menuOpen || consent !== null || termsOpen || rulesOpen || askLevel || languageOpen || result.open || (why.open && phone);
  const playerTurn = state.aiPhase === "idle" && state.winner === null && state.viewIndex === null && state.currentPlayer === "black";
  const personality = usePersonality(state, playerTurn && !startedMove && !covered);
  const bubble = reactionBubble(state, dismissedAt, personality);
  const chat = state.mode === "vs-ai" && (
    <ChatBubble
      message={result.open ? null : bubble}
      placement={landscapePhone ? "side" : "card"}
      whyOpen={why.open}
      onWhy={why.toggleWhy}
    />
  );

  return (
    <main className={`app${state.mode === "vs-ai" ? " app-ai" : ""}`}>
      <header className="topbar">
        <TopBar
          title="Draft"
          onBack={onMenu}
          backConfirm={loseQuestion("Back to the main menu?")}
          items={menuItems}
          setup={setup}
          onOpenChange={setMenuOpen}
        />
        <ModeSelector mode={state.mode} needsConfirmation={inProgress} onChange={chooseMode} />
      </header>

      <section className="game" aria-label="Game">
        {cardFor(state, shown.board, "white", "top", openLanguage)}
        {!landscapePhone && chat}
        <Board view={boardViewOf(state, shown, moveKey)} onSquareClick={click} />
        {cardFor(state, shown.board, "black", "bottom")}
      </section>

      <aside className="sidebar">
        {landscapePhone && chat}
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
        <AiMoveNote explanation={why.explanation} open={why.open} inline={!phone} onToggle={why.toggleWhy} />
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
          {canResign && <ResignButton question={resignQuestion} highlight={personality.hintActive} onResign={resign} />}
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
          onReview={() => {
            result.close();
            goHistory("first");
          }}
          onClose={result.close}
          aiLine={personality.end?.line}
          tips={state.mode === "vs-ai" && state.winner !== "black" ? (personality.end?.tips ?? null) : undefined}
        />
      )}

      {/* Phones: "Why?" floats above the page. Rendered under <body> so no
          stacking layer can trap it under the board's route line (BUG-002). */}
      {phone && why.open && why.explanation && createPortal(<WhySheet explanation={why.explanation} onClose={why.closeWhy} />, document.body)}

      {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} />}

      {askLevel && <LevelDialog initial={state.aiLevel} onStart={startVsAi} onCancel={() => setAskLevel(false)} />}
      {consent}
      {languageOpen && (
        <LanguageInfo
          onTerms={() => {
            setLanguageOpen(false);
            setTermsOpen(true);
          }}
          onClose={() => setLanguageOpen(false)}
        />
      )}
      {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
    </main>
  );
}
