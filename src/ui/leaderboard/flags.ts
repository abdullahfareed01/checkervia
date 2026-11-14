// Flag images from the flag-icons package (MIT, D57). Each flag is its own
// small SVG file in the build, fetched only when a flag is shown, so the
// script bundle only carries this table of file names. `?no-inline` keeps
// Vite from turning small flags into data URLs inside the script.
import { COUNTRY_NAMES } from "../../leaderboard/countries";

const FILES = import.meta.glob<string>("/node_modules/flag-icons/flags/4x3/*.svg", {
  eager: true,
  import: "default",
  query: "?no-inline",
});

const FLAG_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FILES).flatMap(([path, url]) => {
    const code = /\/([a-z]{2})\.svg$/.exec(path)?.[1]?.toUpperCase();
    return code && Object.hasOwn(COUNTRY_NAMES, code) ? [[code, url]] : [];
  }),
);

/** The flag image for a country code, or null when there is none. */
export function flagUrl(code: string | null): string | null {
  return code ? (FLAG_URLS[code] ?? null) : null;
}
