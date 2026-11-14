// The flag choice (D61): a button that opens a searchable list of countries,
// as a bottom sheet on phones and a popover on wider screens. Nothing is
// chosen for the player: the value starts empty until they pick a country
// or "Prefer not to show a flag".
//
// Keyboard: on the button, Enter, Space, the arrow keys or typing a letter
// open the list (the letter starts the search). In the list, the search box
// keeps the focus; the arrow keys, Home and End move through the options,
// Enter chooses, Escape and Tab close. The options are a listbox, the search
// box a combobox pointing at the active option.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { COUNTRY_NAMES } from "../../leaderboard/countries";
import { NO_COUNTRY } from "../../leaderboard/protocol";
import { Flag, countryName } from "./Flag";

export const NO_FLAG_LABEL = "Prefer not to show a flag";

// Countries sorted by their names, once, after the "no flag" choice.
const OPTIONS: readonly { value: string; name: string }[] = [
  { value: NO_COUNTRY, name: NO_FLAG_LABEL },
  ...Object.entries(COUNTRY_NAMES)
    .sort(([, a], [, b]) => a.localeCompare(b, "en"))
    .map(([value, name]) => ({ value, name })),
];

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The options whose name (or code) matches the search, names starting with it first. */
export function matchCountries(query: string): readonly { value: string; name: string }[] {
  const wanted = plain(query.trim());
  if (wanted === "") return OPTIONS;
  const starts = OPTIONS.filter((option) => plain(option.name).startsWith(wanted) || option.value.toLowerCase() === wanted);
  const contains = OPTIONS.filter((option) => !starts.includes(option) && plain(option.name).includes(wanted));
  return [...starts, ...contains];
}

/** The words for a chosen value: a country's name, the "no flag" choice, or nothing yet. */
export function choiceLabel(value: string | null): string {
  if (value === null) return "Choose a country";
  return value === NO_COUNTRY ? NO_FLAG_LABEL : countryName(value);
}

export type SearchKeyAction =
  | { readonly kind: "move"; readonly index: number }
  | { readonly kind: "choose" }
  | { readonly kind: "close"; readonly focusButton: boolean };

/**
 * What a key in the search box does: the arrow keys, Page Up and Down move
 * the active option (Home and End too, while the search is empty, else they
 * move the text cursor); Enter chooses; Escape closes back to the button;
 * Tab closes and lets the focus move on. Anything else types into the search.
 */
export function searchKeyAction(key: string, active: number, count: number, query: string): SearchKeyAction | null {
  const last = Math.max(0, count - 1);
  const to = (index: number): SearchKeyAction => ({ kind: "move", index: Math.max(0, Math.min(last, index)) });
  if (key === "ArrowDown") return to(active + 1);
  if (key === "ArrowUp") return to(active - 1);
  if (key === "PageDown") return to(active + 8);
  if (key === "PageUp") return to(active - 8);
  if (key === "Home" && query === "") return to(0);
  if (key === "End" && query === "") return to(last);
  if (key === "Enter") return count > 0 ? { kind: "choose" } : null;
  if (key === "Escape") return { kind: "close", focusButton: true };
  if (key === "Tab") return { kind: "close", focusButton: false };
  return null;
}

/** Whether a key pressed on the closed button opens the list (a letter also starts the search). */
export function opensOnKey(key: string, modifier: boolean): "open" | "search" | null {
  if (key === "ArrowDown" || key === "ArrowUp") return "open";
  return key.length === 1 && /\S/.test(key) && !modifier ? "search" : null;
}

// How far the phone keyboard covers the page, so the sheet sits above it.
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return undefined;
    const update = () => setInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);
  return inset;
}

interface CountryPickerProps {
  value: string | null; // a code, "none", or null before a choice
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Starts open (for tests of the open list). */
  initiallyOpen?: boolean;
}

export function CountryPicker({ value, onChange, label = "Country", disabled = false, invalid = false, initiallyOpen = false }: CountryPickerProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ids = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => matchCountries(query), [query]);
  const inset = useKeyboardInset(open);

  const show = (startQuery = "") => {
    if (disabled) return;
    setQuery(startQuery);
    const selected = startQuery === "" ? OPTIONS.findIndex((option) => option.value === value) : 0;
    setActive(Math.max(0, selected));
    setOpen(true);
  };
  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus({ preventScroll: true });
  };
  const choose = (option: { value: string } | undefined) => {
    if (!option) return;
    onChange(option.value);
    close();
  };

  // The search box takes the focus; on wide screens the popover is scrolled into view.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);
  // The active option stays in view.
  useEffect(() => {
    if (!open) return;
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    element?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, options]);

  const onButtonKey = (event: KeyboardEvent) => {
    const opens = opensOnKey(event.key, event.ctrlKey || event.metaKey || event.altKey);
    if (opens === null) return;
    event.preventDefault();
    show(opens === "search" ? event.key : "");
  };

  const onSearchKey = (event: KeyboardEvent) => {
    const action = searchKeyAction(event.key, active, options.length, query);
    if (action === null) return;
    if (action.kind === "close" && !action.focusButton) {
      close(false);
      return;
    }
    event.preventDefault();
    if (action.kind === "move") setActive(action.index);
    else if (action.kind === "choose") choose(options[active]);
    else {
      event.stopPropagation();
      close();
    }
  };

  const listId = `${ids}-list`;
  const labelId = `${ids}-label`;
  const optionId = (index: number) => `${ids}-option-${index}`;
  const chosen = value !== null && value !== NO_COUNTRY ? value : null;

  return (
    <div className={`cp${open ? " cp-open" : ""}`}>
      <span id={labelId} className="lb-field-label">
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        className={`cp-button${value === null ? " cp-button-empty" : ""}${invalid ? " cp-button-invalid" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${ids}-value`}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
      >
        <Flag code={chosen} decorative />
        <span id={`${ids}-value`} className="cp-value">
          {choiceLabel(value)}
        </span>
        <svg className="cp-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          <div className="cp-backdrop" onClick={() => close()} aria-hidden="true" />
          <div ref={panelRef} className="cp-panel" role="dialog" aria-label={`Choose your ${label.toLowerCase()}`} style={inset > 0 ? { bottom: inset } : undefined}>
            <div className="cp-panel-head">
              <span className="cp-grip" aria-hidden="true" />
              <input
                ref={searchRef}
                className="cp-search"
                type="text"
                role="combobox"
                aria-label="Search countries"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
                placeholder="Search countries"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="done"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKey}
              />
            </div>
            <ul ref={listRef} id={listId} className="cp-list" role="listbox" aria-label={label}>
              {options.map((option, index) => {
                const selected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    className={`cp-option${index === active ? " cp-option-active" : ""}${selected ? " cp-option-selected" : ""}`}
                    onMouseMove={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    <Flag code={option.value === NO_COUNTRY ? null : option.value} decorative />
                    <span className="cp-option-name">{option.name}</span>
                    {selected && (
                      <svg className="cp-check" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </li>
                );
              })}
              {options.length === 0 && (
                <li className="cp-empty" role="presentation">
                  No country matches “{query}”.
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
