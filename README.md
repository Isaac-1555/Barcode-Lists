# Barcode Lists

A Chrome Extension (Manifest V3) for retail and store employees to store, organize, and manage barcode/UPC lists. Runs in Chrome's **Side Panel** for quick access without leaving the current tab. Supports cloud sync, AI-powered barcode extraction from images and Excel files, and fully offline operation.

## Features

### Barcode Management
- Add barcodes manually with numeric validation and duplicate detection
- Delete individual barcodes
- Copy barcodes to clipboard with one click
- Toast notifications for user feedback ("Copied", "Duplicate", etc.)

### Category Organization
- Create, rename, and delete categories (e.g., "Dairy", "Produce")
- Drag-and-drop category reordering via HTML5 drag events
- Sidebar navigation with active category highlighting

### AI-Powered Extraction
- **Image OCR** -- upload images (`.png`, `.jpg`, `.gif`, `.bmp`, `.webp`) of physical barcodes; an AI vision model extracts UPC/EAN numbers automatically
- **Excel Import** -- upload `.xlsx`/`.xls` files; the extension parses columns, identifies barcode-like values, and uses AI to clean messy or formatted entries (removing spaces, dashes, etc.)
- **Review Modal** -- after extraction, a review modal displays all found barcodes with checkboxes, duplicate detection ("Already in list" / "Exists" badges), select/deselect all, and a toggle to remove the check digit (last digit)

### Cloud Sync
- Bidirectional sync via Supabase (PostgreSQL)
- Works fully offline with local Chrome storage
- Sync status indicator: green (connected), red (offline), yellow/pulsing (syncing)

### Store-Based Authentication
- Each store (e.g., "FMC07") gets its own account
- New stores are auto-created on first login
- Password hashed with a DJB2-style hash before storage

### UI
- Fully dark-themed interface
- Responsive flexbox layout with sidebar + main content area
- Loading overlays during AI processing
- Modals for settings, review, and confirmations

## Architecture

The project is a zero-build-step Chrome Extension using vanilla JavaScript, HTML, and CSS. No bundler, framework, or package manager is required.

```
Barcode_saver/
├── manifest.json        # Chrome Extension manifest (v3)
├── background.js        # Service worker -- enables side panel on icon click
├── popup.html           # Main UI (rendered in Chrome side panel)
├── popup.js             # Core application logic (state, rendering, UI events)
├── popup.css            # Dark theme styling, animations, layout
├── supabase.js          # Supabase backend: auth, sync, CRUD via REST API
├── openrouter.js        # OpenRouter AI: image OCR + Excel barcode extraction
├── xlsx.full.min.js     # Vendored SheetJS library for Excel parsing
├── privacy_policy.md    # Privacy policy for Chrome Web Store
├── justifications.md    # Chrome Web Store permission justifications
└── README.md
```

### Module Responsibilities

| File | Role |
|---|---|
| `background.js` | Service worker. Sets `chrome.sidePanel` to open when the extension icon is clicked. |
| `popup.js` | Application core. Manages in-memory state, DOM rendering, category/barcode CRUD, file uploads, drag-and-drop, review modal, and settings. |
| `supabase.js` | Data layer. Handles store authentication (`login`/`logout`/`getSession`), connectivity checks (`isOnline`), and bidirectional sync (`syncFromRemote`/`syncToRemote`) via raw `fetch()` calls to Supabase REST. |
| `openrouter.js` | AI layer. Sends images (base64) or messy text values to the OpenRouter chat completions API for barcode extraction. Also manages API key storage. |
| `popup.html` | Single-page UI structure: login screen, main app (sidebar + content), toast element, loading overlay, review modal, settings modal. |
| `popup.css` | Complete dark theme with flexbox layout, modal system, toast notifications, loading spinner, sync status indicator, and styled form controls. |

## Tech Stack

| Technology | Purpose |
|---|---|
| Chrome Extension Manifest V3 | Platform (side panel extension with service worker) |
| Vanilla JavaScript (ES6+) | Application logic (async/await, Promises, template literals) |
| HTML5 / CSS3 | UI markup and dark-themed styling |
| Supabase (REST API) | Cloud database for authentication and data sync |
| OpenRouter AI API | AI-powered barcode extraction (model: `qwen/qwen3.6-plus:free`) |
| SheetJS (xlsx.js) | Client-side Excel file parsing |
| Chrome APIs | `chrome.storage.local`, `chrome.storage.session`, `chrome.sidePanel`, `chrome.tabs`, `chrome.runtime` |

## Data Model

### Local State (Chrome Storage)

Stored under `"barcodeData"` in `chrome.storage.local`:

```json
{
  "categoryOrder": ["Default", "Dairy", "Produce"],
  "categories": {
    "Default": ["012345678901", "098765432109"],
    "Dairy": ["111222333444"],
    "Produce": []
  },
  "active": "Default"
}
```

### Supabase Tables

**`stores`**

| Column | Type | Description |
|---|---|---|
| `id` | PK | Auto-generated store ID |
| `store_number` | string (unique) | Store identifier (e.g., "FMC07") |
| `password_hash` | string | DJB2 base36 hash of the password |
| `updated_at` | timestamp | Last sync timestamp |

**`barcodes`**

| Column | Type | Description |
|---|---|---|
| `id` | PK | Auto-generated row ID |
| `store_id` | FK -> stores.id | Owning store |
| `category_name` | string | Category this barcode belongs to |
| `barcode_value` | string | The barcode number (numeric string) |
| `created_at` | timestamp | Creation time (used for ordering) |

### Sync Strategy

Sync uses a **delete-all-then-reinsert** approach: `syncToRemote` deletes all barcodes for a store and re-inserts the full local state. This is a full replacement sync, not incremental.

## Permissions

| Permission | Justification |
|---|---|
| `storage` | Persist barcodes, categories, session, and API key locally |
| `sidePanel` | Render the extension UI in Chrome's side panel |
| `host_permissions: https://*.supabase.co/*` | Cloud sync and authentication via Supabase REST API |
| `host_permissions: https://openrouter.ai/*` | AI-powered barcode extraction from images and Excel data |

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Isaac-1555/Barcode-Lists.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project folder
5. The extension icon will appear in the Chrome toolbar

There is no build step. The extension loads directly from source.

## Usage

### Getting Started
1. Click the extension icon in the Chrome toolbar to open the side panel
2. Enter a store number (e.g., "FMC07") and a password
3. New stores are created automatically on first login
4. Data syncs to the cloud when online; works fully offline otherwise

### Managing Categories
- Click the **+** button in the sidebar to create a new category
- Right-click or use the context menu to rename or delete categories
- Drag and drop categories in the sidebar to reorder them

### Managing Barcodes
- Type a barcode number in the input field and press **Enter** or click **Add**
- Only numeric values are accepted; duplicates are rejected with a notification
- Click the copy icon next to a barcode to copy it to the clipboard
- Click the delete icon to remove a barcode

### Importing from Excel
1. Click the upload button and select an `.xlsx` or `.xls` file
2. The extension parses all columns and identifies barcode-like values
3. Messy or formatted values are cleaned using AI
4. A review modal shows all extracted barcodes with duplicate detection
5. Select the barcodes you want and click **Add Selected**

### Importing from Images
1. Click the upload button and select an image file (`.png`, `.jpg`, `.gif`, `.bmp`, `.webp`)
2. The AI vision model scans the image for UPC/EAN barcodes
3. Extracted barcodes appear in the review modal for selection

### Settings
- Open the settings modal (gear icon) to configure your **OpenRouter API key**
- The API key is required for AI-powered extraction features (image OCR and Excel cleaning)
- A validation test confirms the key is valid before saving

## API Keys

The extension uses the [OpenRouter](https://openrouter.ai/) API for AI features. To use image OCR and Excel barcode extraction:

1. Create a free account at [openrouter.ai](https://openrouter.ai/)
2. Generate an API key
3. Enter the key in the extension's settings modal

The extension uses the `qwen/qwen3.6-plus:free` model, which is free to use on OpenRouter.

## Privacy

- Barcode data is stored locally in Chrome storage and optionally synced to Supabase
- Images uploaded for OCR are sent to OpenRouter's API for processing and are not stored
- No personal user data is collected
- See [privacy_policy.md](privacy_policy.md) for the full privacy policy

## License

See the repository for license information.
