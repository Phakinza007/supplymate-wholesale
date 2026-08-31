// A small RFC 4180 reader. This kit is cloned per client, so a CSV parser
// dependency would be shipped to every clone for one admin screen; ~60 lines
// here is the cheaper trade. Supported: quoted fields, doubled "" escapes,
// commas and newlines inside quotes, LF and CRLF. Not supported: a bare CR
// line terminator (classic Mac OS), and non-comma delimiters.
export function parseCsv(text: string): string[][] {
  // Excel prefixes a UTF-8 BOM, which would otherwise corrupt the first
  // header name and make every required-column check fail.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // A trailing newline, or a blank line between records, must not become a
  // phantom product row.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}
