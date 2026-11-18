import { useGamePresence } from "./telemetry/useGameTraffic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AiLevel } from "../ai";
import { useGame } from "../state/useGame";
import { isGameInProgress, pieceCounts } from "../state/selectors";
import { canGoBack, canGoForward, displayedPosition, moveList } from "../state/history";
import type { MoveListItem } from "../state/history";
import { aiSideOf, gameReducer, isGameOver } from "../state/gameReducer";
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
import { ANGRY_FROM_IDLE, usePageVisible, usePersonality } from "./usePersonality";
import { reactionBubble } from "./bubble";
import { useRemoteBubble, useRemoteLine } from "./useRemoteTaunt";
import { WhySheet } from "./WhyContent";
import { StatusBar } from "./StatusBar";
import { TermsDialog } from "./TermsDialog";
import { SettingsSheet } from "./SettingsSheet";
import { TopBar } from "./TopBar";
import { ActionBar } from "./ActionBar";
import { ResignButton } from "./ResignButton";
import type { EndAction } from "./ActionBar";
import { GameMenu } from "./GameMenu";
import { Marketplace, ShopIcon } from "./Marketplace";
import { localAppearance } from "../state/cosmeticAppearance";
import { useCollection } from "./useMarketplace";
import { TWO_COLUMNS, useMediaQuery } from "./useMediaQuery";
import { DocumentIcon, FlagIcon, GearIcon, HomeIcon, RestartIcon, TrophyIcon } from "./icons";
import { FocusOffer, FocusToggle } from "./FocusToggle";
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
import { SideIntro, useGameNumber } from "./SideIntro";
import { AiRecordDialog, useAiStats } from "./AiRecordDialog";
import { useVsAiRecord } from "./vsAiRecord";
import { useAbandonTimer } from "./abandonTimer";
import { useAbandonReport } from "./conduct";
import { AbandonDialog, useSuspendedNotice } from "./ConductDialogs";

// After an abandoned game the popup waits a little longer than the result
// panel, so the AI's last line ("I reported you") is read first (D85).
export const ABANDON_POPUP_EXTRA_MS = 2_200;

interface AppProps {
  initial?: GameOptions | undefined; // the first game's setup
  onMenu?: () => void; // shows a Menu button that leaves the game
  onAiLevel?: (level: AiLevel) => void; // told when a level is chosen (to remember it)
}

// Thin shell: reads state, renders it, forwards clicks.
// Layout: the board column (opponent card, board, your card) and a sidebar
// (title, mode, status, history, controls). See styles.css for the layout.
export function App({ initial, onMenu, onAiLevel }: AppProps) {
  const collection = useCollection();
  const game = useGame(initial);
  const { state, retryAi, goHistory } = game;
  const appearance = useMemo(() => localAppearance(collection, state.humanSide), [collection, state.humanSide]);
  useGamePresence(state);
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
  // A tap on the board starts the abandon minute again (D85); set below.
  const touchAbandon = useRef<() => void>(() => {});
  const click = useCallback(
    (position: Position) => {
      touchAbandon.current();
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
  // How the game ended: the winner, or a draw (D89); null while it goes on.
  const over = isGameOver(state);
  const ending = state.winner ?? (state.drawn ? "draw" : null);
  const durationMs = useGameDuration(state.movesPlayed, ending);
  const result = useResultPopup(ending, state.lastMove, state.abandoned ? ABANDON_POPUP_EXTRA_MS : 0);
  const shown = displayedPosition(state);
  // Your pieces are always at the bottom (D81): the AI's colour on top
  // against the AI, White on top in two player games.
  const topSide = state.mode === "vs-ai" ? aiSideOf(state) : "white";
  // A new number for every new game, for the colour banner (D81).
  const gameKey = useGameNumber(state.history[0]!);
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
  // The AI's colour in this game: random against the AI (D81).
  const aiSide = aiSideOf(state);
  const why = useAiExplanation(state.mode, shown, aiSide);
  const [askLevel, setAskLevel] = useState(false);
  // The move list only changes when the history does (DEV-010).
  const moves = useMemo(() => moveList(state), [state.history]);
  const moveNameOf = useCallback((item: MoveListItem) => nameOf(state.mode, item.player, aiSide), [state.mode, aiSide]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
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
  useHistoryKeys(goHistory, !result.open && !why.open && !askLevel && !rulesOpen && !termsOpen && !leaderboardOpen && !profileOpen && !shopOpen && !gating);
  const loseQuestion = (what: string) => (inProgress ? `${what} The current game will be lost.` : undefined);

  // Switching to "Play vs AI" first asks for the AI's level.
  // A suspended account (D85) is told so before the level question.
  const [notifySuspended, suspendedNotice] = useSuspendedNotice();
  const chooseMode = useCallback(
    (mode: GameMode) => (mode !== "vs-ai" ? setMode(mode) : notifySuspended() ? undefined : setAskLevel(true)),
    [setMode, notifySuspended],
  );
  const openRules = useCallback(() => setRulesOpen(true), []);
  const openTerms = useCallback(() => setTermsOpen(true), []);
  const openLanguage = useCallback(() => setLanguageOpen(true), []);
  // Resign (Change 4): the player against the AI, otherwise the side to move.
  const resignQuestion =
    state.mode === "vs-ai" ? "Resign this game? The AI wins." : `Resign this game? ${state.currentPlayer === "black" ? "White" : "Black"} wins.`;
  // Focus mode (D88): the big board, the cards and the AI only; remembered
  // on this device. Its action bar is gone, so New game and Resign (Result
  // once the game is over) move to the top of the Menu, with the same
  // questions as on the bar.
  const focus = useSettings().view.focus;
  const setFocus = useCallback((on: boolean) => settingsStore().update((s) => ({ ...s, view: { focus: on } })), []);
  const focusItems = focus
    ? [
        { label: "New game", icon: <RestartIcon />, onSelect: newGame, confirm: inProgress ? "Start a new game? The current game will be lost." : undefined },
        !over
          ? { label: "Resign", icon: <FlagIcon />, onSelect: resign, confirm: resignQuestion }
          : { label: "Result", icon: <TrophyIcon />, onSelect: result.reopen },
      ]
    : [];
  // New game and Resign are on the action bar, not in the Menu (D50),
  // except in focus mode.
  const menuItems = useMemo(
    () => [
      ...focusItems,
      // The same symbols as the home menu where it has one.
      { label: "How to play", icon: <LbCrown jewel="#e9a92c" />, onSelect: openRules },
      { label: "Leaderboard", icon: <LbTrophy />, onSelect: () => setLeaderboardOpen(true) },
      { label: "Shop", icon: <ShopIcon />, onSelect: () => setShopOpen(true) },
      { label: "Profile", icon: <PersonIcon />, onSelect: () => notifySuspended(() => setProfileOpen(true)) || setProfileOpen(true) },
      { label: "Settings", icon: <GearIcon />, onSelect: () => setSettingsOpen(true) },
      { label: "Terms and notices", icon: <DocumentIcon />, onSelect: openTerms },
      ...(onMenu ? [{ label: "Main menu", icon: <HomeIcon />, onSelect: onMenu, confirm: loseQuestion("Back to the main menu?") }] : []),
    ],
    [inProgress, openRules, openTerms, onMenu, notifySuspended, focus, over, resignQuestion, newGame, resign, result.reopen],
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
  const covered = menuOpen || consent !== null || termsOpen || rulesOpen || askLevel || languageOpen || result.open || why.open || leaderboardOpen || profileOpen || shopOpen || gating;
  const playerTurn = state.aiPhase === "idle" && !over && state.viewIndex === null && state.currentPlayer === state.humanSide;
  // Idle lines keep coming while the player taps or picks up a piece; only
  // their move stops them (D82). The resign pressure still waits.
  const personality = usePersonality(state, playerTurn && !covered, startedMove);
  // The abandon minute (D85): on the player's turn against the AI, while the
  // game is on screen; any tap on the board starts it again. Then the AI
  // reports the player, once per game.
  const pageVisible = usePageVisible();
  touchAbandon.current = useAbandonTimer(state.mode === "vs-ai" && playerTurn && !covered && pageVisible, state.aiRequestId, game.abandon);
  const abandonOutcome = useAbandonReport(state);
  // The AI's line appears after its piece has landed: until then, the typing
  // dots stay (the same bubble, so nothing flickers). Worked out during the
  // render from the move's animation key, so no effect (the bubble's pop, the
  // voice) ever sees the line early.
  const settings = useSettings();
  const animatedLevel = settings.animation.level;
  const aiLanding =
    state.mode === "vs-ai" &&
    state.viewIndex === null &&
    state.history[state.history.length - 1]?.player === aiSide &&
    moveKey > 0 &&
    state.lastMove !== null &&
    state.lastMove !== landedMove &&
    (animatedLevel === "standard" || animatedLevel === "cinematic");
  const localBubble = aiLanding
    ? { key: `thinking-${state.aiRequestId}`, text: null, tone: "banter" as const, why: false }
    : reactionBubble(state, personality);
  const bubble = useRemoteBubble(state, localBubble, gameKey > 1);
  const remoteEndText = useRemoteLine(state, `end-${state.history.length}`, personality.end?.line.text ?? null, over && state.mode === "vs-ai");
  const endAiLine = personality.end ? { ...personality.end.line, text: remoteEndText ?? "" } : undefined;
  // The action bar's fourth button: Resign during a game, Result after it.
  const endAction: EndAction =
    !over
      ? { kind: "resign", question: resignQuestion, highlight: personality.hintActive, onResign: resign }
      : { kind: "result", onShow: result.reopen };
  // Sounds and vibrations that follow from what is on screen.
  const sheets = [menuOpen && "menu", why.open && "why", termsOpen && "terms", rulesOpen && "rules", languageOpen && "language", askLevel && "level", settingsOpen && "settings", leaderboardOpen && "leaderboard", shopOpen && "shop", (profileOpen || gating) && "profile"]
    .filter(Boolean)
    .join(" ");
  useGameFeedback({ state, resultOpen: result.open, sheets, bubble: result.open ? null : bubble });
  // The AI's voice reads what is on screen (only what the player chose).
  const endLine = result.open && state.mode === "vs-ai" ? (endAiLine?.text ?? null) : null;
  const whyText =
    why.open && why.explanation ? [...why.explanation.facts.map((fact) => fact.text), why.explanation.reason ?? ""].join(" ") : null;
  useVoice({ bubble: result.open ? null : bubble, level: state.aiLevel, startedMove, endLine, why: whyText });
  const speakTips = useSpeakTips(state.aiLevel);
  // The AI under the board (D64b): its robot with its mood and its bubble.
  // Chat lines can be hidden (Settings; the AI's voice says the same either
  // way), and then only the robot shows.
  const showBubbles = settings.chat.bubbles;
  // The robot types its next ask with its thinking face, and laughs while
  // the ask is on screen (D69, D70).
  // After the game, the AI's last words stay in its bubble (D71); not read
  // out again (the result panel did).
  const lastWords =
    over && state.viewIndex === null && personality.end
      ? { key: `end-${state.history.length}`, text: endAiLine!.text || null, tone: personality.end.line.tone, why: false, announce: false }
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
  const reaction = aiMood(state, aiSide === "white" ? 1 - chance : chance);
  // Results and multi-capture surprise survive the AI's landing and UI
  // overlays; opening its record must not turn a defeated robot cheerful.
  const mood = over || reaction === "alarmed" || reaction === "shocked"
    ? reaction
    : aiLanding
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
          : reaction;

  // One column (phones, tablets, narrow windows): the action bar is fixed to
  // the bottom and Menu moves to the top right. Two columns keep it in the bar.
  const twoColumns = useMediaQuery(TWO_COLUMNS);
  const gameMenu = <GameMenu items={menuItems} setup={setup} onOpenChange={setMenuOpen} />;
  // The left slot of the top bar turns focus mode on (the big screen symbol)
  // and, in focus mode, off again (the small screen symbol), with a hint
  // beside it once the game is over; the Menu stays top right.
  const focusButton = <FocusToggle focus={focus} onChange={setFocus} gameOver={over && !result.open} gameKey={gameKey} />;
  // Focus mode is offered at the start of a game outside it, until the
  // player's first move or Not now (then not again in this game).
  const playerMoved = state.mode === "vs-ai" ? state.history.some((entry) => entry.player === state.humanSide) : state.movesPlayed > 0;
  const [offerClosedFor, setOfferClosedFor] = useState<number | null>(null);
  const offer =
    !focus && !over && !playerMoved && offerClosedFor !== gameKey ? (
      <FocusOffer onFocus={() => setFocus(true)} onClose={() => setOfferClosedFor(gameKey)} />
    ) : null;
  // In focus mode Resign is a small flag in a card, after "Your turn" (the
  // owner's choice): your card against the AI, the side to move's card in a
  // two player game. It is in the Menu as well.
  const focusResign =
    focus && !over ? <ResignButton compact question={resignQuestion} highlight={personality.hintActive} onResign={resign} /> : null;
  const muteChat = useCallback(() => settingsStore().update((s) => ({ ...s, chat: { bubbles: !s.chat.bubbles } })), []);

  return (
    <main className={`app${state.mode === "vs-ai" ? " app-ai" : ""}${focus ? " app-focus" : ""}`}>
      <header className="topbar">
        <TopBar title="Checkervia" lead={focusButton} action={twoColumns && !focus ? undefined : gameMenu} />
        <ModeSelector mode={state.mode} needsConfirmation={inProgress} onChange={chooseMode} />
      </header>

      <section className="game" aria-label="Game">
        {cardFor(state, shown.board, topSide, "top", topSide === aiSide ? openLanguage : undefined, mood, null, state.mode === "two-player" && state.currentPlayer === topSide ? focusResign : undefined)}
        <div className="board-area">
          <Board view={boardViewOf(state, shown, moveKey)} appearance={appearance} onSquareClick={click} onMoveBeat={onMoveBeat} onMoveLock={onMoveLock} />
          {!focus && <WinChanceBar chance={chance} black={nameOf(state.mode, "black", aiSide)} white={nameOf(state.mode, "white", aiSide)} bottom={opponentOf(topSide)} />}
          {!twoColumns && offer}
          {state.mode === "vs-ai" && <SideIntro key={gameKey} side={state.humanSide} played={state.history.some((entry) => entry.player === state.humanSide)} />}
        </div>
        {cardFor(state, shown.board, opponentOf(topSide), "bottom", undefined, undefined, portrait, state.mode === "vs-ai" || state.currentPlayer !== topSide ? focusResign : undefined)}
      </section>

      <aside className="sidebar">
        <StatusBar
          currentPlayer={state.currentPlayer}
          winner={state.winner}
          drawn={state.drawn !== null}
          winReason={winReasonOf(state)}
          choosingRoute={state.pendingRoutes.length > 0}
          aiPhase={state.aiPhase}
          aiFailureReasons={state.aiFailureReasons}
          onRetryAi={retryAi}
        />
        {state.mode === "vs-ai" && (
          <AiCoach
            message={coachLine}
            mood={mood}
            whyOpen={why.open}
            onWhy={why.toggleWhy}
            onAvatar={openRecord}
            mute={focus ? { muted: !showBubbles, onToggle: muteChat } : undefined}
          />
        )}
        {twoColumns && offer}
        {state.mode === "vs-ai" && recordOpen && <AiRecordDialog ai={aiStats} mine={myRecord} level={state.aiLevel} gameOver={over} onClose={closeRecord} />}
        {!focus && <HistoryControls index={shown.index} total={shown.total} live={shown.live} moves={moves} nameOf={moveNameOf} onGo={goHistory} />}
        {!focus && (
          <ActionBar
            menu={twoColumns ? gameMenu : undefined}
            canBack={canGoBack(state)}
            canForward={canGoForward(state)}
            onGo={goHistory}
            end={endAction}
            needsConfirmation={inProgress}
            onNewGame={newGame}
          />
        )}
      </aside>

      {state.winner && result.open && state.abandoned && <AbandonDialog outcome={abandonOutcome} onClose={result.close} />}
      {over && result.open && !state.abandoned && (
        <ResultDialog
          winner={state.winner}
          mode={state.mode}
          aiSide={aiSide}
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
          aiLine={endAiLine}
          tips={state.mode === "vs-ai" && state.winner === aiSide ? (personality.end?.tips ?? null) : undefined}
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
      {suspendedNotice}
      {leaderboardOpen && <LeaderboardScreen onClose={() => setLeaderboardOpen(false)} onOwnProfile={() => setProfileOpen(true)} />}
      {shopOpen && <Marketplace onClose={() => setShopOpen(false)} />}
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
