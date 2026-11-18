// Browser regression fixture only. Every AI response is mocked in this page.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createGameState, gameReducer } from "../../src/state/gameReducer";
import type { GameState } from "../../src/state/gameReducer";
import { ChatBubble } from "../../src/ui/ChatBubble";
import { reactionBubble } from "../../src/ui/bubble";
import { useRemoteBubble, useRemoteLine } from "../../src/ui/useRemoteTaunt";
import "../../src/ui/styles.css";
import "../../src/ui/bubble.css";

type Scenario = "fast" | "slow" | "invalid" | "offline" | "great" | "sweet" | "turn-echo" | "thinking" | "review" | "end";
let scenario: Scenario = "fast";
let humanSide: "black" | "white" = "white";
let calls = 0;
const contexts: unknown[] = [];
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (!String(input).includes("/.netlify/functions/ai-move")) return originalFetch(input, init);
  const current = scenario;
  calls++;
  contexts.push(JSON.parse(String(init?.body)).context);
  if (current === "offline") throw new Error("Mock offline");
  // Deliberately ignore AbortSignal to test an uncooperative late transport.
  await new Promise(resolve => setTimeout(resolve, current === "slow" ? 6500 : 80));
  const reaction = current === "invalid" ? "Your black pieces look clever." : current === "sweet" || current === "great" ? "Well played. That was clever." : current === "turn-echo" ? "Your move, rival!" : current === "end" ? "I win. Next challenger." : "Bring a real plan, amateur.";
  return new Response(JSON.stringify({ text: JSON.stringify({ reaction }) }));
};

function position(): GameState {
  let state = createGameState({ mode: "vs-ai", humanSide, aiLevel: 4 });
  if (humanSide === "black") {
    const move = state.legalMoves[0]!;
    state = gameReducer(state, { type: "click", position: move.from });
    state = gameReducer(state, { type: "click", position: move.to });
  }
  if (scenario === "thinking") return state;
  state = gameReducer(state, { type: "aiMoved", requestId: state.aiRequestId, move: state.legalMoves[0]!, reaction: "My move. Your turn!" });
  if (scenario === "great") state = { ...state, history: state.history.map((entry, index) => index === state.history.length - 1 ? { ...entry, judgement: { verdict: "great", detail: "Synthetic engine verdict for this UI fixture." } } : entry) };
  if (scenario === "review") state = { ...state, viewIndex: 0 };
  if (scenario === "end") state = gameReducer(state, { type: "resign" });
  return state;
}

function Harness() {
  const [state, setState] = useState(position);
  Object.assign(window, {
    setChatScenario: (next: Scenario, side = "white") => { scenario = next; humanSide = side as typeof humanSide; calls = 0; contexts.length = 0; flushSync(() => setState(position())); },
    chatRequests: () => ({ calls, contexts }),
    reviewChat: (review: boolean) => flushSync(() => setState(current => ({ ...current, viewIndex: review ? 0 : null }))),
  });
  const bubble = useRemoteBubble(state, reactionBubble(state), false);
  const end = useRemoteLine(state, `end-${state.history.length}`, state.winner ? "I win. Next challenger." : null, Boolean(state.winner));
  const message = state.winner ? { key: "end", text: end, tone: "banter" as const, why: false } : bubble;
  return <main style={{ width: 330, margin: "24px auto", fontFamily: "system-ui", background: "#34251b", padding: 12 }}><h1 style={{ color: "white", fontSize: 18 }}>Chat sequence regression</h1><ChatBubble message={message} onWhy={() => {}} /></main>;
}
createRoot(document.getElementById("chat-root")!).render(<StrictMode><Harness /></StrictMode>);
