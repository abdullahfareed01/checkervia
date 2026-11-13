import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { MenuIcon } from "./icons";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  // When set, ask this question first (for actions that lose the game).
  confirm?: string | undefined;
}

// Runs a choice made in the Menu sheet: closes the sheet, and asks
// `question` first when it is set.
export type MenuRun = (question: string | undefined, action: () => void) => void;

interface GameMenuProps {
  items: readonly MenuItem[];
  // Controls at the top of the sheet (the game's mode and level).
  setup?: ((run: MenuRun) => ReactNode) | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined; // the Menu opened or closed
}

// The Menu button, first in the action bar (D50). It opens a sheet with the
// mode and level controls and the actions that are not on the bar (How to
// play, Terms, Main menu): a panel above the button on wide screens, a
// bottom sheet on phones. Actions that would lose a game ask first.
export const GameMenu = memo(function GameMenu({ items, setup, onOpenChange }: GameMenuProps) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<{ question: string; run: () => void } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => onOpenChange?.(open || asking !== null), [open, asking]);

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

  const run: MenuRun = (question, action) => {
    setOpen(false);
    if (question) setAsking({ question, run: action });
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
        <div className="menu-list menu-sheet" role="dialog" aria-label="Menu">
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
