# Marketplace plan

The existing game has a distinctive leather and bronze style, free board settings, a device profile and server verified game results. Cosmetics fit this foundation without changing the rules or ranking.

1. Sell permanent board finishes and paired piece sets first, with a coordinated bundle. Suggested test prices: boards $2.99, pieces $2.49, subtle effects $1.49, bundle $5.99 USD (less than its $6.97 separate items). These are hypotheses to validate with players, not revenue forecasts.
2. Place a labelled Shop icon at the top left of Home, opposite Profile. Add Shop to the game Menu so the board stays uncluttered. Open a full screen storefront in the existing theme.
3. Let players inspect a live board preview, browse categories, and equip owned items. Keep original looks and existing Settings free. Preserve distinguishable sides and King crowns. Paid items only change appearance.
4. Before taking money, add recoverable account sign in, a server catalogue and private ownership records in Supabase. The current device profile token alone is insufficient for recovering purchases after losing a device.
5. Choose a checkout provider available to the actual merchant business and country. Create sessions in Netlify Functions using server controlled prices. Verify webhook signatures and successful payment, process events once, grant ownership transactionally, and handle refunds. Never unlock from a browser success page. See [Stripe's fulfillment guidance](https://docs.stripe.com/checkout/fulfillment) for this pattern; provider selection is still open.
6. Test successful, failed, delayed, duplicate and refunded purchases before launch. Measure shop visits, item previews and completed purchases before expanding the catalogue. Add cosmetic profile frames or seasonal collections only after demand is established.

## Sample implemented in D96

Twelve entries across boards, pieces, effects and bundles, including three free originals. Preview, explicit free demo unlock confirmation, collection, equip and device persistence work. The real board uses equipped finishes. No dependency, checkout, payment request or server ownership change is included. The separate `checkervia.marketplace.demo.v1` storage key is never proof of a real purchase.

The shop covers the mounted game and suspends the existing idle and abandonment countdown while browsing. It does not reset the game. Existing in flight AI work may complete beneath the shop. Keyboard history shortcuts are disabled while it is open. Close and Escape restore the underlying view and focus.

Validation: 1824 tests in 91 files pass, as do strict TypeScript, the production build and 20 final browser states. Phone, landscape and desktop views include 200 percent text. The complete browser journey checks preview, cancellation, explicit demo confirmation, ownership, equip on the real board, free originals, focus and an unchanged game position. The existing large bundle warning remains. Live payment and cross device purchase recovery are not implemented or tested in this sample.

## D106 usability audit and ownership update

| Flaw found | Change |
| --- | --- |
| Brown assets blended into brown chrome | Separate slate display plinths, clearer metal rims and contrasting King crowns |
| Every product reused a miniature board | Large paired piece samples and distinct effect emblems |
| Effects could not be inspected or replayed | Working move replay, five short effects, colour and friend perspective controls |
| Browsing a category could leave an unrelated item selected | Select an item in the chosen category without scrolling away from its products |
| Content could pass beneath the fixed header | Keep the header outside one scrolling content region |
| A global finish styled both players | Resolve appearance per participant, including moving pieces; keep boards personal |
| One device collection was reused across profiles | Separate profile namespaces; guest unlocks do not transfer to a new profile |

Sixteen entries now include Amethyst & Opal pieces and Sapphire Comet, Petal Drift and Copper Arc effects. Every pack supplies a dark variant for its owner's Black games and a light variant for its owner's White games. Both viewers see the same owner finish on those pieces. The rival's pieces use that rival's own inventory, even when the rival can see the buyer's look. Effects play only on the owning side's moving or selected pieces. No effect changes legal moves, timings, AI decisions or ranking.

The browser regression uses two real Board components and their movement layers. It covers both colours, separate board palettes, all effects, account switches, motion settings and cleanup under four times CPU throttling. This is a browser simulation of both perspectives, not a live private room test or a measurement on a physical low end phone.

Completed validation on 19 Nov 2026: 2023 tests in 105 files pass, TypeScript and both production builds pass, all 24 marketplace layout states pass, and 62 cosmetic browser assertions pass. The layout matrix includes 320 by 568, 844 by 390 and 1280 by 800 at normal and 200 percent text. Existing large bundle and admin font resolution notices remain. Evidence: `artifacts/marketplace-d106-tests.log`, `artifacts/marketplace-d106-build.log`, `artifacts/marketplace-d106-final.json` and `artifacts/cosmetics/checks.json`.

Private rooms remain in the separate `feature/online-rooms` worktree. There is no room transport in this checkout. Before integrating appearance sharing, the room server must load each participant's paid entitlements independently and send only that participant's verified appearance and assigned colour. Never accept demo storage, a room host's collection, or an opponent's displayed look as proof of ownership. Real checkout, paid fulfillment and this room transport are still production prerequisites.

## Live preview follow up (19 Nov 2026)

Paid effect cards now show their actual effect automatically when visible, without selecting the product. The larger board preview also cycles a move and its effect, with explicit Replay still available. Bundles can preview their included effect. Pause live previews stops automatic motion; animation Off, Reduced and the system motion preference are respected.

Each tag has its own layout row. Effect samples keep a complete base circle, correcting the apparent missing segment in the supplied Satin move trail screenshot. Effects animate inside that sample area rather than using the static emblem alone. Native visibility checks stop cards outside the scroll area and previews in hidden tabs. CSS reuses the same three effect marks; no frame loop, extra library or growing particle list is added. Actual game move effects still play once and remain scoped to the owner.

Regression checks cover automatic startup, the large board, pause and resume, hidden pages, offscreen cards, reduced motion, complete circles and tag clearance on phones and at 200 percent text. Evidence is saved under `artifacts/cosmetics` and `artifacts/marketplace-live`.

Validation: all 2046 tests in 107 files, strict TypeScript, both builds, 24 layout states and 109 cosmetic browser assertions pass. Phone card crops at 390px and at 320px with 200 percent text confirm that the label clears the complete circle. The browser run uses four times CPU throttling; it does not replace a physical low end phone test. Live payments and private room integration retain the limits described above.

## Next production item

- [ ] Choose merchant country, provider and recoverable account flow, then implement server checkout and webhook backed ownership. Approve any required dependency before installation.
