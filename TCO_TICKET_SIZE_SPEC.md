# Feature spec — TCO automation with per-UPC TICKET SIZE templates

Status: **implemented in 7.17** (new card paths + per-UPC apply button)
Owner: Isaac Judah (request) / coding agent (implementation)
Repo: `Barcode-Lists` (this repo)
Sample input: `Test TCO.xlsx` (copied next to this file)
Tests: `test/tco-ticket-size.test.mjs` (`node --test test/*.test.mjs`)

---

## 1. Goal

Department TCO request sheets are changing. Departments other than the existing one will send a
sheet that adds a **`TICKET SIZE`** column. That column decides **which template card** is applied
to each individual sign, instead of today's "one template for the whole batch".

Required behaviour:

- **Sheet has no `TICKET SIZE` column** → run today's TCO automation, unchanged.
- **Sheet has `TICKET SIZE`** → create/load the batch and add the signs exactly like today, then
  for **each UPC individually**: search it → select it → Change template → pick the card mapped
  from its `TICKET SIZE` value → Apply → continue with the next UPC.

Everything stays deterministic and runs inside `content.js` against the live site. No network
calls, no new permissions, no build step.

---

## 2. Current behaviour (baseline to extend, don't rewrite)

| Piece | Where | What it does today |
|---|---|---|
| Excel import | `processExcelFile()` in `popup.js` | Finds `UPC` header (first 10 rows, any sheet) via `findUPCColumn()`, finds `TCO Price*` via `findPriceColumn()`, strips non-digits (`cleanUPCValue`), skips rows where column H contains "no change" (`hasNoChangeComment`). Groups per sheet, one group per file. |
| Review modal | `showReviewModal()` / `addSelectedBarcodes()` | Shows `TCO 3.99` badge; on add writes `state.comments[barcode] = "TCO Price: 3.99"` (comment textarea, 250-char cap, synced to Supabase `comments`). |
| TCO detection | `getTcoPrice()` + `isTcoList()` + `updateAutomationButtons()` | A list is a TCO list when **any** barcode has a `TCO Price:` comment → yellow broom button replaces the blue add button. |
| Run start | `startTcoBatchAdd()` | `prepareRunBatches()` (skips UPCs ≤ 5 digits), attaches `b.prices = { upc: "3.99" }`, sends `AUTO_TCO_BATCH_START` with `{ batches, config }`. |
| Runner | `runTcoBatches()` in `content.js` | Per batch: `doBatchSetup` (create batch, Add signs → From item library) → `runAutoAddLoop` (search + tick + add each UPC) → `openBatchAndSelectAll()` (open batch breadcrumb → persist resume state → `location.reload()`) → on resume: select-all → `applyTcoTemplate()` (fixed card) → `runTcoEditLoop()` (search each UPC → edit sign → set price → save → back to batch) → next batch. |
| Resume | `setTcoResume()` / `resumeTcoIfPending()` | Batch-level resume after the deliberate `location.reload()`, 120 s TTL. |
| Config | `DEFAULT_AUTO_ADD_CONFIG` + `#settingsModal` in `popup.html` + `saveSettings()` | All XPaths are editable, stored under `autoAddConfig` in `chrome.storage.local`. |

Do not change the non-TICKET-SIZE path. It must behave bit-for-bit as today.

---

## 3. Input formats

### 3.1 Existing (unchanged)

`Dalhousie TCO requests for Friday Aug 7-26.xlsx` — e.g.:
`UPC# | Description | Size | UOM | FM # | Retail | TCO Price | Notes`
UPC values may contain spaces/dashes (`6 2798717297 3`) → `cleanUPCValue` already handles it.

### 3.2 New (`Test TCO.xlsx`)

Workbook has a single sheet named **`Sheet1`** (not `DEPARTMENT`). A1 holds the title
`DEPARTMENT`; the real header row is **row 2**:

| UPC | TCO PRICE | END DATE | TICKET SIZE |
|---|---|---|---|
| 6310021940 | 3.99 | 46352 (2026-11-26) | 9 |
| 6310037554 | 4.99 | 46368 (2026-12-12) | r9 |

- `UPC` — same handling as today.
- `TCO PRICE` — same handling as today (numeric → `toFixed(2)`).
- `END DATE` — Excel serial date. **Unused** (Q3 answered "no").
- `TICKET SIZE` — string or number; e.g. `9`, `r9`, `i9`, `4`, `r4`, `1`, `r1`, `12`.
  Normalise with `normaliseTicketSize()` in `tco-utils.js`: lowercase, last whitespace token,
  strip trailing text (`12up` → `12`). Numeric cells (`9`) become `"9"`; do not read `cell.w`.

### 3.3 Template card map (from the request email)

| TICKET SIZE | Template card XPath |
|---|---|
| `i9` | `//*[@id="container"]/div[30]/ppr-card-component/div/div[1]` |
| `9` | `//*[@id="container"]/div[23]/ppr-card-component/div/div[1]` |
| `r9` | `//*[@id="container"]/div[22]/ppr-card-component/div/div[1]` |
| `4` | `//*[@id="container"]/div[16]/ppr-card-component/div/div[1]` |
| `r4` | `//*[@id="container"]/div[15]/ppr-card-component/div/div[1]` |
| `1` | `//*[@id="container"]/div[9]/ppr-card-component/div/div[1]` |
| `r1` | `//*[@id="container"]/div[8]/ppr-card-component/div/div[1]` |
| `12` | `//*[@id="container"]/div[4]/ppr-card-component/div/div[1]` |

> ⚠️ These are **position-dependent**. `div[N]` shifts if the template modal gains/loses a card.
> Optional hardening (Q8): match the card by its visible title text and treat the XPath as fallback.
> `div[1]` is the clickable card face; the old `div[2]` paths are kept in
> `LEGACY_TICKET_SIZE_TEMPLATES` only to migrate stored settings.

---

## 4. Decisions (defaults the agent may proceed with)

- **D1 — Storage of ticket size.** Reuse the existing comment field, one labelled line per value:
  ```
  TCO Price: 3.99
  Ticket Size: r9
  ```
  Comments are already per-UPC, 250-char capped, locally persisted and synced to Supabase, and
  the UI already uses a `<textarea>` (newlines are safe). Parsers must read **line by line**, so a
  sheet that carries only one of the two values still works.
  Rejected alternative: a separate `chrome.storage.local` key — it would not survive sync/list
  sharing and would silently fall back to batch mode on another machine.
- **D2 — TCO list detection.** `isTcoList()` returns true when a barcode has **either** a
  `TCO Price:` or a `Ticket Size:` comment. The yellow broom button is shown for both.
- **D3 — Mode is per batch.** `startTcoBatchAdd()` sets `b.ticketSizes = { upc: "r9" }`; the batch
  runs the new per-UPC loop **iff** the map is non-empty. Batches with no ticket sizes keep today's
  select-all + fixed template flow.
- **D4 — Mixed rows in a ticket-size batch.** Rows that were added to the batch but have **no**
  ticket size keep the default template and are counted in `templateSkipped`. They are still added
  to the batch; nothing else is retried for them.
- **D5 — Unknown size.** If a UPC's size has no configured XPath, report
  `AUTO_ADD_ERROR { barcode, message: 'No template for ticket size "<x>"' }`, skip that UPC,
  continue the run. Never abort the whole batch for one bad row.
- **D6 — Card click target.** Click the **configured XPath element itself** (`div[1]` card face). Do
  not climb to `closest('ppr-card-component')`: the host node ignores the click, which is why the old
  `div[2]` paths appeared to select nothing.
- **D7 — No price pass on ticket-size sheets.** Per the request, sheets with `TICKET SIZE` skip
  the per-sign price edit entirely; the run only applies templates. `TCO PRICE` is still imported
  and stored in the comment (badge in the review modal) but is not written to the site.
  `END DATE` is ignored. Legacy sheets keep template → price, unchanged.
- **D8 — Indent/style.** `popup.js` / `content.js` use **2-space** indentation, vanilla ES2022, no
  comments unless behaviour is non-obvious, no build step, no new dependencies.

---

## 5. Answers (resolved)

1. **Size map** — the eight sizes in §3.3 are the supported set; anything else is reported per UPC (D5).
2. **Single-row select** — click the same checkbox used in the add loop:
   `tcoSelectRowXPath = '//*[@id="ItemView-select-all"]/span'` (configurable). `content.js` also
   tries `SignView-row-0-select` and `SignView-select-all` as fallbacks before reporting
   `Sign not found`.
3. **Price / END DATE** — no per-sign price edit for ticket-size sheets; `END DATE` is
   informational only.
4. **Card click target** — click the exact `div[1]` element the XPath resolves to. The old
   `closest('ppr-card-component')` climb is gone.
5. **Mixed rows** — blank `TICKET SIZE` keeps the default template, is counted as skipped, and the
   run continues (D4).
6. **Comment storage** — size is stored as a second line `Ticket Size: r9` (D1); unrelated
   comment text is preserved on rewrite.
7. **Order per UPC** — search → select → change template → pick card → apply
   (`tcoTicketSizeApplyXPath`, the sign-edit `cui-button[2]`) → next UPC. No price step, so template
   re-render cannot break anything.
8. **Robustness** — XPath-only mapping today; the map is editable in Settings. Name-based matching
   stays a possible follow-up.

---

## 6. Implementation

### 6.1 Comment helpers (`tco-utils.js`)

`TCOUtils` (classic script, `module.exports` guarded for Node tests) owns the parsing:

- `parseCommentFields(comment)` → `{ fields, labels, extra }`. `fields` is keyed by lowercase
  label (`tco price`, `ticket size`); `labels` remembers the original casing; `extra` keeps every
  line that is not `label: value` so free text is never destroyed.
- `buildComment({ fields, labels, extra })` → canonical `TCO Price: …` / `Ticket Size: …` lines,
  then the preserved extra lines, capped at 250 chars.
- `readCommentMeta(comment)` → `{ price, ticketSize }`, size normalised.
- `mergeCommentMeta(comment, { price, ticketSize })` → merged string; setting an empty value
  removes only that label.
- `normaliseTicketSize(value)` → `" R9 "` → `"r9"`, numeric `9` → `"9"`, `"12up"` → `"12"`.
- `findTicketSizeColumn(workbook, sheetName, utils)` → `{ headerRow, col }` using
  `/ticket[\s_-]*size/` over the first 10 rows.
- `TICKET_SIZE_TEMPLATES` — the default size → clickable card XPath map from §3.3.
- `LEGACY_TICKET_SIZE_TEMPLATES` — the superseded `div[2]` map; used only to migrate stored configs.

`popup.js` keeps thin wrappers `getTcoPrice(barcode)` / `getTicketSize(barcode)` and a merge-only
`setBarcodeMeta(barcode, patch)` that updates local state plus `saveComment` / `deleteComment`
when online. `addSelectedBarcodes()` calls it once per selected barcode when either field exists,
including barcodes that already sit in another list.

### 6.2 Excel import (`popup.js`)

`processExcelFile()` builds `ticketSizes` next to `prices`:

- column found through `TCOUtils.findTicketSizeColumn(workbook, sheetName, XLSX.utils)`;
- first value per UPC wins (`ticketSizes[cleaned] === undefined`);
- value normalised through `TCOUtils.normaliseTicketSize(cell.v)` (numeric cells → `"9"`);
- group pushed as `{ tableName, barcodes, prices, ticketSizes }`;
- `hasNoChangeComment` behaviour (column H) unchanged.

`showReviewModal()` attaches `item.ticketSize` and renders a `.ticket-badge` (`Ticket r9`).
On add, 12-digit UPCs lose their check digit automatically; the review toggle is off by default.

### 6.3 Review modal UI (`popup.js` + `popup.css`)

Next to the existing `.price-badge`:

```html
<span class="ticket-badge">Ticket r9</span>
```

`.ticket-badge` = same pill as `.price-badge`, different hue (e.g. `#4a9eff` on `rgba(74,158,255,.15)`).
Show it only when `item.ticketSize` is set. No new modal, no new screen.

### 6.4 TCO detection (`popup.js`)

`isTcoList(name)` → `barcodes.some(b => getTcoPrice(b) || getTicketSize(b))`.

### 6.5 Config + Settings (`popup.js` + `popup.html`)

`DEFAULT_AUTO_ADD_CONFIG` gains:

```js
tcoSelectRowXPath: '//*[@id="ItemView-select-all"]/span',
tcoTicketSizeApplyXPath: '//*[@id="app_container"]/ppr-sign-edit/.../cui-button[2]/span/button',
tcoTicketSizeTemplates: { ...TCOUtils.TICKET_SIZE_TEMPLATES },
```

On load, stored maps are normalised: entries equal to `TCOUtils.LEGACY_TICKET_SIZE_TEMPLATES[size]`
are replaced with the new `div[1]` default; custom user paths are kept; missing keys are backfilled.

`TICKET_SIZE_TEMPLATES` lives in `tco-utils.js`:

```js
{
  '1':  '//*[@id="container"]/div[9]/ppr-card-component/div/div[1]',
  'r1': '//*[@id="container"]/div[8]/ppr-card-component/div/div[1]',
  '4':  '//*[@id="container"]/div[16]/ppr-card-component/div/div[1]',
  'r4': '//*[@id="container"]/div[15]/ppr-card-component/div/div[1]',
  '9':  '//*[@id="container"]/div[23]/ppr-card-component/div/div[1]',
  'r9': '//*[@id="container"]/div[22]/ppr-card-component/div/div[1]',
  'i9': '//*[@id="container"]/div[30]/ppr-card-component/div/div[1]',
  '12': '//*[@id="container"]/div[4]/ppr-card-component/div/div[1]'
}
```

Settings modal (TCO block, after `#tcoBackToBatch`):

- `input#tcoSelectRow` — "Select one sign in the filtered batch XPath"
- `input#tcoTicketSizeApply` — "Apply after picking the ticket size card",
  default `//*[@id="app_container"]/ppr-sign-edit/.../cui-button[2]/span/button`
- `textarea#tcoTicketSizeTemplates` — placeholder `9=//*[@id="container"]/div[23]/.../div[1]`,
  **one `size=xpath` per line**
- hint text updated to describe both modes.

`showSettingsModal()` renders the map as lines; `saveSettings()` parses lines back into an object,
skipping blanks and lowercasing keys. Persist through the existing `autoAddConfig` key.

Before launch, validate: for every UPC in every batch with a ticket size, the size must exist in
`tcoTicketSizeTemplates`; otherwise `showToast('No template for ticket size(s): r5, i4')` and abort.
Extend `getMissingXpaths(includeTco, hasTicketSizes)` with `tcoSelectRowXPath`,
`tcoTicketSizeApplyXPath` and a non-empty map when `hasTicketSizes`.

### 6.6 Batch payload (`startTcoBatchAdd`)

```js
batches.forEach((b) => {
  b.prices = {};
  b.ticketSizes = {};
  b.barcodes.forEach((code) => {
    const price = getTcoPrice(code);
    const size = getTicketSize(code);
    if (price) b.prices[code] = price;
    if (size) b.ticketSizes[code] = size;
  });
});
...
chrome.tabs.sendMessage(tab.id, {
  type: 'AUTO_TCO_BATCH_START',
  batches: batches.map(b => ({
    name: b.name, barcodes: b.barcodes, prices: b.prices, ticketSizes: b.ticketSizes
  })),
  config: autoAddConfig
});
```

### 6.7 Runner (`content.js`)

Keep `runTcoBatches()` as the entry point. After the add loop, branch:

```js
const hasTicketSizes = Object.keys(batch.ticketSizes || {}).length > 0;
const opened = await openBatchAndPrepare(config, batch, b, batches, resumedBatch, !hasTicketSizes);
if (opened) {
  const result = hasTicketSizes
    ? await runTicketSizeTemplateLoop(batch, config, b + 1, batches.length)
    : await runTcoEditLoop(batch, config, b + 1, batches.length);
}
```

Refactor `openBatchAndSelectAll()` → `openBatchAndPrepare(..., applyBatchTemplate)`:

- open breadcrumb / resume / reload dance unchanged (`setTcoResume` still batch-level);
- `applyBatchTemplate === true` → today's select-all + `applyTcoTemplate()`;
- `applyBatchTemplate === false` → no select-all, no template; return true so the per-UPC loop starts.

New `runTicketSizeTemplateLoop(batch, config, batchIndex, batchCount)`:

For each `barcode` in `batch.barcodes` (respect `autoAddState.stopped` between every step):

1. `size = batch.ticketSizes[barcode]`; no size → `templateSkipped++` (D4), continue.
2. `cardXPath = config.tcoTicketSizeTemplates?.[size]`; missing → `AUTO_ADD_ERROR` (D5), skip, continue.
3. Report progress: `AUTO_TCO_TEMPLATE_PROGRESS { index, total, barcode, ticketSize, batchName, batchIndex, batchCount }`.
4. Search the UPC: set `config.searchInputXPath` to `""` then `barcode`, click
   `config.searchButtonXPath`, `await sleep(config.delayMs)`.
5. Select the row: try `config.tcoSelectRowXPath` (default
   `//*[@id="ItemView-select-all"]/span`), then `SignView-row-0-select`, then
   `config.tcoSelectAllXPath`, each with `min(timeoutMs, 4000)`. First hit is clicked.
   If none → `AUTO_ADD_ERROR`, skip, continue.
6. Click `config.tcoChangeTemplateXPath` (waitForElementClickable), sleep.
7. Resolve the card: `waitForElementClickable(cardXPath, timeoutMs)`; click the element itself
   (D6, no `closest('ppr-card-component')`), sleep.
8. Click `config.tcoTicketSizeApplyXPath` (fallback `config.tcoApplyTemplateXPath` if absent), sleep.
9. No price step (D7). The batch grid stays open, so the next UPC can search immediately.
10. `applied++` / on any handled failure `skipped++`; mirror into
    `autoAddState.totalTemplates` / `totalTemplateSkipped`.

`AUTO_TCO_DONE` now reports `added`, `edited`, `templates`, `skipped` (includes
`templateSkipped`), `total`, `batches`. The popup shows "TCO templates applied: N" when
`templates > 0`, otherwise "TCO prices set: N".

### 6.8 Resume safety

`setTcoResume()` currently stores `batches` (with `ticketSizes` once 6.6 ships), `config`,
`batchIndex`, `phase`, counters. That is enough: on resume the batch restarts from its first UPC,
and re-applying a template / re-saving a price is idempotent. Do not add mid-loop resume unless
asked — today's price loop has the same property.

### 6.9 Stop / errors

- Honour `autoAddState.stopped` before each UPC and between every click.
- Every failure path is `AUTO_ADD_ERROR` + skip + continue; only a missing batch surface (open
  breadcrumb / select-all in the old mode) aborts the batch, same as today.
- Never call `location.reload()` inside the per-UPC loop.

---

## 7. Edge cases

| Case | Expected |
|---|---|
| Sheet without `TICKET SIZE` | Today's flow, identical output |
| Sheet with `TICKET SIZE`, no `TCO PRICE` | Per-UPC templates only |
| Sheet with both | Per-UPC templates only; price imported/stored but not written to the site (D7) |
| `TICKET SIZE` blank on some rows | Row added to batch, keeps default template, counted as skipped |
| Size with different case/whitespace (` R9 `) | Normalised to `r9` |
| Size not in map | Error toast/log per UPC, run continues |
| UPC ≤ 5 digits | Already skipped by `prepareRunBatches()` |
| UPC with 12 digits | Check digit stripped on add (auto) |
| Row H says "no change" | Already skipped at import |
| Two sizes on one UPC (cell text) | Last whitespace token wins (`Ticket 9` → `9`) |
| `TICKET SIZE` header spelled `Ticket size ` / `ticket_size` / `ticket-size` | Accepted by `/ticket[\s_-]*size/` |
| Site cards re-ordered | User edits `tcoTicketSizeTemplates` in Settings; no code change |
| Automation stopped mid-batch | `AUTO_ADD_STOPPED`, resume state cleared |

---

## 8. Test plan

Manual (required, against the live site):

1. Import `Test TCO.xlsx` → review modal shows `TCO 3.99` + `Ticket 9` badges for row 1, `TCO 4.99` + `Ticket r9` for row 2; check-digit toggle starts off and both 10-digit UPCs stay intact.
2. Run the yellow broom on that list → batch created, both UPCs added, each one receives the
   template for its size (check the batch grid after the run); no price edits happen.
3. Re-run the legacy Dalhousie sheet → identical behaviour to 7.15 (select-all, single template, price loop).
4. Force an unknown size (`ticketSizes[barcode] = 'zz'`) → error for that UPC only, other UPCs finish.
5. Stop button mid-run → stops within one UPC, `TCO stopped` state, no resume state left.
6. Reload the tab mid-run (after the batch-open reload) → resumes the batch from the top.
7. Settings: edit the map, reload the extension, values persist; malformed line ignored.

Automated (`tco-utils.js` is a classic script with a guarded `module.exports`):

```bash
node --test test/*.test.mjs
```

`test/tco-ticket-size.test.mjs` covers:

- `Test TCO.xlsx` read through `fs.readFileSync` + `XLSX.read(buf, { type: "buffer" })`
  (**`XLSX.readFile` does not work in Node** — the vendored UMD has no fs shim);
- sheet name `Sheet1`, `DEPARTMENT` title row, header row 2, numeric `9` and string `r9`;
- header variants `TICKET SIZE`, `Ticket  size`, `ticket_size`, and absence;
- normalisation (`" R9 "` → `r9`, `9` → `"9"`, `"12up"` → `"12"`, empty → `null`);
- comment round-trip for price only / size only / both / empty, preservation of free-text lines,
  and removing one label without clobbering the other;
- the default map covers all eight sizes and every entry targets a `ppr-card-component`.

Keep the extension loadable from source at all times.

---

## 9. Acceptance criteria

- [x] Old sheets run exactly as 7.15 (no behaviour change, no new prompts).
- [x] New sheets produce one template application **per UPC**, chosen by `TICKET SIZE`.
- [x] Ticket size persists with the list (comment), survives reload, shows in the review modal.
- [x] Missing/unknown size never aborts the run; it is reported and skipped.
- [x] Stop works at every step; resume works after the deliberate reload.
- [x] Settings expose the size→XPath map, the single-row select XPath, and the per-UPC apply button; values persist.
- [x] No new permissions, no new runtime dependencies, no build step.
- [ ] `manifest.json` bumped to **7.17**, README note updated, zip
      `Barcode-Lists-7.17-upload.zip` produced the usual way.

---

## 10. Files to touch

| File | Change |
|---|---|
| `tco-utils.js` | comment parsing/merging, ticket-size normalisation, header lookup, default template map |
| `popup.js` | ticket-size column import, review badge, TCO detection, `setBarcodeMeta`, config defaults + settings save/load, payload, pre-flight validation, `AUTO_TCO_TEMPLATE_PROGRESS` handling, check-digit rule |
| `popup.html` | `tco-utils.js` script tag, `#tcoSelectRow` input, `#tcoTicketSizeApply` input, `#tcoTicketSizeTemplates` textarea, numbered step layout for every automation |
| `popup.css` | `.ticket-badge`, `.settings-textarea`, settings step/section styles |
| `content.js` | `openBatchAndPrepare()` refactor, `runTicketSizeTemplateLoop()`, `selectSignInBatch()`, `applyTemplateCard()`, new progress message + counters |
| `AGENTS.md` | document the two TCO modes + comment format |
| `README.md` | TCO section + 7.17 changelog |
| `manifest.json` | version `7.17` |
| `test/tco-ticket-size.test.mjs` | Node built-in runner tests |

Leave `background.js`, `supabase.js`, `manifest` permissions and sync logic untouched.

---

## 11. Notes for the implementing agent

- Read `runTcoBatches()` → `openBatchAndSelectAll()` → `applyTcoTemplate()` → `runTcoEditLoop()` in
  `content.js` first; the new loop mirrors them element-for-element. It is named
  `openBatchAndPrepare()` now.
- `waitForElement` / `waitForElementClickable` already handle disabled/ancestor-disabled buttons —
  reuse them, don't hand-roll polls.
- `setInputValue()` (native setter + `input`/`change`) is required for the search box and price
  field; plain `.value =` does not work on that site.
- All site interaction stays in `content.js`; the panel only reads/writes storage and comments.
- Comments are capped at 250 chars — the combined two-line format stays far below it.
- `XLSX.readFile` does not work in Node (vendored UMD, no fs shim); tests use
  `fs.readFileSync` + `XLSX.read(buf, { type: "buffer" })`.
- Do not reformat unrelated code or bump unrelated versions.
