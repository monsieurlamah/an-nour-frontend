import QRCode from "qrcode";

/** Returns a PNG data URI for the given text — works in both browser and
 *  server contexts, can be embedded in <img src=…> or jsPDF addImage(). */
export async function generateQRDataURL(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    width: 200,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
