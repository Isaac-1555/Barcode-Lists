# Chrome Web Store Listing — Barcode Lists

## Short Description

Barcode Lists is a side-panel tool for Calgary Co-op FMC departments to save, organize, and auto-enter barcodes with Excel import and cloud sync.

## Detailed Description

### Save barcodes once. Use them anywhere.

Barcode Lists is built for Calgary Co-op Food Merchandising (FMC) department staff who handle barcodes every shift. Store a barcode once, organize it by category, and let the extension re-enter it into your ordering system whenever you need it — no more digging through spreadsheets or retyping 12-digit numbers.

The extension runs in Chrome's side panel, so your lists stay one click away without leaving the page you're working on.

### Features

**Fast barcode capture**
- Type or paste a barcode with automatic numeric validation and duplicate detection
- Copy any barcode to the clipboard with a single click
- Add a short note (up to 250 characters) to any barcode to remember what it is — "on sale," "out of stock," "price check"

**Organize like a pro**
- Create, rename, and delete categories (Dairy, Produce, Frozen, General Merchandise…)
- Drag and drop categories to match your department's layout
- Important categories (shared from management) glow red so you never miss a priority list

**Import from Excel**
- Upload .xlsx or .xls files — the "UPC" column is detected automatically
- Spaces and formatting are stripped so only the clean barcode number is added
- Review modal shows exactly what was found, flags duplicates, and lets you select or remove check digits before importing

**One-click automation**
- Enter every barcode in your active list into an external site automatically — one by one
- The extension types the barcode, searches, checks the result, and clicks add for you
- Adjustable delay between steps so the page fully loads each time
- Live progress readout and a stop button if you need to halt mid-run
- Create a batch and auto-fill it directly from your list

**Cloud sync & offline access**
- Bidirectional cloud sync via Supabase (PostgreSQL) — back up your lists and access them from any device
- Works fully offline using local Chrome storage
- Sync status indicator shows when you're connected, offline, or syncing

**Built for your store**
- Each store (e.g., FMC07) gets its own secure account — no personal data, no email required
- New stores are created automatically on first login
- Passwords are hashed before storage

### How to use

1. Click the Barcode Lists icon in the Chrome toolbar to open the side panel.
2. Enter your store number (e.g., FMC07) and a password. Your store account is created automatically the first time.
3. Add barcodes by typing them in and pressing Enter, or import them from an Excel file.
4. Group barcodes into categories like Dairy or Produce.
5. Click the play button to auto-enter a list into your ordering site, or use Settings to configure the XPath selectors for your site.
6. Your data syncs to the cloud automatically when you're online, and works offline too.

### Permissions & privacy

- **Storage** — saves your barcode lists, categories, and session locally so everything works offline.
- **Side panel** — shows the app in Chrome's side panel for quick access.
- **Supabase host access** — syncs your lists to your store's private cloud database.

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
- [ ] Screenshots at 1280x800 or 640x400 of the side panel, import review modal, settings
- [ ] Support URL and Privacy Policy URL set to the GitHub repo
