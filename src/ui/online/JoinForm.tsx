// Join with a code (D92): one large field, capitals as you type, paste
// friendly (spaces, dashes and small letters are tidied away), 16px or more
// so iPhones do not zoom in. A shared link fills it in and joins at once.
import { useEffect, useId, useRef, useState } from "react";
import { isRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from "../../online/protocol";
import type { RoomView } from "../../online/protocol";
import { roomApi } from "./roomApi";
import { roomProblemText } from "./roomErrors";

export function JoinForm({ initialCode, autoJoin, onJoined }: { initialCode: string; autoJoin: boolean; onJoined: (room: RoomView) => void }) {
  const ids = useId();
  const [code, setCode] = useState(normalizeRoomCode(initialCode));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const join = async (value: string) => {
    if (!isRoomCode(value)) {
      setProblem("That is not a room code. A code has 6 letters and numbers.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await roomApi.join(value);
    setBusy(false);
    if (result.kind === "ok") onJoined(result.value.room);
    else setProblem(roomProblemText(result));
  };

  const started = useRef(false);
  useEffect(() => {
    if (autoJoin && !started.current && isRoomCode(code)) {
      started.current = true;
      void join(code);
    } else {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, []);

  return (
    <form
      className="online-join"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void join(code);
      }}
    >
      <label className="online-join-label" htmlFor={`${ids}-code`}>
        Room code
      </label>
      <input
        ref={inputRef}
        id={`${ids}-code`}
        className="online-code-input"
        value={code}
        onChange={(event) => {
          setCode(normalizeRoomCode(event.target.value));
          setProblem(null);
        }}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={ROOM_CODE_LENGTH + 6}
        placeholder="ABC234"
        aria-invalid={problem !== null}
        aria-describedby={`${ids}-hint`}
        disabled={busy}
      />
      <p id={`${ids}-hint`} className={`online-note${problem ? " online-note-problem" : ""}`} role={problem ? "alert" : undefined}>
        {problem ?? "Ask your friend for the 6 character code of their room."}
      </p>
      <button type="submit" className="lb-button lb-button-gold online-join-button" aria-busy={busy} disabled={busy || code.length === 0}>
        {busy ? "Joining…" : "Join room"}
      </button>
    </form>
  );
}
