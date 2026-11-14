// A country's flag as an SVG image (flag-icons), or a neutral outline when
// there is no flag, the code is unknown or the image cannot load. Never
// emoji: Windows shows flag emoji as two letters. The country's name is the
// image's text for screen readers; `decorative` hides it where the name is
// already read next to it.
import { useState } from "react";
import type { ChangeEvent } from "react";
import { COUNTRY_NAMES } from "../../leaderboard/countries";
import type { CountryChoice } from "../../leaderboard/protocol";
import { flagUrl } from "./flags";

export function countryName(code: string | null): string {
  return code ? (COUNTRY_NAMES[code] ?? "No flag") : "No flag";
}

export function Flag({ code, decorative = false }: { code: string | null; decorative?: boolean }) {
  const url = flagUrl(code);
  const [broken, setBroken] = useState<string | null>(null);
  const label = countryName(code);
  if (!url || broken === url) {
    return (
      <span className="lb-flag lb-flag-none" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined} />
    );
  }
  return (
    <img
      className="lb-flag"
      src={url}
      alt={decorative ? "" : label}
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(url)}
    />
  );
}

// Countries sorted by their names, once.
const SORTED = Object.entries(COUNTRY_NAMES).sort(([, a], [, b]) => a.localeCompare(b, "en"));

/**
 * The flag choice: Automatic (the country the connection comes from, worked
 * out by the server), No flag, or a country.
 * A native select, so phones show their own picker and screen readers know it.
 */
export function CountrySelect({
  id,
  value,
  shown,
  allowAuto,
  disabled = false,
  onChange,
}: {
  id: string;
  value: CountryChoice;
  shown: string | null; // the flag to show beside it (for "auto", unknown until saved)
  allowAuto: boolean;
  disabled?: boolean;
  onChange: (choice: CountryChoice) => void;
}) {
  const select = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    onChange(next === "auto" ? "auto" : next === "" ? null : next);
  };
  return (
    <div className="lb-country">
      <label htmlFor={id} className="lb-field-label">
        Flag
      </label>
      <div className="lb-country-row">
        <Flag code={shown} decorative />
        <select id={id} className="lb-select" value={value ?? ""} disabled={disabled} onChange={select}>
          {allowAuto && <option value="auto">Automatic</option>}
          <option value="">No flag</option>
          {SORTED.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
