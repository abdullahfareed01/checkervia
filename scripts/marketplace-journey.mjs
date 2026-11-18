// Runs inside the isolated browser used by check-layout, with no live
// checkout or game reporting. Kept separate to make the flow reviewable.
export async function marketplaceJourney() {
  const pause = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
  function assert(condition, message) { if (!condition) throw new Error(message); }
  async function click(selector, text) {
    let button;
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      button = [...document.querySelectorAll(selector)].find((node) => (!text || node.textContent.includes(text)) && !node.disabled);
      if (button) break;
      await pause(50);
    }
    assert(button, `Missing ${selector}: ${text || ""}; selected ${document.querySelector('.shop-detail h2')?.textContent}; action ${document.querySelector('.shop-primary')?.textContent}`);
    button.click(); await pause();
  }
  function key(key, shiftKey = false) {
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
  }
  await click(".home-shop");
  const scope = document.querySelector(".marketplace").dataset.collectionScope;
  assert(document.getElementById("root").inert, "Background must be inert");
  assert(document.activeElement.getAttribute("aria-label") === "Close marketplace", "Close starts with focus");
  key("Tab", true);
  const lastVisible = [...document.querySelectorAll(".marketplace button:not(:disabled)")].filter((button) => button.getClientRects().length > 0).at(-1);
  assert(document.activeElement === lastVisible, "Reverse Tab must reach the last visible control");
  key("Tab");
  assert(document.activeElement.getAttribute("aria-label") === "Close marketplace", "Forward Tab wraps to Close");
  const original = document.documentElement.dataset.shopBoard;
  await click(".shop-product", "Jade Pavilion");
  assert(document.documentElement.dataset.shopBoard === original, "Preview must not equip");
  assert(document.querySelector(".shop-detail .shop-look").dataset.shopBoard === "jade", "Preview must show chosen board");
  await click(".shop-primary");
  await click(".shop-secondary", "Cancel");
  assert(!JSON.parse(localStorage.getItem(scope) || '{"owned":[]}').owned.includes("jade"), "Cancel must not unlock");
  await click(".shop-primary");
  key("Escape"); await pause();
  assert(document.querySelector(".marketplace") && !document.querySelector(".shop-confirm"), "First Escape dismisses confirmation");
  await click(".shop-primary");
  await click(".shop-primary", "Confirm demo unlock");
  assert(document.querySelector(".shop-primary").textContent === "Equip look", "Unlock must offer equip");
  assert(document.activeElement === document.querySelector(".shop-primary"), "Unlock must restore focus to Equip");
  await click(".shop-primary");
  assert(document.documentElement.dataset.shopBoard === "jade", "Equipped finish must reach game root");
  await click(".shop-filters button", "My collection");
  assert([...document.querySelectorAll(".shop-product")].some((node) => node.textContent.includes("Jade Pavilion")), "Unlocked item appears in collection");
  key("Escape"); await pause();
  assert(!document.querySelector(".marketplace") && !document.getElementById("root").inert, "Close restores background");
  assert(document.activeElement.classList.contains("home-shop"), "Close restores Home focus");
  await click(".menu-card", "2 Players");
  const before = document.querySelector(".board").innerHTML;
  const boardColour = getComputedStyle(document.querySelector(".board .square-dark")).backgroundColor;
  assert(boardColour === "rgb(32, 87, 73)", "Real board uses Jade finish");
  await click(".menu > .bar-button");
  await click(".menu-tile", "Shop");
  await click(".shop-filters button", "My collection");
  await click(".shop-product", "Original Board");
  await click(".shop-primary", "Equip look");
  key("Escape"); await pause();
  assert(document.activeElement.matches(".menu > .bar-button"), "Game Menu focus is restored");
  assert(document.querySelector(".board").innerHTML === before, "Browsing must preserve every board square");
  assert(document.documentElement.dataset.shopBoard === "classic", "Free original can be restored");
  // Leave the shop open for the same layout and input checks as other states.
  await click(".menu > .bar-button"); await click(".menu-tile", "Shop");
  document.querySelector(".marketplace").dataset.journey = "passed";
}
