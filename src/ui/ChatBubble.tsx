import { useEffect, useState } from "react";
import { hasAdultWords } from "../ai/language";
import { WHY_PANEL_ID } from "./WhyContent";

// What the line is about (Change 3): a "Your slip" label after the player's
// blunder (the bubble itself stays neutral, owner's review), green after a
// great move, a neutral surface for plain banter. Separately, a line with
// 18+ words is shown in red text.
export type BubbleTone = "roast" | "respect" | "banter";

// One thing the AI says. `text: null` shows the typing dots.
export interface BubbleMessage {
  readonly key: string; // a new key is a new message
  readonly text: string | null; // plain text, never HTML
  readonly tone: BubbleTone;
  readonly why: boolean; // offer "Why?" (only for the AI's moves)
  // false: shown but not read out by screen readers (later idle lines, so
  // the AI does not interrupt every 30 seconds). Default: read out once.
  readonly announce?: boolean;
}

const TONE_LABELS: Partial<Record<BubbleTone, string>> = { roast: "Your slip", respect: "Respect" };

interface ChatBubbleProps {
  message: BubbleMessage | null;
  // "card": under the AI card (every screen but landscape phones);
  // "side": at the top of the side panel, next to the card.
  placement: "card" | "side";
  whyOpen?: boolean;
  onWhy?: (() => void) | undefined;
}

// The AI's chat bubble in a slot of fixed height, tied to the AI card with a
// tail pointing at its avatar. The slot is always there in a game against
// the AI, so the board never moves when a line comes or goes. Long lines are
// clipped to whole lines (3 on phones, 2 on larger screens) by CSS. A
// separate screen reader live region announces each new line once.
export function ChatBubble({ message, placement, whyOpen = false, onWhy }: ChatBubbleProps) {
  const announcement = useAnnouncement(message);
  const label = message ? TONE_LABELS[message.tone] : undefined;

  return (
    <div className={`speech-slot speech-slot-${placement}`}>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {message && (
        <div key={message.key} className={`speech ${toneClasses(message)}`}>
          {message.text === null ? (
            <p className="speech-typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </p>
          ) : (
            <>
              <p className="speech-line">
                {label && <span className="speech-label">{label}</span>}
                {message.text}
              </p>
              {message.why && onWhy && (
                <button
                  type="button"
                  className="speech-why"
                  aria-expanded={whyOpen}
                  aria-controls={WHY_PANEL_ID}
                  onClick={onWhy}
                >
                  Why?
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A bubble's tone class, plus red text when the line has 18+ words. */
export function toneClasses(message: { tone: BubbleTone; text: string | null }): string {
  const adult = message.text !== null && hasAdultWords(message.text);
  return `speech-${message.tone}${adult ? " speech-adult" : ""}`;
}

// The text for the live region: each new line once (typing dots are not
// announced, the status line already says the AI is thinking; lines marked
// `announce: false` are shown only).
function useAnnouncement(message: BubbleMessage | null): string {
  const [text, setText] = useState(message?.announce !== false ? (message?.text ?? "") : "");
  useEffect(() => {
    if (message?.text && message.announce !== false) setText(message.text);
  }, [message?.key, message?.text, message?.announce]);
  return text;
}
