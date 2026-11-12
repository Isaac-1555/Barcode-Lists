# Chrome Web Store Listing — Barcode Lists

## Short Description (132 char max)

Save barcodes once. Import from Excel, organize by list, and let Barcode Lists type them into your ordering site for you.

## Detailed Description

### One panel. Every barcode you order.

Barcode Lists lives in Chrome's side panel and keeps the UPCs you order every week organized, searchable, and one click away from your ordering site. It replaces the spreadsheet-and-sticky-note routine with a single dark panel that stays open while you work.

Built for Calgary Co-op FMC department staff — but useful anywhere barcodes have to be re-entered by hand.

### Why you'll keep it open

- **Type or paste a barcode** and it's saved instantly — numeric validation and duplicate detection are automatic
- **Organize by list** (Dairy, Produce, Frozen, Managers' Specials…) and drag to reorder them
- **Add notes up to 250 characters** to any barcode — "on sale 2/$5", "check date code", "TCO price 4.99"
- **Priority lists glow red** when management shares an important list, so nothing gets missed
- **Delete by mistake?** Press Ctrl+Z (⌘+Z on macOS) and the barcode returns to its exact spot, comment and all
- **Copy any barcode** with one click, or search it on your site with another
- **Full trash bin** for deleted lists, with restore and permanent delete

### Import a whole spreadsheet in one go

- Drop in an `.xlsx` or `.xls` file — the **UPC column is found automatically**, even when it isn't the first sheet
- **Review before you commit**: every extracted code is listed with duplicate flags, and the optional check-digit strip removes the last digit
- **TCO prices** found in the sheet are saved as barcode comments, ready for the pricing workflow

### Stop retyping twelve-digit numbers

- **Batch entry** creates a batch named after your list, opens Add Signs → Item Library, then types each barcode, searches it, ticks the result, and adds it — one at a time, with live progress
- **Template + TCO workflow** applies your sign template to the finished batch and sets each sign's price from the barcode's comment
- **Scrape UPCs** straight off the page you're on — consecutive UPC rows are pulled into the open list and stop automatically at the last row
- **Short codes are held back** — UPCs with 5 digits or fewer are never searched on the site; they come back in a "Skipped UPCs" dialog, each with a one-click search so you can add it by hand
- **Adjustable delay** so slower pages always finish loading, plus a stop button if you need to halt mid-run

### Works offline, syncs when you're back

- **Local-first storage** — everything works with no connection
- **Cloud sync** through Supabase keeps your lists available on your other devices
- **Sync indicator**: green connected, yellow syncing, red offline
- **Per-store accounts** (e.g., FMC07) — no email, no personal profile, passwords hashed before storage

### Private by design

Barcode data is used only for list management. No analytics, no tracking, no ads, and no personal data collected. See the privacy policy for details.

### Getting started

1. Click the Barcode Lists icon in the toolbar to open the side panel.
2. Enter your store number and password — new stores are created automatically.
3. Type barcodes in and press Enter, or import them from Excel.
4. Group them into lists and add notes.
5. Use Settings to match the XPath selectors to your ordering site, then run batch entry whenever you need it.

### Support

Questions, bugs, or feature requests: https://github.com/Isaac-1555/Barcode-Lists

---

## Permissions & privacy

- **Storage** — saves your barcode lists, categories, and session locally so everything works offline.
- **Side panel** — shows the app in Chrome's side panel for quick access.
- **Tabs / scripting of the active tab** — reads UPC rows and enters barcodes into the ordering site you already have open.
- **Supabase host access** — syncs your lists to your store's private cloud database.
- **Notifications / alarms** — keeps batch runs alive and reports progress.

Barcode data is used only for list management. No analytics, no tracking, no ads. No personal user data is collected.

---

## Listing Metadata

| Field | Value |
|---|---|
| **Name / Title** | Barcode Lists |
| **Category** | Productivity |
| **Language** | English (en-US) |
| **Support URL** | https://github.com/Isaac-1555/Barcode-Lists |
| **Privacy Policy URL** | https://github.com/Isaac-1555/Barcode-Lists/blob/main/privacy_policy.md |

## Store Assets

Files live in [`store-assets/`](store-assets/):

| File | Size | Used for |
|---|---|---|
| `screenshot-1-lists.png` | 1280×800 | Screenshot 1 — lists, notes, priority glow |
| `screenshot-2-excel-import.png` | 1280×800 | Screenshot 2 — Excel review modal |
| `screenshot-3-automation.png` | 1280×800 | Screenshot 3 — batch entry progress |
| `promo-tile-440x280.png` | 440×280 | Small promo tile |
| `marquee-1400x560.png` | 1400×560 | Marquee (optional) |

Icon: `icon128.png` (128×128) ships inside the extension package.

### Screenshot captions

1. **Every list, one panel.** Notes on each barcode, duplicates blocked, priority lists glowing red.
2. **Import from Excel.** The UPC column is found for you, duplicates are flagged, nothing is added until you say so.
3. **One-click batch entry.** Pick lists, hit the batch button, and watch it enter every barcode for you.

## Tech Stack (reference for listing content)

- **Chrome Extension Manifest V3** — side panel extension with service worker
- **Vanilla JavaScript (ES6+)** — async/await, Promises, template literals; zero build step
- **HTML5 / CSS3** — dark-themed responsive UI
- **Supabase (PostgreSQL REST API)** — cloud auth and bidirectional data sync
- **SheetJS (xlsx.js)** — client-side Excel file parsing
- **Chrome APIs** — chrome.storage.local, chrome.storage.session, chrome.sidePanel, chrome.tabs, chrome.runtime, chrome.alarms, chrome.notifications

## Checklist for the listing page

- [ ] Single purpose: barcode list management for retail/FMC — keep description focused on this
- [ ] Description accurate to code; permissions match stated features
- [ ] Privacy disclosures match privacy_policy.md and justifications.md
- [ ] No unattributed testimonials, no keyword stuffing (repeat "barcode" sparingly)
- [ ] Title under 45 characters ("Barcode Lists" = 13)
- [ ] 128x128 icon (icon128.png included in package)
- [x] Screenshots at 1280x800 (3 provided in store-assets/)
- [x] Small promo tile 440x280 and marquee 1400x560 provided
- [ ] Support URL and Privacy Policy URL set to the GitHub repo
