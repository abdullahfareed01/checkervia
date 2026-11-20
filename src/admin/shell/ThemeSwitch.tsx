// D112: System, Light or Dark, kept on this device.
import { useId } from "react";
import { setTheme, THEMES, useTheme } from "../theme";

const LABELS = { system: "System", light: "Light", dark: "Dark" } as const;

/** `labelledBy`: an existing heading names the group; otherwise it shows its own label. */
export function ThemeSwitch({ labelledBy }: { labelledBy?: string }) {
  const theme = useTheme();
  const label = useId();
  return <div className="adm-theme">
    {!labelledBy && <span className="adm-theme-label" id={label}>Appearance</span>}
    <div className="adm-theme-switch" role="group" aria-labelledby={labelledBy ?? label}>
      {THEMES.map((choice) => <button key={choice} type="button" className="adm-button adm-button-quiet" aria-pressed={theme === choice} onClick={() => setTheme(choice)}>{LABELS[choice]}</button>)}
    </div>
  </div>;
}
