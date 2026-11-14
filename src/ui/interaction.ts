// Whether the player has tapped, clicked or pressed a key on the page yet.
// Browsers only allow sound and speech after that, and the AI voice must
// never speak before it.
let interacted = false;

export function markInteracted(): void {
  interacted = true;
}

export function hasInteracted(): boolean {
  return interacted;
}
