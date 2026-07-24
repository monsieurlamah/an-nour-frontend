/** Shared formatting utilities — currency, dates, etc.
 * No framework dependency so they can be used by both DOM renderers and
 * the jsPDF programmatic generator. */

export function fmtMoney(amount: number, currency = "GNF", locale = "fr-GN"): string {
  // Deliberately not `style: "currency"` — for fr-GN/GNF that renders the
  // locale currency *symbol* ("FG"), not the code callers actually pass in
  // ("GNF"). Format the number only and append the currency ourselves.
  //
  // Intl's grouping separator here is a narrow no-break space (U+202F, plus
  // a plain no-break space U+00A0 before the currency). jsPDF's core fonts
  // (Helvetica/Times/Courier) have no glyph for U+202F and render it as a
  // stray "/" — regular breakable spaces read correctly everywhere this
  // string ends up: jsPDF PDFs, the browser print dialog, and the on-screen
  // preview.
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
  } catch {
    formatted = String(Math.round(amount));
  }
  return `${formatted.replace(/[\u00A0\u202F]/g, " ")} ${currency}`;
}

export function fmtDate(iso: string, locale = "fr-GN"): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function fmtTime(iso: string, locale = "fr-GN"): string {
  try {
    return new Date(iso).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function fmtDateTime(iso: string, locale = "fr-GN"): string {
  return `${fmtDate(iso, locale)} ${fmtTime(iso, locale)}`;
}

/** Pads a string to a fixed width — useful for mono-spaced thermal layouts. */
export function pad(s: string, width: number, align: "left" | "right" = "left"): string {
  const str = String(s);
  if (str.length >= width) return str.substring(0, width);
  const spaces = " ".repeat(width - str.length);
  return align === "right" ? spaces + str : str + spaces;
}

/** Truncates a string and adds an ellipsis if longer than maxLen. */
export function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.substring(0, maxLen - 1) + "…" : s;
}
