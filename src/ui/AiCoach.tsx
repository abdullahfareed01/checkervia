import { memo } from "react";
import type { AiMood } from "./aiMood";
import { ChatBubble } from "./ChatBubble";
import type { BubbleMessage } from "./ChatBubble";
import { RobotFace } from "./RobotFace";

interface AiCoachProps {
  message: BubbleMessage | null;
  mood: AiMood;
  whyOpen: boolean;
  onWhy: () => void;
}

// The AI under the board (D64), as on chess.com: its robot on the left,
// showing its mood, and its chat bubble beside it with the tail pointing at
// it. It replaces the bubble that sat between the AI card and the board,
// and the "AI played ... Why?" note. The row keeps one height, so nothing
// under it moves when a line comes or goes.
export const AiCoach = memo(function AiCoach({ message, mood, whyOpen, onWhy }: AiCoachProps) {
  return (
    <section className="coach" aria-label="AI">
      <div className={`coach-avatar coach-avatar-${mood}`} aria-hidden="true">
        <RobotFace mood={mood} />
      </div>
      <ChatBubble message={message} whyOpen={whyOpen} onWhy={onWhy} />
    </section>
  );
});

/**
 * What the bubble shows, with chat lines on (Settings): the chat line, or
 * once the game is over the AI's last words (D71), the line the result
 * panel showed, so they stay under the board after the panel closes. No
 * "I played D4 → F2." line (D65).
 */
export function coachMessage(chat: BubbleMessage | null, chatOn: boolean, lastWords: BubbleMessage | null): BubbleMessage | null {
  return chatOn ? (chat ?? lastWords) : null;
}
