// The 2 Players sheet (D92): a bottom sheet on phones, a panel in the
// middle on larger screens, in the leather and gold of the game's Menu.
// - choose: Same screen (the two player game as before) or Online with a friend.
// - online: Create a room, or Join with a code.
// - join: the code field (a shared link opens here with the code filled in
//   and sent at once).
// Making or joining a room hands the room to the caller.
import { useEffect, useId, useRef, useState } from "react";
import type { RoomView } from "../../online/protocol";
import { MenuCard } from "../Home";
import { BackIcon, TwoPlayersIcon } from "../icons";
import { CloseIcon, LbGradients } from "../leaderboard/lbIcons";
import { JoinForm } from "./JoinForm";
import { GlobeIcon, KeyIcon, PlusIcon } from "./onlineIcons";
import { roomApi } from "./roomApi";
import { createProblemText } from "./roomErrors";

export type SheetStep = { kind: "choose" } | { kind: "online" } | { kind: "join"; code: string; autoJoin: boolean };

interface TwoPlayerSheetProps {
  step: SheetStep;
  onStep: (step: SheetStep) => void;
  onSameScreen: () => void;
  onOnline: () => void; // asks for a connection and a profile first, then shows the online step
  onRoom: (room: RoomView) => void;
  onClose: () => void;
}

const TITLES: Record<SheetStep["kind"], string> = { choose: "2 Players", online: "Play with a friend", join: "Join a room" };

export function TwoPlayerSheet({ step, onStep, onSameScreen, onOnline, onRoom, onClose }: TwoPlayerSheetProps) {
  const ids = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), [step.kind]);
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setProblem(null), [step.kind]);

  const create = async () => {
    setCreating(true);
    setProblem(null);
    const result = await roomApi.create();
    setCreating(false);
    if (result.kind === "ok") onRoom(result.value.room);
    else setProblem(createProblemText(result));
  };
  const back = step.kind === "join" ? () => onStep({ kind: "online" }) : step.kind === "online" ? () => onStep({ kind: "choose" }) : null;

  return (
    <div className="result-backdrop online-backdrop" onClick={onClose}>
      <div
        className="online-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) onClose();
        }}
      >
        <LbGradients />
        <div className="online-sheet-head">
          {back ? (
            <button type="button" className="menu-sheet-close" aria-label="Back" onClick={back}>
              <BackIcon />
            </button>
          ) : (
            <span className="online-sheet-space" aria-hidden="true" />
          )}
          <h2 id={`${ids}-title`} className="menu-sheet-title online-sheet-title">
            {TITLES[step.kind]}
          </h2>
          <button ref={closeRef} type="button" className="menu-sheet-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {step.kind === "choose" && (
          <div className="online-choices">
            <MenuCard icon={<TwoPlayersIcon />} label="Same screen" hint="Two people take turns on this device." onClick={onSameScreen} />
            <MenuCard className="online-card-friend" icon={<GlobeIcon />} label="Online with a friend" hint="Each on your own device, with a room code." onClick={onOnline} />
          </div>
        )}

        {step.kind === "online" && (
          <div className="online-choices">
            <MenuCard
              icon={creating ? <span className="spinner" aria-hidden="true" /> : <PlusIcon />}
              label={creating ? "Making your room…" : "Create a room"}
              hint="Get a code to send to your friend."
              onClick={() => void (creating ? undefined : create())}
            />
            <MenuCard icon={<KeyIcon />} label="Join with a code" hint="Your friend made a room? Type its code." onClick={() => onStep({ kind: "join", code: "", autoJoin: false })} />
            <p className="online-note" role={problem ? "alert" : undefined}>
              {problem ?? "Online games never count on the leaderboard or in the AI's record."}
            </p>
          </div>
        )}

        {step.kind === "join" && <JoinForm initialCode={step.code} autoJoin={step.autoJoin} onJoined={onRoom} />}
      </div>
    </div>
  );
}
