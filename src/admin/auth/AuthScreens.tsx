// The sign in (D100): the password, then the authenticator's code, or on a
// first sign in (while the window on the allow list is open) setting up the
// authenticator from a QR code. One card in the middle of the page.
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { authApi, problemText } from "../api";
import { TOTP_CODE_PATTERN } from "../protocol";
import type { EnrollResponse, SignInStep } from "../protocol";
import { start } from "../session";

export function AuthFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const id = useId();
  return (
    <main className="adm-auth">
      <section className="adm-auth-card" aria-labelledby={`${id}-title`}>
        <div className="adm-brand">
          <img src="/art/logo.svg" alt="" width={44} height={41} />
          <span>
            Checkervia <strong>Admin</strong>
          </span>
        </div>
        <h1 id={`${id}-title`} className="adm-auth-title">
          {title}
        </h1>
        <p className="adm-auth-lead">{lead}</p>
        {children}
      </section>
    </main>
  );
}

function Problem({ text }: { text: string | null }) {
  return (
    <p className="adm-problem" role="alert">
      {text}
    </p>
  );
}

export function SignIn({ message, onNext }: { message: string | null; onNext: (step: SignInStep) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(message);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const answer = await authApi.signIn(email.trim(), password);
    setBusy(false);
    if (answer.kind === "ok") onNext(answer.value);
    else {
      setPassword("");
      setProblem(problemText(answer));
    }
  }

  return (
    <AuthFrame title="Sign in" lead="For the owner of Checkervia only. Every sign in is recorded.">
      <form className="adm-form" onSubmit={submit} noValidate>
        <label className="adm-field">
          <span>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} spellCheck={false} />
        </label>
        <label className="adm-field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <Problem text={problem} />
        <button className="adm-button adm-button-primary" type="submit" disabled={busy || !email || !password}>
          {busy ? "Signing in" : "Continue"}
        </button>
      </form>
    </AuthFrame>
  );
}

function CodeForm({ label, busyLabel, onCode, problem }: { label: string; busyLabel: string; onCode: (code: string) => Promise<void>; problem: string | null }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !TOTP_CODE_PATTERN.test(code)) return;
    setBusy(true);
    await onCode(code);
    setBusy(false);
    setCode("");
  }
  return (
    <form className="adm-form" onSubmit={submit} noValidate>
      <label className="adm-field">
        <span>Six digit code</span>
        <input
          ref={input}
          className="adm-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </label>
      <Problem text={problem} />
      <button className="adm-button adm-button-primary" type="submit" disabled={busy || code.length !== 6}>
        {busy ? busyLabel : label}
      </button>
    </form>
  );
}

export function SecondFactor({ step, onBack }: { step: SignInStep; onBack: (message: string | null) => void }) {
  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function verify(code: string) {
    setProblem(null);
    const answer = await authApi.verify(step.pendingToken, code, enrollment?.factorId ?? step.factorId);
    if (answer.kind === "ok") start(answer.value);
    else if (answer.kind === "error" && answer.status === 401 && answer.code !== "badCode") onBack("That sign in took too long. Please start again.");
    else setProblem(problemText(answer));
  }

  async function showCode() {
    setLoading(true);
    setProblem(null);
    const answer = await authApi.enroll(step.pendingToken);
    setLoading(false);
    if (answer.kind === "ok") setEnrollment(answer.value);
    else setProblem(problemText(answer));
  }

  const back = (
    <button type="button" className="adm-link" onClick={() => onBack(null)}>
      Back to sign in
    </button>
  );

  if (step.step === "verify") {
    return (
      <AuthFrame title="Authenticator code" lead="Open your authenticator app and type the code shown for Checkervia admin.">
        <CodeForm label="Verify" busyLabel="Checking" onCode={verify} problem={problem} />
        {back}
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Set up your authenticator" lead="A second step is required. Scan the code with an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password), then type the code it shows.">
      {enrollment ? (
        <>
          <div className="adm-qr">
            <img src={enrollment.qrCode} alt="QR code for your authenticator app" width={180} height={180} />
          </div>
          <div className="adm-secret">
            <span>Or type this key</span>
            <code>{enrollment.secret}</code>
            <button
              type="button"
              className="adm-button adm-button-quiet"
              onClick={() => {
                void navigator.clipboard?.writeText(enrollment.secret).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              {copied ? "Copied" : "Copy key"}
            </button>
          </div>
          <CodeForm label="Confirm and sign in" busyLabel="Checking" onCode={verify} problem={problem} />
        </>
      ) : (
        <div className="adm-form">
          <Problem text={problem} />
          <button type="button" className="adm-button adm-button-primary" onClick={() => void showCode()} disabled={loading}>
            {loading ? "Preparing" : "Show the QR code"}
          </button>
        </div>
      )}
      {back}
    </AuthFrame>
  );
}
