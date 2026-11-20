// The dashboard's frame (D100), redrawn from the owner's mockup (D111): a
// dark green side bar with the sections in groups and count badges, and a
// header with the page title and subtitle, the page's own controls, Open
// Game, the open reports bell and the account menu. On phones the side bar
// is a sheet from the top bar. Paths are /admin/<section>, so the browser's
// back button and reloads work.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { OverviewData } from "../analytics";
import { adminCall, signOut, useSession } from "../session";
import { dateTime } from "./format";
import { DataSourceBar } from "./DataSourceBar";
import { Players } from "./Players";
import { Overview } from "./Overview";
import { Countries, Resigned, Winners } from "./AnalyticsReports";
import { Audit } from "./Audit";
import { Live } from "./Live";
import { Reports } from "./Reports";
import { Suspensions } from "./Suspensions";
import { Activity, AiGames, GameResults, Settings } from "./Insights";
import { FrameContext, publishBadges, useBadges } from "./frame";
import type { Badges } from "./frame";
import { Icon } from "./icons";
import { ThemeSwitch } from "./ThemeSwitch";
import { GROUPS, pathOf, sectionById, sectionFromPath } from "./sections";
import type { Section } from "./sections";

function useSection(): [Section, (section: Section) => void] {
  const [section, setSection] = useState(() => sectionFromPath(location.pathname));
  useEffect(() => {
    const onPop = () => setSection(sectionFromPath(location.pathname));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((next: Section) => {
    if (location.pathname !== pathOf(next)) history.pushState(null, "", `${pathOf(next)}${location.search}`);
    setSection(next);
  }, []);
  return [section, go];
}

/** The menu badges: players online (green), open reports and suspensions (red). */
function badgeOf(section: Section, badges: Badges | null): [number, string, "green" | "red"] | null {
  if (!badges) return null;
  if (section.id === "live" && badges.onlineNow > 0) return [badges.onlineNow, "online now", "green"];
  if (section.id === "reports" && badges.openReports > 0) return [badges.openReports, "open", "red"];
  if (section.id === "suspensions" && badges.suspended > 0) return [badges.suspended, "in force", "red"];
  return null;
}

function NavList({ current, onGo }: { current: Section; onGo: (section: Section) => void }) {
  const badges = useBadges();
  return <div className="adm-nav-groups">{GROUPS.map((group) => <div key={group.label ?? "home"} className="adm-nav-group">
    {group.label && <p className="adm-nav-heading">{group.label}</p>}
    <ul className="adm-nav-list">{group.sections.map((section) => {
      const badge = badgeOf(section, badges);
      return <li key={section.id}>
        <a href={`${pathOf(section)}${location.search}`} className="adm-nav-link" aria-current={section.id === current.id ? "page" : undefined}
          onClick={(event) => { event.preventDefault(); onGo(section); }}>
          <Icon name={section.icon} /><span className="adm-nav-label">{section.label}</span>
          {badge && <span className={`adm-nav-badge adm-nav-badge-${badge[2]}`}>{badge[0].toLocaleString("en-GB")}<span className="adm-sr"> {badge[1]}</span></span>}
        </a>
      </li>;
    })}</ul>
  </div>)}</div>;
}

function Brand() {
  return <div className="adm-brand">
    <img src="/art/logo.svg" alt="" width={50} height={46} />
    <span className="adm-brand-text"><span className="adm-brand-name">Checkervia</span> <strong className="adm-brand-pill">Admin</strong></span>
  </div>;
}

function Account({ email }: { email: string }) {
  const session = useSession();
  return <div className="adm-account">
    <span className="adm-account-email" title={email}>{email}</span>
    {session.status === "signedIn" ? <span className="adm-account-renews" title="You are signed out after 30 minutes without use, and after 12 hours in any case.">
      Authenticator verified. Access renews {dateTime(new Date(session.expiresAt * 1000).toISOString())}
    </span> : null}
    <ThemeSwitch />
    <button type="button" className="adm-button adm-button-quiet" onClick={() => void signOut("You signed out.")}><Icon name="logout" />Sign out</button>
  </div>;
}

/** The crown: who is signed in, Settings and Sign out. */
function AccountMenu({ email, onSettings }: { email: string; onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [open]);
  return <div ref={root} className="adm-account-menu" onKeyDown={(event) => { if (event.key === "Escape" && open) { setOpen(false); root.current?.querySelector("button")?.focus(); } }}>
    <button type="button" className="adm-avatar" aria-expanded={open} aria-controls="adm-account-panel" aria-label="Account" onClick={() => setOpen((value) => !value)}><Icon name="crown" /></button>
    {open && <div id="adm-account-panel" className="adm-account-panel">
      <Account email={email} />
      <button type="button" className="adm-button adm-button-quiet" onClick={() => { setOpen(false); onSettings(); }}><Icon name="gear" />Settings</button>
    </div>}
  </div>;
}

/** The phone menu: a sheet over the page, which does not scroll behind it. */
function MenuSheet({ current, email, onGo, onClose }: { current: Section; email: string; onGo: (section: Section) => void; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("[aria-current=page], a")?.focus();
    document.documentElement.classList.add("adm-locked");
    return () => document.documentElement.classList.remove("adm-locked");
  }, []);
  return <div className="adm-sheet-backdrop" onClick={onClose}>
    <div ref={sheet} className="adm-sheet" role="dialog" aria-modal="true" aria-label="Sections" onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="adm-sheet-head">
        <Brand />
        <button type="button" className="adm-button adm-button-quiet" onClick={onClose}><Icon name="close" />Close</button>
      </div>
      <nav aria-label="Sections"><NavList current={current} onGo={onGo} /></nav>
      <Account email={email} />
    </div>
  </div>;
}

/** The menu badges load once with the frame, and then follow every overview read. */
function useBadgeTotals() {
  useEffect(() => {
    void adminCall<OverviewData>("overview", { period: "7" }).then((answer) => { if (answer.kind === "ok") publishBadges(answer.value.totals); });
  }, []);
}

export function Shell({ email }: { email: string }) {
  const [section, go] = useSection();
  const [menu, setMenu] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const main = useRef<HTMLElement>(null);
  const badges = useBadges();
  useBadgeTotals();
  const open = useCallback((next: Section) => {
    setMenu(false);
    go(next);
    main.current?.focus();
  }, [go]);
  const frame = useMemo(() => ({ slot, go: (id: string) => open(sectionById(id)) }), [slot, open]);
  let content: ReactNode;
  if (section.id === "overview") content = <Overview />;
  else if (section.id === "players") content = <Players />;
  else if (section.id === "countries") content = <Countries />;
  else if (section.id === "winners") content = <Winners />;
  else if (section.id === "resigned") content = <Resigned />;
  else if (section.id === "reports") content = <Reports />;
  else if (section.id === "suspensions") content = <Suspensions />;
  else if (section.id === "live") content = <Live />;
  else if (section.id === "ai-games") content = <AiGames />;
  else if (section.id === "results") content = <GameResults />;
  else if (section.id === "activity") content = <Activity />;
  else if (section.id === "settings") content = <Settings email={email} />;
  else content = <Audit />;
  const reports = badges?.openReports ?? 0;

  return <FrameContext.Provider value={frame}>
    <div className="adm-app">
      <a className="adm-skip" href="#adm-main">Skip to content</a>
      <aside className="adm-side">
        <Brand />
        <nav aria-label="Sections"><NavList current={section} onGo={open} /></nav>
      </aside>
      <header className="adm-top">
        <Brand />
        <button type="button" className="adm-button adm-button-quiet adm-menu-button" aria-haspopup="dialog" onClick={() => setMenu(true)}><Icon name="menu" />Menu</button>
      </header>
      <main ref={main} id="adm-main" className="adm-main" tabIndex={-1}>
        <div className="adm-page-head">
          <div className="adm-page-heading">
            <p className="adm-crumbs">Checkervia <span aria-hidden="true">/</span> Admin</p>
            <h1 className="adm-title">{section.label}</h1>
            <p className="adm-subtitle">{section.subtitle}</p>
          </div>
          <div className="adm-head-actions">
            <div ref={setSlot} className="adm-page-actions" />
            <a className="adm-button adm-button-primary adm-open-game" href="/" target="_blank" rel="noopener noreferrer"><Icon name="play" />Open Game</a>
            <a className="adm-bell" href={`/admin/reports${location.search}`} aria-label={reports > 0 ? `Open reports: ${reports}` : "Open reports: none"} title="Open reports"
              onClick={(event) => { event.preventDefault(); open(sectionById("reports")); }}>
              <Icon name="bell" />{reports > 0 && <span className="adm-bell-dot" aria-hidden="true">{reports > 99 ? "99+" : reports}</span>}
            </a>
            <AccountMenu email={email} onSettings={() => open(sectionById("settings"))} />
          </div>
        </div>
        <DataSourceBar />
        {content}
      </main>
      {menu ? <MenuSheet current={section} email={email} onGo={open} onClose={() => setMenu(false)} /> : null}
    </div>
  </FrameContext.Provider>;
}
