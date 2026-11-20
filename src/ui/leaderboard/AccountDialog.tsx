// Saving progress with an email, and logging in to a saved profile (D150),
// in a calm popup like the (i) rules: the email, then the 6 digit code.
// Logging in on a device that already has another profile first says
// exactly what happens to it, and nothing changes until the player agrees.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { CODE_MINUTES, normalEmail } from "../../leaderboard/account";
import type { AccountPurpose } from "../../leaderboard/account";
import { settingsStore } from "../settings";
import { collectionStoreFor } from "../useMarketplace";
import { accountProblemText, finishLogin } from "./accountClient";
import { accountApi } from "./api";
import { CloseIcon, PersonIcon } from "./lbIcons";
import { leaderboardStore } from "./profile";
import { flushQueue } from "./winQueue";
import "./account.css";

/** A popup with a title, its content, and a close button. */
export function AccountShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ids = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);
  // Drawn at the Profile screen's level: a moving column around the button
  // would otherwise carry the fixed popup off the window.
  const host = typeof document === "undefined" ? null : document.querySelector(".pf-screen") ?? document.body;
  const popup = (
    <div className="lb-info-backdrop" onClick={onClose}>
      <div className="lb-info acct-dialog" role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`} onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
        <div className="lb-info-head">
          <span className="lb-info-mark" aria-hidden="true"><PersonIcon /></span>
          <h2 id={`${ids}-title`} className="lb-info-title">{title}</h2>
          <button ref={closeRef} type="button" className="lb-close lb-info-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="lb-info-body acct-body">{children}</div>
      </div>
    </div>
  );
  return host ? createPortal(popup, host) : popup;
}

/** The exact warning before a login replaces this device's profile (D150, point 2). */
export function replaceWarning(name: string, saved: boolean, unsent: number): { title: string; lines: string[]; go: string; keep: string } {
  if (saved) {
    return { title: "Switch profiles?", lines: [`This device will switch from ${name} to your saved profile. ${name} stays saved to its email, and you can log back in any time.`], go: "Switch", keep: `Keep ${name}` };
  }
  return {
    title: "Replace this device's profile?",
    lines: [
      `This device has the profile ${name}, and it is not saved to an email. If you log in, this device forgets ${name}. Its wins stay on the leaderboard, but you will not be able to use it again. Its shop unlocks and settings on this device are replaced by your saved ones.`,
      ...(unsent > 0 ? [`${unsent} ${unsent === 1 ? "win has" : "wins have"} not been sent yet and will be lost.`] : []),
      `To keep ${name}, save it to its own email first.`,
    ],
    go: "Log in anyway",
    keep: `Keep ${name}`,
  };
}

type Step = "warn" | "email" | "code";

export function AccountDialog({ purpose, onClose, onDone }: { purpose: AccountPurpose; onClose: () => void; onDone: () => void }) {
  const { profile, queue } = leaderboardStore.get();
  const [step, setStep] = useState<Step>(purpose === "login" && profile ? "warn" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ids = useId();
  const typed = normalEmail(email);

  async function send() {
    if (!typed) { setProblem("Enter your email address."); return; }
    setBusy(true); setProblem(null);
    const result = await accountApi.requestCode(typed, purpose);
    setBusy(false);
    if (result.kind === "ok") { setCode(""); setStep("code"); } else setProblem(accountProblemText(result));
  }

  async function confirm() {
    if (!typed || !/^\d{6}$/.test(code)) { setProblem("Enter the 6 digit code from the email."); return; }
    setBusy(true); setProblem(null);
    if (purpose === "link") {
      const result = await accountApi.verifyLink(typed, code);
      if (result.kind === "ok" && profile) {
        leaderboardStore.updateProfile({ emailHint: result.value.emailHint });
        // The first save: what this device has now.
        await accountApi.save((await collectionStoreFor(profile.token)).get(), settingsStore().get());
      }
      setBusy(false);
      if (result.kind === "ok") onDone(); else setProblem(accountProblemText(result));
      return;
    }
    // Wins of the profile being replaced: one last try to send them first.
    if (profile) await flushQueue();
    const result = await accountApi.verifyLogin(typed, code);
    if (result.kind === "ok") await finishLogin(result.value);
    setBusy(false);
    if (result.kind === "ok") onDone(); else setProblem(accountProblemText(result));
  }

  if (step === "warn" && profile) {
    const warning = replaceWarning(profile.username, Boolean(profile.emailHint), queue.length);
    return (
      <AccountShell title={warning.title} onClose={onClose}>
        {warning.lines.map((line) => <p key={line}>{line}</p>)}
        <div className="pf-actions acct-actions">
          <button type="button" className="lb-button" onClick={onClose}>{warning.keep}</button>
          <button type="button" className="lb-button lb-button-gold" onClick={() => setStep("email")}>{warning.go}</button>
        </div>
      </AccountShell>
    );
  }

  const title = purpose === "link" ? "Save your progress" : "Log in to your saved profile";
  return (
    <AccountShell title={title} onClose={onClose}>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void (step === "email" ? send() : confirm()); }}>
        {step === "email" ? (
          <>
            <p>{purpose === "link" ? "Save your profile, wins, shop unlocks and settings to your email. Then you can log in again on any device." : "Enter the email your profile is saved to. We will send you a 6 digit code."}</p>
            <label className="acct-field" htmlFor={`${ids}-email`}>Email</label>
            <input id={`${ids}-email`} className="lb-input acct-input" type="email" inputMode="email" autoComplete="email" maxLength={254} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
            <p className="lb-note">Your email is never public and never used for marketing.</p>
          </>
        ) : (
          <>
            <p>{`We sent a 6 digit code to ${typed}. It works for ${CODE_MINUTES} minutes. If it does not arrive, check your spam folder.`}</p>
            <label className="acct-field" htmlFor={`${ids}-code`}>Code</label>
            <input id={`${ids}-code`} className="lb-input acct-input acct-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            <button type="button" className="link-button acct-link" disabled={busy} onClick={() => void send()}>Send a new code</button>
          </>
        )}
        {problem && <p className="acct-problem" role="alert">{problem}</p>}
        <div className="pf-actions acct-actions">
          <button type="button" className="lb-button" disabled={busy} onClick={step === "code" ? () => { setStep("email"); setProblem(null); } : onClose}>{step === "code" ? "Back" : "Cancel"}</button>
          <button type="submit" className="lb-button lb-button-gold" aria-busy={busy} disabled={busy}>{busy ? "Please wait…" : step === "email" ? "Send code" : purpose === "link" ? "Save" : "Log in"}</button>
        </div>
      </form>
    </AccountShell>
  );
}
