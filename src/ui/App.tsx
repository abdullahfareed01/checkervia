import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AiLevel } from "../ai";
import { useGame } from "../state/useGame";
import { isGameInProgress, pieceCounts } from "../state/selectors";
import { canGoBack, canGoForward, displayedPosition, moveList } from "../state/history";
import type { MoveListItem } from "../state/history";
import { AI_PLAYER, gameReducer } from "../state/gameReducer";
import type { GameMode, GameOptions } from "../state/gameReducer";
import { opponentOf } from "../engine";
import type { Move, Position } from "../engine";
import { winChance } from "../ai/winChance";
import { AiCoach, coachMessage } from "./AiCoach";
import { aiMood } from "./aiMood";
import { useStrongestGate } from "./ConsentDialog";
import { Board } from "./Board";
import { boardViewOf, cardFor, nameOf, winReasonOf } from "./gameView";
import { HistoryControls } from "./HistoryControls";
import { LevelDialog } from "./LevelDialog";
import { MenuSetup } from "./MenuSetup";
import { ModeSelector } from "./ModeSelector";
import { ResultDialog } from "./ResultDialog";
import { RulesDialog } from "./RulesDialog";
import { LanguageInfo } from "./LanguageInfo";
import { ANGRY_FROM_IDLE, usePersonality } from "./usePersonality";
import { reactionBubble } from "./bubble";
import { WhySheet } from "./WhyContent";
import { StatusBar } from "./StatusBar";
import { TermsDialog } from "./TermsDialog";
import { SettingsSheet } from "./SettingsSheet";
import { TopBar } from "./TopBar";
import { ActionBar } from "./ActionBar";
import type { EndAction } from "./ActionBar";
import { GameMenu } from "./GameMenu";
import { DocumentIcon, GearIcon, HomeIcon } from "./icons";
import { LbCrown, LbTrophy, PersonIcon } from "./leaderboard/lbIcons";
import type { MenuRun } from "./GameMenu";
import { useAiExplanation } from "./useAiExplanation";
import { useGameDuration, useResultPopup } from "./useResultPopup";
import { useAnimationKey, useHistoryKeys } from "./useHistoryView";
import { clickFeedback, playFeedback } from "./feedback";
import type { MoveBeat } from "./feedback";
import { shakeAt } from "./animation/shake";
import { settingsStore, useSettings } from "./settings";
import { useGameFeedback } from "./useFeedback";
import { useSpeakTips, useVoice } from "./useVoice";
import { voiceEngine } from "./voice/voiceEngine";
import { LeaderboardScreen } from "./leaderboard/LeaderboardScreen";
import { useProfileGate } from "./leaderboard/ProfileGate";
import { ProfileScreen } from "./leaderboard/ProfileScreen";
import { useLeaderboardGame } from "./leaderboard/useLeaderboardGame";
import { WinStatus } from "./leaderboard/WinStatus";
import { useLeaderboardProfile } from "./leaderboard/profile";
import { WinChanceBar } from "./WinChanceBar";
import { AiRecordDialog, useAiStats } from "./AiRecordDialog";
import { useVsAiRecord } from "./vsAiRecord";

interface AppProps {
  initial?: GameOptions | undefined; // the first game's setup
  onMenu?: () => void; // shows a Menu button that leaves the game
  onAiLevel?: (level: AiLevel) => void; // told when a level is chosen (to remember it)
}

// Thin shell: reads state, renders it, forwards clicks.
// Layout: the board column (opponent card, board, your card) and a sidebar
// (title, mode, status, history, controls). See styles.css for the layout.
export function App({ initial, onMenu, onAiLevel }: AppProps) {
  const game = useGame(initial);
  const { state, retryAi, goHistory } = game;
  // The game's actions with their sounds and vibrations (feedback.ts). A
  // board click is classified by running the pure reducer on the current
  // state: a pick up, a put down, or a tap that does nothing. Moves sound
  // when the piece lands (useGameFeedback).
  const current = useRef(state);
  current.current = state;
  // While the move animation's hops run, the board waits (never longer).
  const movingNow = useRef(false);
  // The last move whose animation has landed (see aiLanding). Only the move
  // on screen counts: the cleanup of an older one reports its own key.
  const [landedMove, setLandedMove] = useState<Move | null>(null);
  const shownKey = useRef(0);
  const onMoveLock = useCallback((locked: boolean, key: number) => {
    movingNow.current = locked;
    if (!locked && key === shownKey.current) setLandedMove(current.current.lastMove);
  }, []);
  // Each landing of a move: its sound and vibration (only for the game as
  // it is now, not while stepping through the history).
  const onMoveBeat = useCallback((beat: MoveBeat) => {
    if (current.current.viewIndex === null) playFeedback(beat.event, beat.options);
  }, []);
  const click = useCallback(
    (position: Position) => {
      if (movingNow.current) return;
      const before = current.current;
      const event = clickFeedback(before, gameReducer(before, { type: "click", position }), position);
      if (event) playFeedback(event, { column: position.col });
      if (event === "invalid" || event === "captureRequired") {
        // Shake the tapped piece, or the picked up one for an empty square.
        const level = settingsStore().get().animation.level;
        const onPiece = before.board[position.row]?.[position.col];
        shakeAt(onPiece || !before.selected ? position : before.selected, level);
      }
      game.click(position);
    },
    [game.click],
  );
  const startNewGame = useCallback(() => {
    voiceEngine().cancel();
    game.newGame();
    playFeedback("gameStart");
  }, [game.newGame]);
  const setMode = useCallback(
    (mode: GameMode) => {
      voiceEngine().cancel();
      if (mode !== current.current.mode) playFeedback("gameStart");
      game.setMode(mode);
    },
    [game.setMode],
  );
  const playAi = useCallback(
    (level: AiLevel) => {
      voiceEngine().cancel();
      game.playAi(level);
      playFeedback("gameStart");
    },
    [game.playAi],
  );
  const resign = useCallback(() => {
    game.resign();
    playFeedback("resign");
  }, [game.resign]);
  // Opening the game screen sets up a board too (once, even in StrictMode).
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) playFeedback("gameStart");
    started.current = true;
  }, []);
  const inProgress = isGameInProgress(state);
  const durationMs = useGameDuration(state.movesPlayed, state.winner);
  const result = useResultPopup(state.winner, state.lastMove);
  const shown = displayedPosition(state);
  const moveKey = useAnimationKey(shown.index);
  // Each side's chance of winning in the position on screen (D65): the side
  // to move there, and 100% once the game is won on the board shown.
  const shownToMove = shown.live ? state.currentPlayer : shown.player ? opponentOf(shown.player) : "black";
  const shownWinner = shown.live ? state.winner : null;
  const chance = useMemo(
    () => (shownWinner ? (shownWinner === "black" ? 1 : 0) : winChance(shown.board, shownToMove)),
    [shown.board, shownToMove, shownWinner],
  );
  // The player's chosen avatar on their card in games against the AI (D65).
  const { profile } = useLeaderboardProfile();
  const portrait = state.mode === "vs-ai" ? (profile?.avatar ?? null) : null;
  shownKey.current = moveKey;
  const why = useAiExplanation(state.mode, shown);
  const [askLevel, setAskLevel] = useState(false);
  // The move list only changes when the history does (DEV-010).
  const moves = useMemo(() => moveList(state), [state.history]);
  const moveNameOf = useCallback((item: MoveListItem) => nameOf(state.mode, item.player), [state.mode]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  // The leaderboard (D57) and the Profile screen (D61); a qualifying win is
  // sent by itself from the result panel.
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const leaderboardWin = useLeaderboardGame(state);
  // A game against the AI starts through the profile step (D61); Back from
  // it returns to the home screen.
  const [requireProfile, profileGate] = useProfileGate(() => onMenu?.(), () => setTermsOpen(true));
  const gating = profileGate !== null;
  const newGame = useCallback(() => {
    if (current.current.mode === "vs-ai") requireProfile(startNewGame);
    else startNewGame();
  }, [startNewGame, requireProfile]);
  useHistoryKeys(goHistory, !result.open && !why.open && !askLevel && !rulesOpen && !termsOpen && !leaderboardOpen && !profileOpen && !gating);
  const loseQuestion = (what: string) => (inProgress ? `${what} The current game will be lost.` : undefined);

  // Switching to "Play vs AI" first asks for the AI's level.
  const chooseMode = useCallback((mode: GameMode) => (mode === "vs-ai" ? setAskLevel(true) : setMode(mode)), [setMode]);
  const openRules = useCallback(() => setRulesOpen(true), []);
  const openTerms = useCallback(() => setTermsOpen(true), []);
  const openLanguage = useCallback(() => setLanguageOpen(true), []);
  // Resign (Change 4): the player against the AI, otherwise the side to move.
  const resignQuestion =
    state.mode === "vs-ai" ? "Resign this game? The AI wins." : `Resign this game? ${state.currentPlayer === "black" ? "White" : "Black"} wins.`;
  // New game and Resign are on the action bar, not in the Menu (D50).
  const menuItems = useMemo(
    () => [
      // The same symbols as the home menu where it has one.
      { label: "How to play", icon: <LbCrown jewel="#e9a92c" />, onSelect: openRules },
      { label: "Leaderboard", icon: <LbTrophy />, onSelect: () => setLeaderboardOpen(true) },
      { label: "Profile", icon: <PersonIcon />, onSelect: () => setProfileOpen(true) },
      { label: "Settings", icon: <GearIcon />, onSelect: () => setSettingsOpen(true) },
      { label: "Terms and notices", icon: <DocumentIcon />, onSelect: openTerms },
      ...(onMenu ? [{ label: "Main menu", icon: <HomeIcon />, onSelect: onMenu, confirm: loseQuestion("Back to the main menu?") }] : []),
    ],
    [inProgress, openRules, openTerms, onMenu],
  );
  // A new game against the AI at `level` (from the level dialog or the
  // Menu). Strongest asks the 18+ consent first (D45); after No or Cancel the
  // current game and level stay as they were.
  const startAt = useCallback(
    (level: AiLevel) =>
      requireProfile(() => {
        playAi(level);
        onAiLevel?.(level);
      }),
    [playAi, onAiLevel, requireProfile],
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
  // reaction, until the player's next move is played (D65).
  const startedMove = state.selected !== null || state.pendingRoutes.length > 0;
  // Greeting, idle lines, the resign hint and the end of the game (Change 4).
  // Idle lines wait while anything covers the board or the player is busy.
  const covered = menuOpen || consent !== null || termsOpen || rulesOpen || askLevel || languageOpen || result.open || why.open || leaderboardOpen || profileOpen || gating;
  const playerTurn = state.aiPhase === "idle" && state.winner === null && state.viewIndex === null && state.currentPlayer === "black";
  // Idle lines keep coming while the player taps or picks up a piece; only
  // their move stops them (D82). The resign pressure still waits.
  const personality = usePersonality(state, playerTurn && !covered, startedMove);
  // The AI's line appears after its piece has landed: until then, the typing
  // dots stay (the same bubble, so nothing flickers). Worked out during the
  // render from the move's animation key, so no effect (the bubble's pop, the
  // voice) ever sees the line early.
  const settings = useSettings();
  const animatedLevel = settings.animation.level;
  const aiLanding =
    state.mode === "vs-ai" &&
    state.viewIndex === null &&
    state.history[state.history.length - 1]?.player === AI_PLAYER &&
    moveKey > 0 &&
    state.lastMove !== null &&
    state.lastMove !== landedMove &&
    (animatedLevel === "standard" || animatedLevel === "cinematic");
  const bubble = aiLanding
    ? { key: `thinking-${state.aiRequestId}`, text: null, tone: "banter" as const, why: false }
    : reactionBubble(state, personality);
  // The action bar's fourth button: Resign during a game, Result after it.
  const endAction: EndAction =
    state.winner === null
      ? { kind: "resign", question: resignQuestion, highlight: personality.hintActive, onResign: resign }
      : { kind: "result", onShow: result.reopen };
  // Sounds and vibrations that follow from what is on screen.
  const sheets = [menuOpen && "menu", why.open && "why", termsOpen && "terms", rulesOpen && "rules", languageOpen && "language", askLevel && "level", settingsOpen && "settings", leaderboardOpen && "leaderboard", (profileOpen || gating) && "profile"]
    .filter(Boolean)
    .join(" ");
  useGameFeedback({ state, resultOpen: result.open, sheets, bubble: result.open ? null : bubble });
  // The AI's voice reads what is on screen (only what the player chose).
  const endLine = result.open && state.mode === "vs-ai" ? (personality.end?.line?.text ?? null) : null;
  const whyText =
    why.open && why.explanation ? [...why.explanation.facts.map((fact) => fact.text), why.explanation.reason ?? ""].join(" ") : null;
  useVoice({ bubble: result.open ? null : bubble, level: state.aiLevel, startedMove, endLine, why: whyText });
  const speakTips = useSpeakTips(state.aiLevel);
  // The AI under the board (D64): its robot with its mood and its bubble.
  // Chat lines can be hidden (Settings; the AI's voice says the same either
  // way), and then only the robot shows.
  const showBubbles = settings.chat.bubbles;
  // The robot types its next ask with its thinking face, and laughs while
  // the ask is on screen (D69, D70).
  // After the game, the AI's last words stay in its bubble (D71); not read
  // out again (the result panel did).
  const lastWords =
    state.winner && state.viewIndex === null && personality.end
      ? { key: `end-${state.history.length}`, text: personality.end.line.text, tone: personality.end.line.tone, why: false, announce: false }
      : null;
  const coachBase = coachMessage(bubble, showBubbles, lastWords);
  // The AI's record (D75, D77): a popup that opens only from the robot's
  // avatar, fetching the record again as it opens. Your own totals only
  // choose its taunt; they are never shown.
  const myRecord = useVsAiRecord();
  const [recordOpens, setRecordOpens] = useState(0);
  const aiStats = useAiStats(myRecord.games, recordOpens);
  const [recordOpen, setRecordOpen] = useState(false);
  const openRecord = useCallback(() => {
    setRecordOpen(true);
    setRecordOpens((count) => count + 1);
  }, []);
  const closeRecord = useCallback(() => setRecordOpen(false), []);
  const coachLine = coachBase;
  // Bored of waiting after the second idle line: it dozes off (D72); from
  // the third it gets angry (D73).
  const idleCount = personality.idle?.count ?? 0;
  const mood = aiLanding
    ? "thinking"
    : recordOpen
      ? "laughing"
      : personality.pressure
      ? personality.pressure.text
        ? "laughing"
        : "thinking"
      : idleCount >= ANGRY_FROM_IDLE
        ? "angry"
        : idleCount === 2
          ? "sleepy"
          : aiMood(state, 1 - chance);

  return (
    <main className={`app${state.mode === "vs-ai" ? " app-ai" : ""}`}>
      <header className="topbar">
        <TopBar title="Checkervia" />
        <ModeSelector mode={state.mode} needsConfirmation={inProgress} onChange={chooseMode} />
      </header>

      <section className="game" aria-label="Game">
        {cardFor(state, shown.board, "white", "top", openLanguage, mood)}
        <div className="board-area">
          <Board view={boardViewOf(state, shown, moveKey)} onSquareClick={click} onMoveBeat={onMoveBeat} onMoveLock={onMoveLock} />
          <WinChanceBar chance={chance} black={nameOf(state.mode, "black")} white={nameOf(state.mode, "white")} />
        </div>
        {cardFor(state, shown.board, "black", "bottom", undefined, undefined, portrait)}
      </section>

      <aside className="sidebar">
        <StatusBar
          currentPlayer={state.currentPlayer}
          winner={state.winner}
          winReason={winReasonOf(state)}
          choosingRoute={state.pendingRoutes.length > 0}
          aiPhase={state.aiPhase}
          aiFailureReasons={state.aiFailureReasons}
          onRetryAi={retryAi}
        />
        {state.mode === "vs-ai" && <AiCoach message={coachLine} mood={mood} whyOpen={why.open} onWhy={why.toggleWhy} onAvatar={openRecord} />}
        {state.mode === "vs-ai" && recordOpen && <AiRecordDialog ai={aiStats} mine={myRecord} level={state.aiLevel} gameOver={state.winner !== null} onClose={closeRecord} />}
        <HistoryControls index={shown.index} total={shown.total} live={shown.live} moves={moves} nameOf={moveNameOf} onGo={goHistory} />
        <ActionBar
          menu={<GameMenu items={menuItems} setup={setup} onOpenChange={setMenuOpen} />}
          canBack={canGoBack(state)}
          canForward={canGoForward(state)}
          onGo={goHistory}
          end={endAction}
          needsConfirmation={inProgress}
          onNewGame={newGame}
        />
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
          onTipsShown={speakTips}
          leaderboard={
            leaderboardWin && (
              <WinStatus
                key={leaderboardWin.gameId}
                win={leaderboardWin}
                onViewLeaderboard={() => {
                  result.close();
                  setLeaderboardOpen(true);
                }}
              />
            )
          }
        />
      )}

      {/* Phones: "Why?" floats above the page. Rendered under <body> so no
          stacking layer can trap it under the board's route line (BUG-002). */}
      {why.open && why.explanation && createPortal(<WhySheet explanation={why.explanation} onClose={why.closeWhy} />, document.body)}

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
      {profileGate}
      {leaderboardOpen && <LeaderboardScreen onClose={() => setLeaderboardOpen(false)} onOwnProfile={() => setProfileOpen(true)} />}
      {profileOpen && <ProfileScreen onClose={() => setProfileOpen(false)} onTerms={openTerms} />}
      {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
      {settingsOpen && (
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          onProfile={() => {
            setSettingsOpen(false);
            setProfileOpen(true);
          }}
        />
      )}
    </main>
  );
}
