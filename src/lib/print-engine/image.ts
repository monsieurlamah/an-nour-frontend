/** Resolves an <img>-style logo reference (a plain URL/path, e.g.
 *  "/logoBoutique.jpeg") into a base64 data URI + the format string jsPDF's
 *  addImage() needs — jsPDF never fetches URLs itself, unlike a plain <img>
 *  tag in the HTML/print-preview templates. Already-a-data-URI input is
 *  passed through untouched (just re-parses its declared format). */
export async function loadImageForPdf(
  src: string,
): Promise<{ dataUrl: string; format: string } | null> {
  const dataUrl = src.startsWith("data:") ? src : await fetchAsDataUrl(src);
  if (!dataUrl) return null;
  return { dataUrl, format: formatFromDataUrl(dataUrl) };
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatFromDataUrl(dataUrl: string): string {
  const match = /^data:image\/(\w+);/.exec(dataUrl);
  const ext = (match?.[1] ?? "jpeg").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "JPEG";
  if (ext === "png") return "PNG";
  if (ext === "webp") return "WEBP";
  return "JPEG";
}
