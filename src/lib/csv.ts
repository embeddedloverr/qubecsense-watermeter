// Small CSV reader for pasted flat lists. Handles quoted fields, escaped
// quotes ("") and CRLF — enough for a spreadsheet export, without pulling in
// a dependency.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    // Skip lines that are entirely empty.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n") {
      pushField();
      pushRow();
    } else if (c !== "\r") field += c;
  }

  // Trailing field/row with no newline at the end.
  if (field.length || row.length) {
    pushField();
    pushRow();
  }

  return rows;
}

export interface FlatRow {
  flatNumber: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
}

/**
 * Turn pasted CSV into flat rows. Accepts a header line naming the columns in
 * any order; without one, assumes flat, name, email, phone.
 */
export function parseFlatCsv(text: string): {
  rows: FlatRow[];
  errors: string[];
} {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (!table.length) return { rows: [], errors: ["Nothing to import."] };

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const header = table[0].map(norm);

  const findCol = (...names: string[]) =>
    header.findIndex((h) => names.includes(h));

  let iFlat = findCol("flat", "flatno", "flatnumber", "unit", "unitno");
  let iName = findCol("owner", "ownername", "name", "resident");
  let iEmail = findCol("email", "owneremail", "emailid");
  let iPhone = findCol("phone", "ownerphone", "mobile", "contact");

  const hasHeader = iFlat >= 0;
  if (!hasHeader) {
    // Positional fallback.
    iFlat = 0;
    iName = 1;
    iEmail = 2;
    iPhone = 3;
  }

  const body = hasHeader ? table.slice(1) : table;
  const seen = new Set<string>();
  const rows: FlatRow[] = [];

  body.forEach((cols, idx) => {
    const line = idx + (hasHeader ? 2 : 1);
    const flatNumber = (cols[iFlat] || "").trim();
    if (!flatNumber) {
      errors.push(`Line ${line}: missing flat number — skipped.`);
      return;
    }
    if (seen.has(flatNumber)) {
      errors.push(`Line ${line}: flat ${flatNumber} appears more than once — skipped.`);
      return;
    }
    seen.add(flatNumber);

    const email = (iEmail >= 0 ? cols[iEmail] || "" : "").trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Line ${line}: "${email}" is not a valid email — imported without one.`);
    }

    rows.push({
      flatNumber,
      ownerName: (iName >= 0 ? cols[iName] || "" : "").trim(),
      ownerEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
      ownerPhone: (iPhone >= 0 ? cols[iPhone] || "" : "").trim(),
    });
  });

  return { rows, errors };
}
