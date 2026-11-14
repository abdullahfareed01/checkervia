// Draws the leaderboard avatars (D62): 40 original SVG portraits in one
// style, 10 for each category the profile screen offers as a filter (men,
// women, kids, older adults). Drawn here from simple shapes for this
// project, so they are our own work (see docs/05-art-audio).
//
//   node scripts/make-avatars.mjs
//
// writes public/avatars/a01.svg to a40.svg and src/leaderboard/avatarList.json.
// The ids say nothing about the category: the server stores only the id and
// never a category (the list is shuffled with a fixed seed).
import { mkdirSync, writeFileSync } from "node:fs";

const SKIN = {
  light: ["#f6d3b8", "#e3b393"],
  fair: ["#f1c39c", "#d9a07a"],
  tan: ["#d9a066", "#bd8050"],
  olive: ["#c98e5c", "#a8703f"],
  brown: ["#a8693f", "#8a522c"],
  deep: ["#7a4a2a", "#5e361c"],
};
const BACKGROUNDS = {
  sky: ["#bfe3ff", "#6fb4ea"],
  gold: ["#ffe08a", "#f0a92e"],
  mint: ["#c9f2d9", "#6cc596"],
  rose: ["#ffd3dc", "#e9839b"],
  lilac: ["#e3d6ff", "#9c84e0"],
  peach: ["#ffd9b8", "#f19a5c"],
  teal: ["#bff0ee", "#4fb7b2"],
  sand: ["#f5e6c8", "#d5b47c"],
};

const INK = "#2b1a12";

// ---------- Parts (a 128 by 128 view box, the face centred near 64, 62) ----------

function hairBack(style, color) {
  switch (style) {
    case "long":
      return `<path d="M30 66C26 34 44 22 64 22s38 12 34 44c-1 18 4 34 10 44H20c6-10 11-26 10-44z" fill="${color}"/>`;
    case "bob":
      return `<path d="M32 70C28 38 44 24 64 24s36 14 32 46c-1 8 2 14 6 18H26c4-4 7-10 6-18z" fill="${color}"/>`;
    case "afro":
      return `<circle cx="64" cy="50" r="38" fill="${color}"/>`;
    case "ponytail":
      return `<path d="M88 40c16 4 22 22 16 44-3 10-10 14-14 12 6-12 6-30-2-40z" fill="${color}"/>`;
    case "bun":
      return `<circle cx="64" cy="22" r="13" fill="${color}"/>`;
    case "pigtails":
      return `<circle cx="30" cy="58" r="11" fill="${color}"/><circle cx="98" cy="58" r="11" fill="${color}"/>`;
    case "curlsLong":
      return `<path d="M28 70c-6-30 10-48 36-48s42 18 36 48c4 10 6 22 2 34H26c-4-12-2-24 2-34z" fill="${color}"/>`;
    default:
      return "";
  }
}

function hairFront(style, color) {
  switch (style) {
    case "short":
      return `<path d="M36 62c-4-26 10-38 28-38s32 12 28 38c-2-10-8-18-18-20-8 6-24 6-34 2-2 4-3 10-4 18z" fill="${color}"/>`;
    case "side":
      return `<path d="M36 64c-5-28 9-40 28-40 20 0 34 12 28 40-1-10-5-17-10-20-14 2-32-2-40 2-3 4-5 10-6 18z" fill="${color}"/><path d="M58 30c8 0 20 4 26 12" stroke="${shade(color)}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    case "spiky":
      return `<path d="M36 62c-3-10-1-22 4-28l2 6 6-12 4 8 8-12 4 10 8-10 4 10 8-6 2 10c6 6 8 14 6 24-4-8-10-14-20-16-10 2-24 2-32 0-2 4-4 10-4 16z" fill="${color}"/>`;
    case "buzz":
      return `<path d="M37 58c0-22 12-32 27-32s27 10 27 32c-6-10-16-14-27-14S43 48 37 58z" fill="${color}"/>`;
    case "curly":
      return `<g fill="${color}"><circle cx="42" cy="44" r="9"/><circle cx="52" cy="34" r="10"/><circle cx="64" cy="30" r="10"/><circle cx="76" cy="34" r="10"/><circle cx="86" cy="44" r="9"/><circle cx="38" cy="54" r="7"/><circle cx="90" cy="54" r="7"/></g>`;
    case "long":
    case "curlsLong":
      return `<path d="M36 66c-4-28 10-40 28-40s32 12 28 40c-4-12-12-22-26-24-6 8-18 14-30 24z" fill="${color}"/>`;
    case "bob":
      return `<path d="M35 66c-3-26 11-38 29-38s32 12 29 38c-6-8-14-18-29-18S41 58 35 66z" fill="${color}"/>`;
    case "ponytail":
    case "bun":
      return `<path d="M36 62c-3-24 11-36 28-36s31 12 28 36c-6-10-16-16-28-16S42 52 36 62z" fill="${color}"/>`;
    case "pigtails":
      return `<path d="M37 62c-3-24 10-34 27-34s30 10 27 34c-4-8-12-16-27-16-8 0-14 2-18 6-4 2-7 6-9 10z" fill="${color}"/>`;
    case "afro":
      return `<path d="M38 56c2-14 12-22 26-22s24 8 26 22c-8-6-16-8-26-8s-18 2-26 8z" fill="${color}"/>`;
    case "bald":
      return `<path d="M35 66c-2-8 0-14 4-16 2 6 2 12 0 18zM93 66c2-8 0-14-4-16-2 6-2 12 0 18z" fill="${color}"/>`;
    case "receding":
      return `<path d="M36 62c-2-16 4-26 12-30 2 8 0 14-4 18 6-4 14-6 20-6s14 2 20 6c-4-4-6-10-4-18 8 4 14 14 12 30-4-8-14-12-28-12s-24 4-28 12z" fill="${color}"/>`;
    default:
      return "";
  }
}

function shade(color) {
  // A darker line for strands, from a #rrggbb colour.
  const n = parseInt(color.slice(1), 16);
  const dark = (v) => Math.max(0, Math.round(v * 0.7));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => dark(v).toString(16).padStart(2, "0")).join("")}`;
}

function headwear(kind, color) {
  switch (kind) {
    case "cap":
      return `<path d="M36 52c0-18 12-28 28-28s28 10 28 28z" fill="${color}"/><path d="M60 50h46c0 4-4 7-10 7H60z" fill="${shade(color)}"/><circle cx="64" cy="25" r="3" fill="${shade(color)}"/>`;
    case "beanie":
      return `<path d="M35 56c0-22 12-32 29-32s29 10 29 32z" fill="${color}"/><rect x="33" y="50" width="62" height="10" rx="5" fill="${shade(color)}"/><circle cx="64" cy="22" r="6" fill="${shade(color)}"/>`;
    case "kufi":
      return `<path d="M38 46c2-14 12-20 26-20s24 6 26 20z" fill="${color}"/><path d="M42 40h44" stroke="${shade(color)}" stroke-width="2" stroke-dasharray="3 3"/>`;
    default:
      return "";
  }
}

// A head scarf framing the face: behind the head, then over the forehead.
function scarfBack(color) {
  return `<path d="M26 128c0-26 2-44 6-60C34 36 46 22 64 22s30 14 32 46c4 16 6 34 6 60z" fill="${color}"/>`;
}
function scarfFront(color) {
  return `<path d="M33 76C31 42 45 28 64 28s33 14 31 48c-3-16-10-30-31-30S36 60 33 76z" fill="${color}"/><path d="M34 74c2-16 10-28 30-28s28 12 30 28" stroke="${shade(color)}" stroke-width="2" fill="none"/>`;
}

function face({ skin, kid, older, lashes, blush, freckles, glasses, beard, mustache, hairColor, smile }) {
  const [tone, toneDark] = SKIN[skin];
  const cy = kid ? 66 : 62;
  const rx = kid ? 28 : 26;
  const ry = kid ? 27 : 30;
  const eyeY = kid ? 66 : 63;
  const eyeR = kid ? 4.4 : 3.6;
  const parts = [];
  // Ears, then the head.
  parts.push(`<circle cx="${64 - rx}" cy="${eyeY + 3}" r="6.5" fill="${toneDark}"/><circle cx="${64 + rx}" cy="${eyeY + 3}" r="6.5" fill="${toneDark}"/>`);
  parts.push(`<ellipse cx="64" cy="${cy}" rx="${rx}" ry="${ry}" fill="${tone}"/>`);
  if (blush) parts.push(`<circle cx="47" cy="${eyeY + 11}" r="5" fill="#f07e7e" opacity="0.35"/><circle cx="81" cy="${eyeY + 11}" r="5" fill="#f07e7e" opacity="0.35"/>`);
  if (freckles) parts.push(`<g fill="${toneDark}"><circle cx="48" cy="${eyeY + 9}" r="1"/><circle cx="52" cy="${eyeY + 11}" r="1"/><circle cx="76" cy="${eyeY + 11}" r="1"/><circle cx="80" cy="${eyeY + 9}" r="1"/></g>`);
  // Eyes with a highlight, brows, lashes.
  for (const x of [54, 74]) {
    parts.push(`<ellipse cx="${x}" cy="${eyeY}" rx="${eyeR * 0.85}" ry="${eyeR}" fill="${INK}"/><circle cx="${x + 1.2}" cy="${eyeY - 1.4}" r="${eyeR * 0.32}" fill="#fff"/>`);
    if (lashes) parts.push(`<path d="M${x - 4} ${eyeY - 3}l-2.5-2.5M${x + 4} ${eyeY - 3}l2.5-2.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`);
  }
  const brow = older ? "#cfcfcf" : (hairColor ?? "#3a2418");
  parts.push(`<path d="M48 ${eyeY - 8}q6-4 11 0M69 ${eyeY - 8}q5-4 11 0" stroke="${shade(brow)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
  if (older) parts.push(`<path d="M44 ${eyeY + 1}l-4 2M84 ${eyeY + 1}l4 2M57 ${eyeY - 14}q7-2 14 0" stroke="${toneDark}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
  // Nose and mouth.
  parts.push(`<path d="M64 ${eyeY + 4}q-3 6 1 8" stroke="${toneDark}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  const mouthY = eyeY + 16;
  if (beard) {
    const b = beard;
    parts.push(`<path d="M38 ${eyeY}c0 26 12 36 26 36s26-10 26-36c-4 8-8 12-12 13-6-4-22-4-28 0-4-1-8-5-12-13z" fill="${b}"/>`);
  }
  if (mustache) parts.push(`<path d="M54 ${mouthY - 3}c4-4 8-4 10-1 2-3 6-3 10 1-4 2-8 2-10 0-2 2-6 2-10 0z" fill="${mustache}"/>`);
  if (smile === "open") parts.push(`<path d="M55 ${mouthY}q9 9 18 0z" fill="#7a2a22"/><path d="M57 ${mouthY + 0.5}h14q-1 3-7 3t-7-3z" fill="#fff"/>`);
  else parts.push(`<path d="M56 ${mouthY}q8 6 16 0" stroke="#7a2a22" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
  if (glasses) {
    parts.push(`<g fill="none" stroke="${glasses}" stroke-width="2.4"><rect x="45" y="${eyeY - 6}" width="17" height="12" rx="5"/><rect x="66" y="${eyeY - 6}" width="17" height="12" rx="5"/><path d="M62 ${eyeY - 1}h4M45 ${eyeY - 2}l-7-2M83 ${eyeY - 2}l7-2"/></g>`);
  }
  return parts.join("");
}

function body(shirt, skin, collar) {
  const [, toneDark] = SKIN[skin];
  const neck = `<path d="M54 84h20v14c-6 5-14 5-20 0z" fill="${toneDark}"/>`;
  const shoulders = `<path d="M16 128c2-20 18-32 48-32s46 12 48 32z" fill="${shirt}"/>`;
  const trim =
    collar === "v" ? `<path d="M54 96l10 12 10-12" stroke="${shade(shirt)}" stroke-width="3" fill="none" stroke-linejoin="round"/>`
    : collar === "round" ? `<path d="M52 97q12 8 24 0" stroke="${shade(shirt)}" stroke-width="3" fill="none"/>`
    : `<path d="M50 97l14 8 14-8" stroke="#fff" stroke-width="4" fill="none" stroke-linejoin="round"/>`;
  return neck + shoulders + trim;
}

function avatar(spec) {
  const [bgLight, bgDark] = BACKGROUNDS[spec.bg];
  const id = "g";
  const parts = [
    `<defs><radialGradient id="${id}" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${bgLight}"/><stop offset="1" stop-color="${bgDark}"/></radialGradient></defs>`,
    `<circle cx="64" cy="64" r="64" fill="url(#${id})"/>`,
  ];
  // Everything below is clipped to the circle by the page (border-radius),
  // and drawn inside it here too.
  parts.push(`<clipPath id="c"><circle cx="64" cy="64" r="64"/></clipPath><g clip-path="url(#c)">`);
  if (spec.scarf) parts.push(scarfBack(spec.scarf));
  parts.push(hairBack(spec.hair, spec.hairColor));
  parts.push(body(spec.shirt, spec.skin, spec.collar));
  parts.push(face(spec));
  if (spec.scarf) parts.push(scarfFront(spec.scarf));
  else parts.push(hairFront(spec.hair, spec.hairColor));
  if (spec.hat) parts.push(headwear(spec.hat, spec.hatColor));
  if (spec.earrings) parts.push(`<circle cx="${spec.kid ? 36 : 38}" cy="${spec.kid ? 76 : 73}" r="2.6" fill="${spec.earrings}"/><circle cx="${spec.kid ? 92 : 90}" cy="${spec.kid ? 76 : 73}" r="2.6" fill="${spec.earrings}"/>`);
  parts.push("</g>");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${parts.join("")}</svg>\n`;
}

// ---------- The set: 10 per category ----------

const BLACK = "#2a1d17";
const BROWN = "#5a3620";
const AUBURN = "#8a3b1e";
const BLOND = "#d9a645";
const GREY = "#a9a9a9";
const WHITE = "#e9e6e1";

const men = [
  { skin: "fair", hair: "side", hairColor: BROWN, beard: BROWN, shirt: "#2f7d4f", bg: "gold", collar: "v", smile: "open" },
  { skin: "light", hair: "short", hairColor: BLACK, shirt: "#2c5fb3", bg: "sky", collar: "round", smile: "open" },
  { skin: "tan", hair: "short", hairColor: BLACK, beard: BLACK, glasses: INK, shirt: "#1f6b5c", bg: "peach", collar: "round", smile: "open" },
  { skin: "deep", hair: "buzz", hairColor: BLACK, shirt: "#c0392b", bg: "mint", collar: "v", smile: "open" },
  { skin: "olive", hair: "spiky", hairColor: BROWN, shirt: "#6c3fb0", bg: "teal", collar: "round", smile: "closed" },
  { skin: "brown", hair: "curly", hairColor: BLACK, mustache: BLACK, shirt: "#d4882a", bg: "lilac", collar: "v", smile: "open" },
  { skin: "light", hair: "side", hairColor: BLOND, shirt: "#34495e", bg: "rose", collar: "round", smile: "open" },
  { skin: "tan", hair: "buzz", hairColor: BLACK, beard: BLACK, hat: "kufi", hatColor: "#f2efe8", shirt: "#e9e3d6", bg: "sand", collar: "round", smile: "closed" },
  { skin: "fair", hair: "short", hairColor: AUBURN, beard: AUBURN, shirt: "#8e5a2b", bg: "sky", collar: "v", smile: "open" },
  { skin: "deep", hair: "afro", hairColor: BLACK, shirt: "#2f7d4f", bg: "gold", collar: "round", smile: "open" },
];

const women = [
  { skin: "fair", hair: "long", hairColor: BROWN, lashes: true, blush: true, earrings: "#f2c14e", shirt: "#c0392b", bg: "gold", collar: "v", smile: "open" },
  { skin: "tan", scarf: "#2f7d4f", lashes: true, blush: true, shirt: "#2f7d4f", bg: "peach", collar: "round", smile: "open" },
  { skin: "light", hair: "bob", hairColor: BLOND, lashes: true, blush: true, shirt: "#2c5fb3", bg: "rose", collar: "round", smile: "open" },
  { skin: "deep", hair: "afro", hairColor: BLACK, lashes: true, earrings: "#f2c14e", shirt: "#d4882a", bg: "teal", collar: "v", smile: "open" },
  { skin: "olive", hair: "ponytail", hairColor: BLACK, lashes: true, blush: true, shirt: "#6c3fb0", bg: "sky", collar: "round", smile: "closed" },
  { skin: "brown", scarf: "#6c3fb0", lashes: true, shirt: "#34495e", bg: "lilac", collar: "round", smile: "open" },
  { skin: "fair", hair: "curlsLong", hairColor: AUBURN, lashes: true, blush: true, freckles: true, shirt: "#1f6b5c", bg: "mint", collar: "v", smile: "open" },
  { skin: "tan", hair: "bun", hairColor: BROWN, lashes: true, glasses: "#7a4a2a", shirt: "#c0392b", bg: "sand", collar: "round", smile: "open" },
  { skin: "light", scarf: "#c0392b", lashes: true, blush: true, shirt: "#e9e3d6", bg: "gold", collar: "round", smile: "closed" },
  { skin: "deep", hair: "bun", hairColor: BLACK, lashes: true, earrings: "#e9e6e1", shirt: "#2c5fb3", bg: "rose", collar: "v", smile: "open" },
];

const kids = [
  { kid: true, skin: "fair", hair: "short", hairColor: BROWN, blush: true, hat: "cap", hatColor: "#c0392b", shirt: "#2c5fb3", bg: "sky", collar: "round", smile: "open" },
  { kid: true, skin: "light", hair: "pigtails", hairColor: BLOND, lashes: true, blush: true, freckles: true, shirt: "#e9839b", bg: "mint", collar: "round", smile: "open" },
  { kid: true, skin: "deep", hair: "curly", hairColor: BLACK, blush: true, shirt: "#f0a92e", bg: "teal", collar: "v", smile: "open" },
  { kid: true, skin: "tan", hair: "bob", hairColor: BLACK, lashes: true, blush: true, shirt: "#6c3fb0", bg: "peach", collar: "round", smile: "open" },
  { kid: true, skin: "olive", hair: "spiky", hairColor: BLACK, blush: true, shirt: "#2f7d4f", bg: "gold", collar: "round", smile: "open" },
  { kid: true, skin: "brown", hair: "ponytail", hairColor: BLACK, lashes: true, blush: true, shirt: "#2c5fb3", bg: "rose", collar: "round", smile: "open" },
  { kid: true, skin: "light", hair: "side", hairColor: AUBURN, freckles: true, glasses: "#2c5fb3", shirt: "#d4882a", bg: "lilac", collar: "v", smile: "open" },
  { kid: true, skin: "fair", hair: "short", hairColor: BLACK, blush: true, hat: "beanie", hatColor: "#2f7d4f", shirt: "#c0392b", bg: "sand", collar: "round", smile: "closed" },
  { kid: true, skin: "tan", scarf: "#e9839b", lashes: true, blush: true, shirt: "#e9839b", bg: "sky", collar: "round", smile: "open" },
  { kid: true, skin: "deep", hair: "pigtails", hairColor: BLACK, lashes: true, blush: true, shirt: "#1f6b5c", bg: "gold", collar: "round", smile: "open" },
];

const older = [
  { older: true, skin: "fair", hair: "bald", hairColor: WHITE, glasses: INK, mustache: WHITE, shirt: "#8e5a2b", bg: "sand", collar: "v", smile: "open" },
  { older: true, skin: "light", hair: "bob", hairColor: GREY, lashes: true, glasses: "#b03a5b", earrings: "#e9e6e1", shirt: "#6c3fb0", bg: "rose", collar: "round", smile: "open" },
  { older: true, skin: "tan", hair: "receding", hairColor: GREY, beard: WHITE, shirt: "#e9e3d6", bg: "gold", collar: "round", smile: "closed" },
  { older: true, skin: "deep", hair: "buzz", hairColor: GREY, mustache: GREY, glasses: "#d4a640", shirt: "#2c5fb3", bg: "teal", collar: "v", smile: "open" },
  { older: true, skin: "olive", scarf: "#e9e6e1", lashes: true, glasses: INK, shirt: "#34495e", bg: "lilac", collar: "round", smile: "open" },
  { older: true, skin: "brown", hair: "bun", hairColor: WHITE, lashes: true, earrings: "#f2c14e", shirt: "#c0392b", bg: "peach", collar: "round", smile: "open" },
  { older: true, skin: "light", hair: "side", hairColor: WHITE, shirt: "#1f6b5c", bg: "sky", collar: "v", smile: "open" },
  { older: true, skin: "tan", hair: "buzz", hairColor: GREY, beard: WHITE, hat: "kufi", hatColor: "#f2efe8", shirt: "#2f7d4f", bg: "mint", collar: "round", smile: "closed" },
  { older: true, skin: "fair", hair: "curly", hairColor: GREY, lashes: true, blush: true, shirt: "#d4882a", bg: "rose", collar: "round", smile: "open" },
  { older: true, skin: "deep", hair: "bald", hairColor: GREY, glasses: INK, beard: GREY, shirt: "#6c3fb0", bg: "gold", collar: "v", smile: "open" },
];

const all = [
  ...men.map((spec) => ({ spec, category: "men" })),
  ...women.map((spec) => ({ spec, category: "women" })),
  ...kids.map((spec) => ({ spec, category: "kids" })),
  ...older.map((spec) => ({ spec, category: "older" })),
];

// A fixed shuffle (a small linear congruential generator), so the ids carry no order.
let seed = 20261114;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const order = all.map((_, index) => index);
for (let index = order.length - 1; index > 0; index -= 1) {
  const pick = Math.floor(random() * (index + 1));
  [order[index], order[pick]] = [order[pick], order[index]];
}

mkdirSync("public/avatars", { recursive: true });
const list = [];
order.forEach((source, index) => {
  const id = `a${String(index + 1).padStart(2, "0")}`;
  writeFileSync(`public/avatars/${id}.svg`, avatar(all[source].spec));
  list.push({ id, category: all[source].category });
});
writeFileSync("src/ui/leaderboard/avatarList.json", `${JSON.stringify(list, null, 1)}\n`);
console.log(`Wrote ${list.length} avatars.`);
