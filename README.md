# Restockd app

The vendor app for card shows: NFC/QR price tags, automatic pricing from the Cardmarket price guide, booth checkout, wallet, channels, card show calendar, news and a worldwide stolen-slab registry.

This is **version 0.1: a clickable prototype with demo data**. Everything is stored in the browser (localStorage). No real payments, tags or marketplaces are connected yet.

```bash
npm install
npm run dev      # open the link Vite shows
npm test         # pricing rules, tag rules, stolen/duplicate slab checks, wallet
npm run build    # production build in dist/
```

## What's in it

| Area | Page | What it does |
|---|---|---|
| Overview | `/` | Get-started checklist, stock value with round actions, sales chart with show days marked, wallet with stacked cards and payout, next show, channels, most-scanned cards. Booth helpers see their own sales instead of the wallet |
| Booth mode | `/booth` | Full-screen selling at a show: tap a tag, one-tap discounts within the helper limit, pick payment, big Paid button, receipt, next customer |
| Inventory | `/inventory` | Stock with your price vs. Cardmarket trend, price breakdown per card ("decided by"), fixed prices, channels, max discount for helpers, scan-to-add with cert checks |
| Checkout | `/pos` | Add by tapping a tag, discounts limited per card for helpers, Tap to Pay / iDEAL QR / card / cash / Tikkie, cash-up per show |
| Show ready | `/show-ready` | Nightly price update, approve outliers, lock prices for the weekend, pause online listings of what you bring, labels for items without a tag |
| Tags | `/tags` | Tags as cards. Tap a tag (activate, link, reuse, unlink), lost/with-buyer, ownership (other vendors can't take your tag), history per tag |
| Channels | `/channels` | eBay (connected), Marktplaats (partner pending), your shop page, Cardmarket CSV export, Vinted drafts |
| Wallet | `/wallet` | Your own Mollie account: available, on its way, sold elsewhere, payouts, schedule, export |
| Consignment | `/consignment` | Sell for others, automatic split, mark as paid |
| Insights | `/insights` | Scans per item ("lots of interest, not sold"), revenue per show after booth fee |
| Card shows | `/shows` | Calendar per country, "I'm exhibiting" with booth number |
| News | `/news` | Releases, movers, announcements; movers in your stock |
| Stolen registry | `/stolen` | 5-step process (report → review → watched → hit → resolved), 3-step report form with police reference and proof, check a cert, hit handling, FAQ |
| Pricing rules | `/pricing` | Base price, show/online %, condition & language %, minimum margin, bulk, rounding, review thresholds |
| Settings | `/settings` | Invite a vendor (referral link), vendor, Mollie, team (owner / booth helper), tags, reset demo |
| Buyer: tag page | `/t/:id` | Vendor profile with follow, price vs. trend, pay with iDEAL, hold 15 min (expires automatically), more from this vendor, stolen-slab warning, "Try Restockd" for other vendors; binder tags; fake/lost tags |
| Buyer: cert check | `/check` | Public stolen-slab check |

Try tag codes `04A3F2B1` (linked card), `04A3F2C1` (binder), `04A3F2C2` (free), `04B7A001` (new, not activated), `04FF0001` (other vendor), `04A3F2C4` (lost). Switch to the helper user at the bottom of the menu to see the booth-helper view.

## Code

- `src/lib/pricing.ts`: the pricing engine (tested). All money is integer cents.
- `src/data/store.ts`: all actions (tags, selling, shows, wallet, consignment, stolen registry).
- `src/data/demo.ts`: example data. Show names, sales and news are made up.
- Styling comes from Restockd HQ (`src/styles.css`).

## Next steps

1. Supabase: accounts, one database for all vendors, row-level security per vendor.
2. Mollie Connect for Platforms: a payment account per vendor, application fee per sale.
3. Price data: Cardmarket price guide import (daily), plus Scryfall / Pokémon TCG sources.
4. eBay API sync; Marktplaats once approved as a partner.
5. Mobile app (Expo) for NFC: reading/writing tags is not possible from a web page on iPhone.
6. Tag production: NTAG213/424 DNA, programmed with `https://<tag-domain>/t/<serial>` and locked.
