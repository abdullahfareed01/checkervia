// Leave room (D92): on the online game's action bar and in its Menu. It
// asks first; leaving during a game loses it.
import { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";

/** A door with an arrow going out. */
export function LeaveIcon() {
  return (
    <svg className="icon icon-leave" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14" />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
    </svg>
  );
}

export function LeaveRoomButton({ question, onLeave }: { question: string; onLeave: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className="bar-button" onClick={() => setAsking(true)}>
        <LeaveIcon />
        <span className="bar-label">Leave</span>
      </button>
      {asking && (
        <ConfirmDialog
          question={question}
          confirmLabel="Yes, leave"
          cancelLabel="Stay"
          icon={<LeaveIcon />}
          onConfirm={() => {
            setAsking(false);
            onLeave();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
