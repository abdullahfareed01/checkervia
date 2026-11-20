// Saving progress on the Profile screen (D150). Shown only once the owner
// has switched accounts on; until then the screen is exactly as before.
// - An unsaved profile: "Save your progress", and logging in to another one.
// - A saved profile: which email it is saved to, logging out on this
//   device, removing the email, and logging in to another profile.
// - No profile yet (the create page): "Have a saved profile? Log in".
import { useState } from "react";
import { AccountDialog, AccountShell } from "./AccountDialog";
import { accountProblemText, useAccountsEnabled } from "./accountClient";
import { accountApi } from "./api";
import { leaderboardStore } from "./profile";
import type { Profile } from "./profile";
import { flushQueue } from "./winQueue";

type Open = "link" | "login" | "logout" | "unlink" | null;

export function AccountSection({ profile }: { profile: Profile }) {
  const on = useAccountsEnabled();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!on) return null;
  const close = () => { setOpen(null); setProblem(null); };

  async function leave(kind: "logout" | "unlink") {
    setBusy(true); setProblem(null);
    if (kind === "logout") await flushQueue();
    const result = kind === "logout" ? await accountApi.logout() : await accountApi.unlink();
    setBusy(false);
    if (result.kind !== "ok") { setProblem(accountProblemText(result)); return; }
    if (kind === "logout") leaderboardStore.switchProfile(null);
    else { leaderboardStore.updateProfile({ emailHint: undefined }); setNote("Your saved email was removed."); }
    close();
  }

  return (
    <section className="acct-section" aria-label="Saving your progress">
      {profile.emailHint ? (
        <p className="acct-state">{`Saved to ${profile.emailHint}. Log in with it on any device.`}</p>
      ) : (
        <p className="acct-state">Save your progress to log in again on any device. Otherwise clearing your browser data loses this profile.</p>
      )}
      {note && <p className="lb-note" role="status">{note}</p>}
      <div className="acct-buttons">
        {profile.emailHint ? (
          <>
            <button type="button" className="lb-button" onClick={() => setOpen("logout")}>Log out on this device</button>
            <button type="button" className="lb-button" onClick={() => setOpen("unlink")}>Remove saved email</button>
          </>
        ) : (
          <button type="button" className="lb-button lb-button-gold" onClick={() => setOpen("link")}>Save your progress</button>
        )}
        <button type="button" className="link-button acct-link" onClick={() => setOpen("login")}>Log in to another saved profile</button>
      </div>
      {(open === "link" || open === "login") && (
        <AccountDialog purpose={open} onClose={close} onDone={() => { setNote(open === "link" ? "Saved. You can now log in on any device." : null); close(); }} />
      )}
      {(open === "logout" || open === "unlink") && (
        <AccountShell title={open === "logout" ? "Log out on this device?" : "Remove your saved email?"} onClose={close}>
          <p>
            {open === "logout"
              ? `This device forgets ${profile.username}. You can log back in any time with your email.`
              : `You will not be able to log in to ${profile.username} on another device until you save it again. Your shop unlocks and settings stay on this device.`}
          </p>
          {problem && <p className="acct-problem" role="alert">{problem}</p>}
          <div className="pf-actions acct-actions">
            <button type="button" className="lb-button" disabled={busy} onClick={close}>Cancel</button>
            <button type="button" className="lb-button lb-button-gold" aria-busy={busy} disabled={busy} onClick={() => void leave(open)}>
              {busy ? "Please wait…" : open === "logout" ? "Log out" : "Remove email"}
            </button>
          </div>
        </AccountShell>
      )}
    </section>
  );
}

/** On the create page: bring a saved profile instead of making a new one. */
export function LoginEntry({ onLoggedIn }: { onLoggedIn: () => void }) {
  const on = useAccountsEnabled();
  const [open, setOpen] = useState(false);
  if (!on) return null;
  return (
    <>
      <button type="button" className="link-button acct-link" onClick={() => setOpen(true)}>Have a saved profile? Log in</button>
      {open && <AccountDialog purpose="login" onClose={() => setOpen(false)} onDone={() => { setOpen(false); onLoggedIn(); }} />}
    </>
  );
}
