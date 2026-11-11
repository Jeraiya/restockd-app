# Syncing Restockd HQ and the Restockd app

Two dashboards, two jobs:

| | Restockd HQ (internal) | Restockd app (vendors) |
|---|---|---|
| Who | Only you | Every vendor, including you |
| Owns | Purchases, FIFO cost, VAT, bookkeeping | Prices, tags, booth sales, wallet, stolen registry |
| Database | Its own Supabase project | Its own Supabase project (`supabase/migrations`) |

They stay separate. A small bridge keeps your own stock in step.

## Today: CSV import (works now, no setup)

1. In HQ: **Stock → Export** (the `;` CSV).
2. In the app: **Inventory → Import from HQ** and pick the file.
3. Check the preview, choose whether to keep HQ prices, import.

The HQ `SKU` is stored on every card (`hqSku`, `items.hq_sku` in the database). Importing the same file again adds nothing twice.
Accessories are skipped. Slabs need their cert number added in the app (the export has no cert column).

## Later: live sync (needs both Supabase projects)

```
HQ ── new/changed product ──▶ edge function `hq-push` ──▶ app.items (matched on vendor_id + hq_sku)
HQ ◀── sale with hq_sku ───── edge function `hq-pull` ◀── app.sales where synced_to_hq_at is null
```

- **Stock flows HQ → app.** HQ stays the source for what you own and what it cost.
- **Sales flow app → HQ.** A booth sale in the app is written back as a sale in HQ, so FIFO and VAT stay right. After a successful write, the app sets `sales.synced_to_hq_at`.
- **No double selling.** The app marks an item sold in one transaction; HQ lowers stock when the sale arrives. If HQ sold the last unit first (for example online), `hq-push` sets the app item to sold and the tag page shows "Sold".
- **Keys.** Each edge function uses a service key of the other project, stored as a Supabase secret, never in the browser.
- **Retry.** Both functions are safe to run twice: they match on `hq_sku` and on sale id.

## What the database already guarantees (tested in `supabase/tests/rls_test.sql`)

- Vendors never see each other's stock, sales, tags or reports.
- Helpers see stock and their own sales only; never cost prices or payouts.
- A graded cert can be in one inventory at a time.
- A stolen cert cannot be added; the attempt is logged and the reporter is notified.
- A new stolen report always starts in review; only the Restockd team activates it.
- Buyers (not logged in) can open a tag page and check a cert, and see public fields only.

Run the tests against a local PostgreSQL:

```bash
createdb rstest
psql -d rstest -v ON_ERROR_STOP=1 -f supabase/tests/00_local_stub.sql -f supabase/migrations/0001_platform.sql -f supabase/tests/rls_test.sql
```
