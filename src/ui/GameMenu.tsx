import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { MenuIcon } from "./icons";
import { CloseIcon, LbGradients } from "./leaderboard/lbIcons";

export interface MenuItem {
  label: string;
  icon: ReactNode; // a gold symbol in a dark well, as on the home menu
  onSelect: () => void;
  // When set, ask this question first (for actions that lose the game).
  confirm?: string | undefined;
}

// Runs a choice made in the Menu sheet: closes the sheet, and asks
// `question` first when it is set.
// `icon` is the symbol on that question (an exclamation mark by default).
export type MenuRun = (question: string | undefined, action: () => void, icon?: ReactNode) => void;

interface GameMenuProps {
  items: readonly MenuItem[];
  // Controls at the top of the sheet (the game's mode and level).
  setup?: ((run: MenuRun) => ReactNode) | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined; // the Menu opened or closed
}

// The actions as tiles: a gold symbol in a dark well over the word.
export function MenuTiles({ items, run }: { items: readonly MenuItem[]; run: MenuRun }) {
  return (
    <div className="menu-tiles" role="menu" aria-label="Actions">
      {items.map((item) => (
        <button key={item.label} type="button" role="menuitem" className="menu-item menu-tile" onClick={() => run(item.confirm, item.onSelect, item.icon)}>
          <span className="menu-tile-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="menu-tile-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// The Menu button, first in the action bar (D50). It opens a sheet with the
// mode and level controls and the actions that are not on the bar (How to
// play, Terms, Main menu): a panel above the button on wide screens, a
// bottom sheet on phones. The actions are tiles with gold icons, like the
// home menu's cards, three to a row so the sheet stays short. Actions that
// would lose a game ask first.
export const GameMenu = memo(function GameMenu({ items, setup, onOpenChange }: GameMenuProps) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<{ question: string; run: () => void; icon?: ReactNode } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => onOpenChange?.(open || asking !== null), [open, asking]);
  // Keyboard users start inside the sheet.
  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Close the sheet on a click outside it or on Escape.
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

  const run: MenuRun = (question, action, icon) => {
    setOpen(false);
    if (question) setAsking({ question, run: action, icon });
    else action();
  };

  return (
    <div className="menu" ref={menuRef}>
      <button type="button" className="bar-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MenuIcon />
        <span className="bar-label">Menu</span>
      </button>
      {open && <div className="menu-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
      {open && (
        <div className="menu-list menu-sheet gold-scroll" role="dialog" aria-labelledby="menu-sheet-title">
          <LbGradients />
          <div className="menu-sheet-head">
            <h2 className="menu-sheet-title" id="menu-sheet-title">
              Menu
            </h2>
            <button ref={closeRef} type="button" className="menu-sheet-close" aria-label="Close the menu" onClick={() => setOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          {setup?.(run)}
          <MenuTiles items={items} run={run} />
        </div>
      )}
      {asking && (
        <ConfirmDialog
          question={asking.question}
          icon={asking.icon}
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
