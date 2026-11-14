// A player's avatar (D62): one of the drawings in public/avatars, loaded
// lazily as its own small SVG file, or a neutral person for players from
// before avatars (and while a broken file fails). Always decorative: the
// player's name is next to it.
import { useState } from "react";
import { isAvatarId } from "../../leaderboard/avatars";
import avatarList from "./avatarList.json";

export type AvatarCategory = "men" | "women" | "kids" | "older";

// The profile screen's filter. Only a filter: it is never sent or stored.
export const AVATAR_CATEGORIES: readonly { id: AvatarCategory; label: string }[] = [
  { id: "men", label: "Male" },
  { id: "women", label: "Female" },
  { id: "kids", label: "Kid" },
  { id: "older", label: "Older adult" },
];

export function avatarsIn(category: AvatarCategory): string[] {
  return (avatarList as { id: string; category: string }[]).filter((avatar) => avatar.category === category).map((avatar) => avatar.id);
}

export function categoryOf(id: string | null): AvatarCategory | null {
  return ((avatarList as { id: string; category: string }[]).find((avatar) => avatar.id === id)?.category as AvatarCategory | undefined) ?? null;
}

export const avatarUrl = (id: string) => `/avatars/${id}.svg`;

/** The neutral person: before a profile exists, and for players without an avatar. */
export function PersonIcon() {
  return (
    <svg className="avatar-person" viewBox="0 0 128 128" aria-hidden="true">
      <circle cx="64" cy="64" r="64" fill="#4a3324" />
      <circle cx="64" cy="52" r="22" fill="#c9a77c" />
      <path d="M22 118c4-24 22-36 42-36s38 12 42 36" fill="#c9a77c" />
    </svg>
  );
}

export function Avatar({ id, size, className = "" }: { id: string | null; size: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const known = isAvatarId(id) && broken !== id;
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      {known ? (
        <img src={avatarUrl(id)} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(id)} />
      ) : (
        <PersonIcon />
      )}
    </span>
  );
}
