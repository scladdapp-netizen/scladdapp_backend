const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;

function pdfText(value) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function cut(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim() || "—";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function layout({ title, schoolName, question, summary, columns, rows, note }) {
  const cols = (columns || []).slice(0, 8);
  const data = rows || [];
  const inner = PAGE_W - MARGIN * 2;
  // Give each column room for its longest value (within limits) instead of equal slices.
  const weights = cols.map((col) => {
    const longest = data.slice(0, 200).reduce((max, row) => Math.max(max, String(row[col.key] ?? "").length), String(col.label || col.key || "").length);
    return Math.min(34, Math.max(6, longest));
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
  const widths = weights.map((value) => (inner * value) / weightTotal);
  const pages = [];
  let lines = [];
  let y = PAGE_H - MARGIN;

  const add = (line) => lines.push(line);
  const text = (font, size, x, yy, value) => {
    add(`BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${yy.toFixed(1)} Tm (${pdfText(value)}) Tj ET`);
  };
  const finishPage = () => {
    pages.push(lines.join("\n"));
    lines = [];
    y = PAGE_H - MARGIN;
  };
  const ensure = (height) => {
    if (y - height < MARGIN) finishPage();
  };

  text("F2", 14, MARGIN, y - 14, cut(title || "Records", 70));
  y -= 22;
  text("F1", 9, MARGIN, y - 9, cut(schoolName || "School", 90));
  y -= 14;
  text("F1", 9, MARGIN, y - 9, cut(question || "", 120));
  y -= 14;
  text("F1", 9, MARGIN, y - 9, cut(summary || "", 120));
  y -= 18;

  const drawHeader = () => {
    if (y - 20 < MARGIN) finishPage();
    add(`0.94 0.94 0.95 rg ${MARGIN} ${(y - 16).toFixed(1)} ${inner.toFixed(1)} 18 re f`);
    add("0 0 0 rg");
    let x = MARGIN + 4;
    cols.forEach((col, index) => {
      const max = Math.max(4, Math.floor(widths[index] / 5.2));
      text("F2", 8, x, y - 12, cut(col.label || col.key, max));
      x += widths[index];
    });
    y -= 20;
  };

  if (cols.length) drawHeader();

  data.forEach((row, index) => {
    if (y - 16 < MARGIN) {
      finishPage();
      if (cols.length) drawHeader();
    }
    if (index % 2 === 1) {
      add(`0.98 0.98 0.99 rg ${MARGIN} ${(y - 14).toFixed(1)} ${inner.toFixed(1)} 16 re f`);
      add("0 0 0 rg");
    }
    let x = MARGIN + 4;
    cols.forEach((col, colIndex) => {
      const max = Math.max(4, Math.floor(widths[colIndex] / 4.6));
      text("F1", 8, x, y - 11, cut(row[col.key], max));
      x += widths[colIndex];
    });
    y -= 16;
  });

  if (!data.length) {
    text("F1", 10, MARGIN, y - 12, "No matching records.");
    y -= 18;
  }
  if (note) {
    if (y - 16 < MARGIN) finishPage();
    text("F1", 8, MARGIN, y - 10, cut(note, 120));
  }

  if (lines.length) pages.push(lines.join("\n"));
  return pages.length ? pages : ["BT /F1 10 Tf 1 0 0 1 36 800 Tm (No records.) Tj ET"];
}

function buildRecordPdf(report) {
  const streams = layout(report);
  const pageCount = streams.length;
  const pageStart = 3;
  const contentStart = 3 + pageCount;
  const font1 = contentStart + pageCount;
  const font2 = font1 + 1;
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = streams.map((_, index) => `${pageStart + index} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  streams.forEach((stream, index) => {
    const contentId = contentStart + index;
    objects[pageStart + index] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });
  objects[font1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[font2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body);
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  const size = objects.length;
  body += `xref\n0 ${size}\n`;
  body += "0000000000 65535 f \n";
  for (let id = 1; id < size; id += 1) {
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

module.exports = { buildRecordPdf };
