// The AI's record (D75, D77): a popup that opens only when the robot's
// avatar under the board is tapped. The robot at the top with a new taunt
// in its chat bubble each time (typed first, like a chat), its record over
// every player (a win rate ring, games, wins, losses, resignations) and the
// same per level. No player's own numbers are shown. It follows the game's
// sheets: dark leather, a bronze rim, gold numbers and the Fraunces title.
import { useEffect, useId, useRef, useState } from "react";
import type { AiLevel } from "../ai/difficulty";
import { AI_LEVELS } from "../ai/difficulty";
import type { AiStatsCounts, AiStatsResponse } from "../leaderboard/protocol";
import { FlagIcon, HumanIcon, SwordsIcon, TrophyIcon } from "./icons";
import { leaderboardApi } from "./leaderboard/api";
import { RobotFace } from "./RobotFace";
import type { VsAiRecord } from "./vsAiRecord";

/** A count for small spaces: 1,234 up to 9,999, then 12.3K, 1.2M. */
export function shortCount(value: number): string {
  return value < 10_000
    ? value.toLocaleString("en-US")
    : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** The AI's share of the games it played, as a whole percent; null with no games. */
export function aiWinRate(counts: AiStatsCounts | null): number | null {
  if (!counts || counts.games === 0) return null;
  return Math.round((counts.aiWins / counts.games) * 100);
}

const n = (value: number) => value.toLocaleString("en-US");

// The last taunt shown, so the next opening says something else.
let lastTaunt: string | null = null;
const times = (value: number) => (value === 1 ? "once" : `${n(value)} times`);

/**
 * Every taunt the robot can say over its record, for this player and this
 * level. Plain words, no dashes, under 140 characters; no insults (the
 * popup is the same at every level). Only true lines (D83): a brag needs a
 * win rate of half or more, and once the game is over nothing talks about
 * a win still to come ("After this game..." was said after the player won).
 */
export function aiStatsTaunts(ai: AiStatsResponse | null, mine: VsAiRecord, level: AiLevel, gameOver = false): string[] {
  if (!ai) {
    return [
      "My record is so long it did not load, haha.",
      "The numbers are shy today. My wins are not, hehe.",
      "Impressed already? You have not even seen the numbers yet, lol.",
    ];
  }
  const wins = ai.aiWins;
  const rate = aiWinRate(ai);
  const strong = rate !== null && rate >= 50;
  const lines: string[] = [];
  if (strong) {
    lines.push(
      "Impressed with the stats? You should be, haha.",
      "Numbers do not lie. I am simply very good at this, haha.",
      `I win ${rate}% of my games. Do the math, haha.`,
    );
  } else if (rate !== null) {
    // Under half: no flexing, it pokes fun at itself instead.
    lines.push("My win rate is not my best feature. My moves might be, hehe.", "Under half? I call that warming up, lol.");
  }
  if (mine.losses > 0) lines.push(`You gave me ${n(mine.losses)} of those wins. Very kind of you, haha.`);
  if (gameOver) {
    lines.push("Checking my record after that game? Fair enough, haha.", "Read it slowly. Every number here is a real game, lol.");
    return lines;
  }
  // During the game only: the wins still to come, and the game going on.
  lines.push(
    "After this game there will be one more addition to my wins, hehe.",
    `${n(wins)} wins so far. Number ${n(wins + 1)} is sitting right in front of me, lol.`,
    "Reading my record will not help you on the board, hehe.",
    "Go on, count my wins. I will wait. Then I will add one more, hehe.",
    "Take a good long look. Then get back to losing, lol.",
  );
  if (ai.resigned > 0) lines.push(`Players resigned against me ${times(ai.resigned)}. The button is right there, lol.`);
  const here = ai.levels.find((row) => row.level === level);
  const hereRate = aiWinRate(here ?? null);
  if (here && hereRate !== null && hereRate >= 50) lines.push(`At ${AI_LEVELS[level].name} I win ${hereRate}% of my games. Good luck with that, hehe.`);
  if (mine.wins > 0) lines.push(`You beat me ${times(mine.wins)}? Enjoy it. It will not last, hehe.`);
  if (mine.games === 0) lines.push(`Want to be number ${n(wins + 1)}? Just keep playing, haha.`);
  return lines;
}

/** One taunt, never the same as the one before (when there is a choice). */
export function pickTaunt(lines: readonly string[], previous: string | null, random: () => number = Math.random): string {
  const choices = lines.length > 1 ? lines.filter((line) => line !== previous) : lines;
  return choices[Math.floor(random() * choices.length) % choices.length]!;
}

/**
 * The AI's record from the server: fetched when the game screen opens,
 * again a moment after each finished game (`finishedGames` changes) once the
 * result has been reported, and at once when `refresh` changes (the popup
 * opens). null while unknown (offline, or no server).
 */
let cached: AiStatsResponse | null = null;
export function useAiStats(finishedGames: number, refresh = 0): AiStatsResponse | null {
  const [stats, setStats] = useState<AiStatsResponse | null>(cached);
  const lastGames = useRef(finishedGames);
  useEffect(() => {
    const afterGame = lastGames.current !== finishedGames;
    lastGames.current = finishedGames;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        void leaderboardApi
          .aiStats(controller.signal)
          .then((result) => {
            if (result.kind !== "ok") return;
            cached = result.value;
            setStats(result.value);
          })
          .catch(() => {});
      },
      afterGame ? 2_500 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [finishedGames, refresh]);
  return stats;
}

/** How long the robot "types" before each taunt shows. */
export const TYPING_MS = 750;

const RING = 2 * Math.PI * 40; // the ring's circumference (radius 40)

function WinRing({ ai }: { ai: AiStatsResponse }) {
  const rate = aiWinRate(ai);
  const won = ai.games === 0 ? 0 : ai.aiWins / ai.games;
  return (
    <div className="airec-ring" role="img" aria-label={rate === null ? "No games yet." : `The AI wins ${rate}% of its games.`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="airec-ring-track" cx="50" cy="50" r="40" />
        {ai.games > 0 && <circle className="airec-ring-lost" cx="50" cy="50" r="40" />}
        <circle className="airec-ring-won" cx="50" cy="50" r="40" strokeDasharray={`${won * RING} ${RING}`} />
      </svg>
      <span className="airec-ring-text" aria-hidden="true">
        <strong>{rate === null ? "0%" : `${rate}%`}</strong>
        <span>wins</span>
      </span>
    </div>
  );
}

interface AiRecordDialogProps {
  ai: AiStatsResponse | null;
  mine: VsAiRecord; // only to choose the taunt; never shown
  level: AiLevel; // the level being played, marked in the list
  gameOver?: boolean; // opened after the game ended: no lines about wins to come (D83)
  onClose: () => void;
  random?: () => number;
}

export function AiRecordDialog({ ai, mine, level, gameOver = false, onClose, random = Math.random }: AiRecordDialogProps) {
  const ids = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [taunt, setTaunt] = useState<{ text: string; count: number }>(() => ({ text: pickTaunt(aiStatsTaunts(ai, mine, level, gameOver), lastTaunt, random), count: 0 }));
  const [typing, setTyping] = useState(true);
  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    lastTaunt = taunt.text;
    setTyping(true);
    const timer = setTimeout(() => setTyping(false), TYPING_MS);
    return () => clearTimeout(timer);
  }, [taunt]);
  // Tapping the robot or its bubble: another taunt.
  const tauntAgain = () => setTaunt((current) => ({ text: pickTaunt(aiStatsTaunts(ai, mine, level, gameOver), current.text, random), count: current.count + 1 }));

  const stats = ai
    ? [
        { key: "games", label: "Games played", value: ai.games, icon: <SwordsIcon /> },
        { key: "wins", label: "Wins", value: ai.aiWins, icon: <TrophyIcon /> },
        { key: "losses", label: "Losses", value: ai.aiLosses, icon: <HumanIcon /> },
        { key: "resigned", label: "Players resigned", value: ai.resigned, icon: <FlagIcon /> },
      ]
    : null;

  return (
    <div className="result-backdrop airec-backdrop" onClick={onClose}>
      <div
        className="dialog confirm-dialog airec"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="airec-chat">
          <button type="button" className="airec-avatar" aria-label="Hear another taunt" onClick={tauntAgain}>
            <RobotFace mood={typing ? "thinking" : "laughing"} />
          </button>
          <button type="button" className="airec-bubble" onClick={tauntAgain} aria-label={typing ? "The AI is typing" : `${taunt.text} Tap for another.`}>
            {typing ? (
              <span className="airec-typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <span key={taunt.count} className="airec-said">
                {taunt.text}
              </span>
            )}
          </button>
          <span className="sr-only" aria-live="polite">
            {typing ? "" : taunt.text}
          </span>
        </div>

        <h2 id={`${ids}-title`} className="confirm-question airec-title">
          The AI's record
        </h2>
        <p className="airec-sub">Against every player with a profile</p>

        {ai && stats ? (
          <>
            <div className="airec-main">
              <WinRing ai={ai} />
              <ul className="airec-stats">
                {stats.map((stat) => (
                  <li key={stat.key} className={`airec-stat airec-stat-${stat.key}`}>
                    <span className="airec-stat-icon" aria-hidden="true">
                      {stat.icon}
                    </span>
                    <span className="airec-stat-label">{stat.label}</span>
                    <span className="airec-stat-value">{shortCount(stat.value)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <h3 className="airec-head">By level</h3>
            <ul className="airec-levels">
              {ai.levels.map((row) => {
                const rate = aiWinRate(row);
                const current = row.level === level;
                return (
                  <li key={row.level} className={`airec-level${current ? " airec-level-now" : ""}`}>
                    <span className="airec-level-name">
                      {AI_LEVELS[row.level].name}
                      {current && <span className="airec-now">You</span>}
                    </span>
                    <span className="airec-bar" aria-hidden="true">
                      <span style={{ width: `${rate ?? 0}%` }} />
                    </span>
                    <span className="airec-level-rate">{rate === null ? "" : `${rate}%`}</span>
                    <span className="sr-only">
                      {rate === null ? ": no games yet." : ` wins, ${n(row.aiWins)} of ${n(row.games)} ${row.games === 1 ? "game" : "games"}.`}
                    </span>
                    <span className="airec-level-games" aria-hidden="true">
                      {shortCount(row.games)} {row.games === 1 ? "game" : "games"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="airec-empty">The AI's record cannot be loaded right now. Try again in a moment.</p>
        )}

        <button ref={closeRef} type="button" className="confirm-button confirm-keep airec-close" onClick={onClose}>
          Back to the game
        </button>
      </div>
    </div>
  );
}
