const TCOUtils = (() => {
  const COMMENT_LINE_RE = /^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/;
  const MAX_COMMENT_LENGTH = 250;

  const LABELS = {
    "tco price": "TCO Price",
    "ticket size": "Ticket Size"
  };

  const TICKET_SIZE_TEMPLATES = {
    "1": '//*[@id="container"]/div[9]/ppr-card-component/div/div[2]',
    "r1": '//*[@id="container"]/div[8]/ppr-card-component/div/div[2]',
    "4": '//*[@id="container"]/div[16]/ppr-card-component/div/div[2]',
    "r4": '//*[@id="container"]/div[15]/ppr-card-component/div/div[2]',
    "9": '//*[@id="container"]/div[23]/ppr-card-component/div/div[2]/div/p',
    "r9": '//*[@id="container"]/div[22]/ppr-card-component/div/div[2]/div/p',
    "i9": '//*[@id="container"]/div[30]/ppr-card-component/div/div[2]/div/p',
    "12": '//*[@id="container"]/div[4]/ppr-card-component/div/div[2]/div/p'
  };

  function parseCommentFields(comment) {
    const fields = {};
    const labels = {};
    const extra = [];

    String(comment || "").split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const match = COMMENT_LINE_RE.exec(line);
      if (!match) {
        extra.push(trimmed);
        return;
      }

      const label = match[1].trim();
      const key = label.toLowerCase();
      const value = match[2].trim();
      if (!value) return;

      fields[key] = value;
      labels[key] = label;
    });

    return { fields, labels, extra };
  }

  function buildComment(parsed) {
    const fields = (parsed && parsed.fields) || {};
    const labels = (parsed && parsed.labels) || {};
    const extra = (parsed && parsed.extra) || [];

    const lines = Object.keys(fields)
      .filter((key) => String(fields[key]).trim() !== "")
      .map((key) => `${LABELS[key] || labels[key] || key}: ${fields[key]}`);

    extra.forEach((line) => lines.push(line));

    return lines.join("\n").slice(0, MAX_COMMENT_LENGTH).trim();
  }

  function normaliseTicketSize(value) {
    const raw = String(value === null || value === undefined ? "" : value).trim().toLowerCase();
    if (!raw) return null;

    const tokens = raw.split(/\s+/);
    const last = tokens[tokens.length - 1];
    const match = last.match(/^[a-z]?\d{1,2}/);
    return match ? match[0] : last;
  }

  function readCommentMeta(comment) {
    const parsed = parseCommentFields(comment);
    return {
      price: parsed.fields["tco price"] || null,
      ticketSize: normaliseTicketSize(parsed.fields["ticket size"])
    };
  }

  function mergeCommentMeta(comment, patch) {
    const parsed = parseCommentFields(comment);

    if (patch && patch.price !== undefined) {
      if (patch.price) parsed.fields["tco price"] = patch.price;
      else delete parsed.fields["tco price"];
    }

    if (patch && patch.ticketSize !== undefined) {
      if (patch.ticketSize) parsed.fields["ticket size"] = patch.ticketSize;
      else delete parsed.fields["ticket size"];
    }

    return buildComment(parsed);
  }

  function findTicketSizeColumn(workbook, sheetName, utils) {
    const sheet = workbook && workbook.Sheets ? workbook.Sheets[sheetName] : null;
    if (!sheet || !sheet["!ref"] || !utils) return null;

    const range = utils.decode_range(sheet["!ref"]);
    const maxHeaderRow = Math.min(range.e.r, 9);

    for (let row = range.s.r; row <= maxHeaderRow; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[utils.encode_cell({ r: row, c: col })];
        if (!cell || cell.v === undefined || cell.v === null) continue;

        const header = String(cell.v).trim().toLowerCase();
        if (/ticket[\s_-]*size/.test(header)) {
          return { headerRow: row, col: col };
        }
      }
    }
    return null;
  }

  return {
    parseCommentFields,
    buildComment,
    normaliseTicketSize,
    readCommentMeta,
    mergeCommentMeta,
    findTicketSizeColumn,
    TICKET_SIZE_TEMPLATES,
    MAX_COMMENT_LENGTH
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = TCOUtils;
}
