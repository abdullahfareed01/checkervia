// The admin page's entry (D100). A separate build (vite.admin.config.ts):
// the game never loads this file or anything it imports.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./AdminApp";
import "../ui/tokens.css";
import "./styles/base.css";
import "./styles/auth.css";
import "./styles/shell.css";
import "./styles/overview.css";
import "./styles/players.css";
import "./styles/refinement.css";

async function startAdmin() {
  // Development only: ?demo=signin|enroll|verify|app answers the admin
  // functions in the page with made up data, for layout checks without a
  // database. A production build leaves this block and the demo out.
  if (import.meta.env.DEV) {
    const demo = new URLSearchParams(location.search).get("demo");
    if (demo) (await import("./dev/demo")).startDemo(demo);
  }
  createRoot(document.getElementById("admin-root")!).render(
    <StrictMode>
      <AdminApp />
    </StrictMode>,
  );
}

void startAdmin();
