// The admin page (D100): asks the HttpOnly cookie for a session first; then
// the sign in steps, or the dashboard. Nothing here is linked from the game.
import { useEffect, useState } from "react";
import { SecondFactor, SignIn } from "./auth/AuthScreens";
import type { SignInStep } from "./protocol";
import { refresh, useSession, watchActivity } from "./session";
import { Shell } from "./shell/Shell";

export function AdminApp() {
  const session = useSession();
  const [step, setStep] = useState<SignInStep | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    return watchActivity(window);
  }, []);
  useEffect(() => {
    if (session.status === "signedIn") setStep(null);
  }, [session.status]);

  if (session.status === "checking") {
    return (
      <main className="adm-auth" aria-busy="true">
        <p className="adm-dim">Checking your sign in</p>
      </main>
    );
  }
  if (session.status === "signedIn") return <Shell email={session.email} />;
  if (step) {
    return (
      <SecondFactor
        step={step}
        onBack={(text) => {
          setStep(null);
          setMessage(text);
        }}
      />
    );
  }
  return <SignIn key={message ?? session.message ?? ""} message={message ?? session.message} onNext={setStep} />;
}
