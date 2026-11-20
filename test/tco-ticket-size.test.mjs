import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const XLSX = require("../xlsx.full.min.js");
const TCOUtils = require("../tco-utils.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleFile = path.join(here, "..", "Test TCO.xlsx");

function readSampleWorkbook() {
  return XLSX.read(fs.readFileSync(sampleFile), { type: "buffer" });
}

function makeWorkbook(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return workbook;
}

test("sample workbook: sheet, header row and values", () => {
  const workbook = readSampleWorkbook();
  assert.deepEqual(workbook.SheetNames, ["Sheet1"]);

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1, { header: 1, raw: true });
  assert.equal(rows[0][0], "DEPARTMENT");
  assert.deepEqual(rows[1], ["UPC", "TCO PRICE", "END DATE", "TICKET SIZE"]);
  assert.deepEqual(rows[2], [6310021940, 3.99, 46352, 9]);
  assert.deepEqual(rows[3], [6310037554, 4.99, 46368, "r9"]);
});

test("sample workbook: ticket size column and normalised values", () => {
  const workbook = readSampleWorkbook();
  const column = TCOUtils.findTicketSizeColumn(workbook, "Sheet1", XLSX.utils);

  assert.deepEqual(column, { headerRow: 1, col: 3 });

  const sheet = workbook.Sheets.Sheet1;
  const numericSize = sheet[XLSX.utils.encode_cell({ r: 2, c: column.col })];
  const textSize = sheet[XLSX.utils.encode_cell({ r: 3, c: column.col })];

  assert.equal(TCOUtils.normaliseTicketSize(numericSize.v), "9");
  assert.equal(TCOUtils.normaliseTicketSize(textSize.v), "r9");
});

test("ticket size column header variants", () => {
  for (const header of ["TICKET SIZE", "Ticket  size", "ticket_size"]) {
    const workbook = makeWorkbook([[header], ["r4"]]);
    assert.deepEqual(
      TCOUtils.findTicketSizeColumn(workbook, "Sheet1", XLSX.utils),
      { headerRow: 0, col: 0 },
      header
    );
  }
});

test("ticket size column absent", () => {
  const workbook = makeWorkbook([["UPC#", "Description", "Size", "UOM", "FM #", "Retail", "TCO Price", "Notes"]]);
  assert.equal(TCOUtils.findTicketSizeColumn(workbook, "Sheet1", XLSX.utils), null);
});

test("ticket size normalisation", () => {
  assert.equal(TCOUtils.normaliseTicketSize(" R9 "), "r9");
  assert.equal(TCOUtils.normaliseTicketSize("Ticket 9"), "9");
  assert.equal(TCOUtils.normaliseTicketSize(9), "9");
  assert.equal(TCOUtils.normaliseTicketSize(12), "12");
  assert.equal(TCOUtils.normaliseTicketSize("12up"), "12");
  assert.equal(TCOUtils.normaliseTicketSize("i9"), "i9");
  assert.equal(TCOUtils.normaliseTicketSize(""), null);
  assert.equal(TCOUtils.normaliseTicketSize(null), null);
});

test("comment round-trip: price only, size only, both, empty", () => {
  assert.equal(TCOUtils.mergeCommentMeta(null, { price: "3.99" }), "TCO Price: 3.99");
  assert.equal(TCOUtils.mergeCommentMeta(null, { ticketSize: "r9" }), "Ticket Size: r9");
  assert.equal(
    TCOUtils.mergeCommentMeta(null, { price: "3.99", ticketSize: "r9" }),
    "TCO Price: 3.99\nTicket Size: r9"
  );
  assert.equal(TCOUtils.mergeCommentMeta(null, {}), "");

  const meta = TCOUtils.readCommentMeta("TCO Price: 3.99\nTicket Size: R9 ");
  assert.deepEqual(meta, { price: "3.99", ticketSize: "r9" });
});

test("comment merge preserves unrelated lines and other label", () => {
  const merged = TCOUtils.mergeCommentMeta("hand written note\nTCO Price: 1.00", { ticketSize: "4" });
  assert.equal(merged, "TCO Price: 1.00\nTicket Size: 4\nhand written note");
});

test("comment merge deletes one label without clobbering the other", () => {
  const comment = "TCO Price: 3.99\nTicket Size: r9";
  assert.equal(TCOUtils.mergeCommentMeta(comment, { price: "" }), "Ticket Size: r9");
  assert.equal(TCOUtils.mergeCommentMeta(comment, { ticketSize: "" }), "TCO Price: 3.99");
});

test("default template map covers every documented size", () => {
  assert.deepEqual(
    Object.keys(TCOUtils.TICKET_SIZE_TEMPLATES).sort(),
    ["1", "12", "4", "9", "i9", "r1", "r4", "r9"]
  );
  Object.values(TCOUtils.TICKET_SIZE_TEMPLATES).forEach((xpath) => {
    assert.match(xpath, /ppr-card-component/);
  });
});
