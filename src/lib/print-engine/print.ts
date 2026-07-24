// Browser print via an isolated invisible iframe — avoids browser chrome
// (URL bar, date, page number) contaminating the thermal or A4 output.
// The caller passes a pre-rendered HTML string + the appropriate CSS.

import type { PageFormat } from "./types";

function getPageCSS(format: PageFormat): string {
  if (format === "thermal-58") {
    return `@page { size: 58mm auto; margin: 0; } body { width: 58mm; }`;
  }
  if (format === "thermal-80") {
    return `@page { size: 80mm auto; margin: 0; } body { width: 80mm; }`;
  }
  return `@page { size: A4; margin: 15mm; }`;
}

function getBaseCSS(format: PageFormat): string {
  const isTherm = format !== "a4";
  return `
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0; padding: 0;
      font-family: ${isTherm ? "'Courier New', Courier, monospace" : "'Helvetica Neue', Arial, sans-serif"};
      font-size: ${isTherm ? "10px" : "12px"};
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { padding: 2px 4px; }
  `;
}

/** Prints the given HTML content in an isolated hidden iframe.
 *  The iframe is removed from the DOM after the print dialog closes. */
export function printHtml(htmlContent: string, format: PageFormat = "thermal-80"): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;width:0;height:0;opacity:0;pointer-events:none;border:none;";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!iframeDoc) {
    iframe.remove();
    return;
  }

  iframeDoc.open();
  iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${getPageCSS(format)}
${getBaseCSS(format)}
</style>
</head>
<body>
${htmlContent}
</body>
</html>`);
  iframeDoc.close();

  // Give images / fonts a moment to load before printing.
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.print();
      // Clean up after the dialog is dismissed (delay to avoid premature removal).
      setTimeout(() => iframe.remove(), 2000);
    }, 300);
  };
}
