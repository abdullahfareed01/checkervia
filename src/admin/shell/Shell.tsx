// The dashboard's frame (D100): the menu of sections (a side bar on wide
// screens, a sheet from the top bar on phones), the signed in admin and
// Sign out, and the chosen section. Paths are /admin/<section>, so the
// browser's back button and reloads work.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { signOut } from "../session";
import { DataSourceBar } from "./DataSourceBar";
import { Players } from "./Players";
import { Overview } from "./Overview";
import { pathOf, SECTIONS, sectionFromPath } from "./sections";
import type { Section } from "./sections";

function useSection(): [Section, (section: Section) => void] {
  const [section, setSection] = useState(() => sectionFromPath(location.pathname));
  useEffect(() => {
    const onPop = () => setSection(sectionFromPath(location.pathname));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((next: Section) => {
    if (location.pathname !== pathOf(next)) history.pushState(null, "", pathOf(next));
    setSection(next);
  }, []);
  return [section, go];
}

function NavList({ current, onGo }: { current: Section; onGo: (section: Section) => void }) {
  return (
    <ul className="adm-nav-list">
      {SECTIONS.map((section) => (
        <li key={section.id}>
          <a
            href={pathOf(section)}
            className="adm-nav-link"
            aria-current={section.id === current.id ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              onGo(section);
            }}
          >
            {section.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Account({ email }: { email: string }) {
  return (
    <div className="adm-account">
      <span className="adm-account-email" title={email}>
        {email}
      </span>
      <button type="button" className="adm-button adm-button-quiet" onClick={() => void signOut("You signed out.")}>
        Sign out
      </button>
    </div>
  );
}

/** The phone menu: a sheet over the page, which does not scroll behind it. */
function MenuSheet({ current, email, onGo, onClose }: { current: Section; email: string; onGo: (section: Section) => void; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("[aria-current=page], a")?.focus();
    document.documentElement.classList.add("adm-locked");
    return () => document.documentElement.classList.remove("adm-locked");
  }, []);
  return (
    <div className="adm-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheet}
        className="adm-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Sections"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="adm-sheet-head">
          <span className="adm-sheet-title">Sections</span>
          <button type="button" className="adm-button adm-button-quiet" onClick={onClose}>
            Close
          </button>
        </div>
        <nav aria-label="Sections">
          <NavList current={current} onGo={onGo} />
        </nav>
        <Account email={email} />
      </div>
    </div>
  );
}

function Empty({ section }: { section: Section }) {
  return (
    <section className="adm-panel adm-empty">
      <h2 className="adm-panel-title">Not built yet</h2>
      <p>{section.about}</p>
      <p className="adm-dim">This section arrives in the next phase of the dashboard.</p>
    </section>
  );
}

export function Shell({ email }: { email: string }) {
  const [section, go] = useSection();
  const [menu, setMenu] = useState(false);
  const main = useRef<HTMLElement>(null);
  const open = (next: Section) => {
    setMenu(false);
    go(next);
    main.current?.focus();
  };
  let content: ReactNode;
  if (section.id === "overview") content = <Overview email={email} onGo={open} />;
  else if (section.id === "players") content = <Players />;
  else content = <Empty section={section} />;

  return (
    <div className="adm-app">
      <a className="adm-skip" href="#adm-main">
        Skip to content
      </a>
      <aside className="adm-side">
        <div className="adm-brand">
          <img src="/art/logo.svg" alt="" width={36} height={34} />
          <span>
            Checkervia <strong>Admin</strong>
          </span>
        </div>
        <nav aria-label="Sections">
          <NavList current={section} onGo={open} />
        </nav>
        <Account email={email} />
      </aside>
      <header className="adm-top">
        <div className="adm-brand adm-brand-small">
          <img src="/art/logo.svg" alt="" width={30} height={28} />
          <span>
            <strong>Admin</strong>
          </span>
        </div>
        <button type="button" className="adm-button adm-button-quiet adm-menu-button" aria-haspopup="dialog" onClick={() => setMenu(true)}>
          Menu
        </button>
      </header>
      <main ref={main} id="adm-main" className="adm-main" tabIndex={-1}>
        <DataSourceBar />
        <h1 className="adm-title">{section.label}</h1>
        {content}
      </main>
      {menu ? <MenuSheet current={section} email={email} onGo={open} onClose={() => setMenu(false)} /> : null}
    </div>
  );
}
