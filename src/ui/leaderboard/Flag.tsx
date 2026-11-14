// A country's flag as an SVG image (flag-icons), or a neutral outline when
// there is no flag, the code is unknown or the image cannot load. Never
// emoji: Windows shows flag emoji as two letters. The country's name is the
// image's text for screen readers; `decorative` hides it where the name is
// already read next to it.
import { useState } from "react";
import { COUNTRY_NAMES } from "../../leaderboard/countries";
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
