# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

This is a Chrome Extension (Manifest V3) that runs in the side panel for managing barcode lists. It uses vanilla JavaScript with no build step—load directly from source into Chrome.

## Loading the Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the project folder
4. Click the extension icon to open the side panel

No build, no bundler, no package manager.

## Key Files

| File | Role |
|------|------|
| `background.js` | Service worker that opens side panel on icon click |
| `popup.js` | Application core: state management, DOM rendering, events |
| `supabase.js` | Backend: auth, sync, CRUD via Supabase REST API |
| `openrouter.js` | AI layer: image OCR and Excel barcode extraction via OpenRouter |

## Architecture

**State Flow**: `popup.js` manages an in-memory `state` object (categoryOrder, categories, comments, active). All changes save to `chrome.storage.local` immediately, then sync to Supabase if online.

**Sync Strategy**: `syncToRemote()` uses delete-all-then-reinsert. It deletes all remote barcodes for a store, then re-inserts the full local state. Not incremental—full replacement each time.

**Important Lists (Red Glow)**: Categories can be marked as "important" via the `important_categories` Supabase table. When the companion app sends a list marked as important, it inserts a row into `important_categories(store_id, category_name)` alongside writing barcodes to the `barcodes` table. The extension fetches these during `syncFromRemote()` via `syncImportantCategories()` and stores them in `state.importantCategories`. Important categories display a permanent red pulsing glow until the category is deleted. The extension never writes to `important_categories` — it's write-only from the companion app, read-only from the extension.

**Auth**: Store-based auth (not user-based). Each store (e.g., "FMC07") is a separate account. Passwords are hashed with a DJB2-style hash (`simpleHash()` in supabase.js) before storage/transmission.

**Data Model**:
- Categories stored as `{ categoryName: [barcode1, barcode2, ...] }`
- Comments stored separately as `{ barcodeValue: commentText }` (max 250 chars)
- Local state key: `"barcodeData"` in `chrome.storage.local`
- Session stored in `chrome.storage.session` (auto-clears on browser close)

## Common Tasks

**Adding a barcode**: Call `addBarcode(value)` — validates numeric only, rejects duplicates with toast notification.

**Adding a category**: Call `createCategory(name)` — auto-sets as active category.

**Syncing changes**: Call `saveAndSync()` after any state mutation — saves locally first, then pushes to Supabase if online.

**Testing AI extraction**: Requires OpenRouter API key in settings. Use the Settings modal (gear icon) to configure.

## Important Patterns

- All barcodes stored as string numeric values (e.g., `"012345678901"`)
- Comments limited to 250 characters
- `isOnlineMode` checked before every sync operation
- `showToast(msg)` for user feedback, `showLoadingOverlay(msg)` for async operations
- File uploads handled in `handleFileUpload()` — supports `.xlsx`, `.xls`, and common image formats
- Excel parsing uses vendored SheetJS (`xlsx.full.min.js`)