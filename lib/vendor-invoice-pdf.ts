export type InvoicePdfInput = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactCity: string;
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string;
  billToName: string;
  billToEmail: string;
  projectLabel: string;
  details: string;
  lines: Array<{ description: string; amountCents: number }>;
  totalCents: number;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function pdfEscape(value: string) {
  const clean = value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  return clean.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(value: string, width: number) {
  const words = pdfEscape(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/**
 * One-page invoice PDF. Header, line costs, extra detail, total, and the vendor's contact block.
 * Helvetica only, so the file stays small and needs no font embedding.
 */
export function renderInvoicePdf(input: InvoicePdfInput): Uint8Array {
  const commands: string[] = [];
  let y = 740;
  const text = (size: number, value: string, x = 54) => {
    commands.push(`BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };
  const rule = () => {
    commands.push(`${54} ${y} m ${558} ${y} l S`);
  };

  text(18, input.companyName || "Invoice");
  y -= 22;
  text(11, `Invoice ${input.invoiceNumber}`);
  y -= 16;
  text(11, `Issued ${input.issuedOn}    Due ${input.dueOn || "on receipt"}`);
  y -= 18;
  rule();
  y -= 22;
  text(10, "Bill to");
  y -= 16;
  text(12, input.billToName);
  y -= 15;
  text(11, input.billToEmail);
  if (input.projectLabel) {
    y -= 15;
    text(11, `Project  ${input.projectLabel}`);
  }
  y -= 20;
  rule();
  y -= 20;
  text(10, "Description");
  text(10, "Amount", 470);
  y -= 8;
  rule();
  y -= 18;
  for (const line of input.lines) {
    const description = wrap(line.description || "Work", 60);
    text(11, description[0] || "Work");
    text(11, money(line.amountCents), 470);
    y -= 16;
    for (const extra of description.slice(1)) {
      text(11, extra);
      y -= 14;
    }
  }
  y -= 6;
  rule();
  y -= 22;
  text(13, "Total");
  text(13, money(input.totalCents), 470);
  if (input.details.trim()) {
    y -= 28;
    text(10, "Details");
    y -= 16;
    for (const line of wrap(input.details, 90).slice(0, 8)) {
      text(11, line);
      y -= 14;
    }
  }
  y = Math.min(y - 20, 140);
  rule();
  y -= 20;
  text(10, "From");
  y -= 16;
  text(12, input.contactName || input.companyName);
  y -= 15;
  text(11, [input.contactPhone, input.contactEmail].filter(Boolean).join("   "));
  if (input.contactCity) {
    y -= 15;
    text(11, input.contactCity);
  }

  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}
