import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { BackIcon, CrownIcon, LaurelIcon, MenuDotsIcon } from "./icons";

// The title with a crown above it and a laurel branch on each side.
export const GameTitle = memo(function GameTitle({ text, large = false }: { text: string; large?: boolean }) {
  return (
    <div className={`game-title${large ? " game-title-large" : ""}`}>
      <span className="game-title-crown">
        <CrownIcon />
      </span>
      <span className="game-title-row">
        <LaurelIcon />
        <h1>{text}</h1>
        <LaurelIcon flip />
      </span>
    </div>
  );
});

export interface MenuItem {
  label: string;
  onSelect: () => void;
  // When set, ask this question first (for actions that lose the game).
  confirm?: string | undefined;
}

// Runs a choice made in the Menu sheet: closes the sheet, and asks
// `question` first when it is set.
export type MenuRun = (question: string | undefined, action: () => void) => void;

interface TopBarProps {
  title: string;
  onBack?: (() => void) | undefined; // the back arrow (hidden without one)
  backConfirm?: string | undefined; // ask this first, if set
  items?: readonly MenuItem[]; // the Menu button's list (hidden when empty)
  // Extra controls at the top of the Menu sheet (the game's mode and level).
  setup?: ((run: MenuRun) => ReactNode) | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined; // the Menu opened or closed
}

// The bar at the top of the game and Learn screens: back arrow, title, Menu.
// The Menu opens a sheet (a panel under the button; a bottom sheet on
// phones) with the optional setup controls and a short list of actions.
// Actions that would lose a game ask first.
// Memoised: the game passes stable callbacks and a memoised item list.
export const TopBar = memo(function TopBar({ title, onBack, backConfirm, items = [], setup, onOpenChange }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<{ question: string; run: () => void } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => onOpenChange?.(open || asking !== null), [open, asking]);

  // Close the list on a click outside it or on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run: MenuRun = (question, action) => {
    setOpen(false);
    if (question) setAsking({ question, run: action });
    else action();
  };

  return (
    <div className="top-row">
      {onBack ? (
        <button type="button" className="icon-button" aria-label="Back to the main menu" onClick={() => run(backConfirm, onBack)}>
          <BackIcon />
        </button>
      ) : (
        <span className="icon-button-space" aria-hidden="true" />
      )}

      <GameTitle text={title} />

      {items.length > 0 ? (
        <div className="menu" ref={menuRef}>
          <button type="button" className="menu-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <MenuDotsIcon />
            Menu
          </button>
          {open && <div className="menu-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
          {open && (
            <div className={`menu-list${setup ? " menu-sheet" : ""}`} role="dialog" aria-label="Menu">
              {setup?.(run)}
              <div role="menu" aria-label="Actions">
                {items.map((item) => (
                  <button key={item.label} type="button" role="menuitem" className="menu-item" onClick={() => run(item.confirm, item.onSelect)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <span className="icon-button-space" aria-hidden="true" />
      )}

      {asking && (
        <ConfirmDialog
          question={asking.question}
          onConfirm={() => {
            asking.run();
            setAsking(null);
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </div>
  );
});
