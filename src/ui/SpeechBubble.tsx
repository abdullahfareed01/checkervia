import { useEffect, useState } from "react";

// One thing the AI says. `text: null` shows the typing dots (it is thinking).
export interface SpeechMessage {
  readonly key: string; // a new key is a new message
  readonly text: string | null;
  // An optional first line, e.g. the AI's reaction to the player's move.
  readonly lead?: string | undefined;
  readonly leadTone?: "tease" | "praise" | "banter" | undefined;
}

interface SpeechBubbleProps {
  // What the AI is saying now, or null for nothing (the bubble animates out).
  message: SpeechMessage | null;
  // Faded and click-through while the player is choosing a move, so the
  // board under it stays visible and usable.
  faded?: boolean;
  // Gone at once, e.g. while the result popup is open.
  hidden?: boolean;
  // Shows a "Why?" link for a message (the AI's reason).
  onWhy?: (() => void) | undefined;
}

// How long the exit animation runs; keep in step with aiReason.css.
export const LEAVE_MS = 200;

/**
 * How long a message stays if the player does not move: enough to read it
 * comfortably, then it gets out of the way. Playing a move removes it sooner.
 */
export function bubbleTimeMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(40_000, Math.max(20_000, 10_000 + words * 800));
}

// A speech bubble from the AI, under its player card with the tail pointing
// at the robot. It pops in, swaps to a new message in place (typing dots
// become the reason), and shrinks away when the message is gone, when its
// time is up, or when closed. Built to be reused for the AI's reactions to
// the player's moves later.
export function SpeechBubble({ message, faded = false, hidden = false, onWhy }: SpeechBubbleProps) {
  // The message on screen; kept during the exit animation after `message`
  // has become null.
  const [shown, setShown] = useState<SpeechMessage | null>(message);
  const [leaving, setLeaving] = useState(false);
  const [closedKey, setClosedKey] = useState<string | null>(null);

  // Follow the incoming message; animate out when it goes away.
  useEffect(() => {
    if (message) {
      setShown(message);
      setLeaving(false);
      return undefined;
    }
    setLeaving(true);
    const timer = setTimeout(() => setShown(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [message?.key, message?.text]);

  // A message (not the typing dots) leaves by itself after its time.
  useEffect(() => {
    if (!shown || shown.text === null) return undefined;
    const timer = setTimeout(() => close(shown.key), bubbleTimeMs(`${shown.lead ?? ""} ${shown.text}`));
    return () => clearTimeout(timer);
  }, [shown?.key, shown?.text, shown?.lead]);

  function close(key: string) {
    setLeaving(true);
    setTimeout(() => setClosedKey(key), LEAVE_MS);
  }

  if (hidden || !shown || closedKey === shown.key) return null;

  const classes = ["speech", leaving && "speech-leaving", faded && "speech-faded"].filter(Boolean).join(" ");
  return (
    <div className={classes} role="status" aria-live="polite">
      <div className="speech-body">
        <span className="speech-from">AI</span>
        {shown.text === null ? (
          <p className="speech-typing" aria-label="The AI is thinking">
            <span />
            <span />
            <span />
          </p>
        ) : (
          // Keyed, so each new message fades in on its own.
          <div key={shown.key} className="speech-text">
            {shown.lead && <p className={`speech-lead speech-lead-${shown.leadTone ?? "tease"}`}>{shown.lead}</p>}
            <p className="speech-line">{shown.text}</p>
          </div>
        )}
        {shown.text !== null && (
          <div className="speech-actions">
            {onWhy && (
              <button type="button" className="speech-why" onClick={onWhy}>
                Why?
              </button>
            )}
            <button type="button" className="speech-close" aria-label="Close" onClick={() => close(shown.key)}>
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
