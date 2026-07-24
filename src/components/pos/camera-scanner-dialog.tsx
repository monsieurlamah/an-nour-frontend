// Camera barcode scanner — multi-product batch scanning session.
//
// Opens over the live camera feed, decodes 1D barcodes continuously
// (see lib/use-camera-barcode-scanner.ts), and accumulates them into a
// running list the cashier can review, adjust, or remove from before
// committing everything to the cart in one shot via onFinish.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Camera, CameraOff, Flashlight, FlashlightOff, SwitchCamera, Loader2,
  Trash2, Plus, Minus, ScanBarcode, AlertTriangle, HelpCircle, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtXAF } from "@/lib/mock-data";
import { useT } from "@/lib/i18n";
import { useCameraBarcodeScanner } from "@/lib/use-camera-barcode-scanner";
import { matchScan, type ScannableProduct } from "@/lib/barcode-match";
import { recordScan, bumpScan, removeScan, setScanQty, totalScanQty, type ScannedEntry } from "@/lib/scan-session";

export interface ScannableCatalogItem extends ScannableProduct {
  name: string;
  price: number;
  image: string | null;
  stock: number;
  status: "active" | "inactive" | "archived";
}

interface CameraScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ScannableCatalogItem[];
  onFinish: (entries: { code: string; qty: number }[]) => void;
}

/** Short confirmation beep — synthesized, no audio asset needed. Silently
 * no-ops if the Web Audio API is unavailable or blocked. */
function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
    osc.onended = () => ctx.close();
  } catch {
    // Audio is a nice-to-have; never let it break scanning.
  }
}

export function CameraScannerDialog({ open, onOpenChange, products, onFinish }: CameraScannerDialogProps) {
  const { t } = useT();
  const [scans, setScans] = useState<ScannedEntry[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [flash, setFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerFlash = useCallback(() => {
    setFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(false), 350);
  }, []);

  const handleDetect = useCallback((code: string) => {
    const now = Date.now();
    setScans((prev) => {
      const before = prev.find((e) => e.code === code)?.qty ?? 0;
      const next = recordScan(prev, code, now);
      const after = next.find((e) => e.code === code)?.qty ?? 0;
      if (after !== before) {
        playBeep();
        triggerFlash();
      }
      return next;
    });
  }, [triggerFlash]);

  const {
    videoRef, status, errorCode, devices, activeDeviceId,
    switchDevice, torchSupported, torchOn, toggleTorch, retry,
  } = useCameraBarcodeScanner(open, handleDetect);

  const resolvedScans = useMemo(
    () => scans.map((entry) => ({ entry, match: matchScan(products, entry.code) })),
    [scans, products],
  );
  const total = totalScanQty(scans);

  const handleManualAdd = () => {
    const code = manualCode.trim();
    if (!code) return;
    setScans((prev) => bumpScan(prev, code, Date.now()));
    setManualCode("");
  };

  const handleClose = () => {
    setScans([]);
    setManualCode("");
    onOpenChange(false);
  };

  const handleFinish = () => {
    if (scans.length === 0) return;
    onFinish(scans.map(({ code, qty }) => ({ code, qty })));
    setScans([]);
    onOpenChange(false);
  };

  const errorMessage = errorCode ? (t(`pos.cameraError${errorCode === "unsupported" ? "Unsupported"
    : errorCode === "insecure" ? "Insecure"
    : errorCode === "denied" ? "Denied"
    : errorCode === "no_camera" ? "NoCamera"
    : "Unknown"}`) as string) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 rounded-none p-0 sm:h-[85vh] sm:max-h-[85vh] sm:max-w-3xl sm:rounded-xl lg:max-w-4xl">
        <DialogHeader className="border-b px-4 py-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanBarcode className="h-4 w-4 text-primary" />
            {t("pos.cameraScanTitle") as string}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{t("pos.cameraScanHint") as string}</p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* ── Camera pane ─────────────────────────────────────────────── */}
          <div className="relative min-h-[42vh] w-full shrink-0 overflow-hidden bg-black lg:min-h-0 lg:w-3/5">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={cn("h-full w-full object-cover", status !== "running" && "opacity-0")}
            />

            {status === "running" && (
              <>
                {/* Framing guide */}
                <div className="pointer-events-none absolute inset-0 grid place-items-center p-8">
                  <div className={cn(
                    "relative aspect-[2/1] w-full max-w-md rounded-2xl border-2 transition-colors",
                    flash ? "border-success" : "border-white/70",
                  )}>
                    {["-left-1 -top-1 border-l-4 border-t-4 rounded-tl-2xl", "-right-1 -top-1 border-r-4 border-t-4 rounded-tr-2xl",
                      "-left-1 -bottom-1 border-l-4 border-b-4 rounded-bl-2xl", "-right-1 -bottom-1 border-r-4 border-b-4 rounded-br-2xl"]
                      .map((pos, i) => (
                        <span key={i} className={cn("absolute h-6 w-6 border-primary", pos)} />
                      ))}
                    <div className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary/80 shadow-[0_0_8px_2px_var(--primary)] animate-scan-line" />
                    {flash && (
                      <div className="absolute inset-0 grid place-items-center rounded-2xl bg-success/20">
                        <div className="grid h-12 w-12 place-items-center rounded-full bg-success text-success-foreground shadow-elevated">
                          <Check className="h-6 w-6" strokeWidth={3} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls overlay */}
                <div className="absolute right-3 top-3 flex gap-2">
                  {devices.length > 1 && (
                    <Button
                      size="icon" variant="secondary"
                      className="h-9 w-9 bg-black/50 text-white backdrop-blur hover:bg-black/70"
                      title={t("pos.cameraSwitchDevice") as string}
                      onClick={() => {
                        const idx = devices.findIndex((d) => d.deviceId === activeDeviceId);
                        switchDevice(devices[(idx + 1) % devices.length].deviceId);
                      }}
                    >
                      <SwitchCamera className="h-4 w-4" />
                    </Button>
                  )}
                  {torchSupported && (
                    <Button
                      size="icon" variant="secondary"
                      className={cn("h-9 w-9 bg-black/50 text-white backdrop-blur hover:bg-black/70", torchOn && "bg-warning/80 hover:bg-warning/90")}
                      title={t("pos.cameraTorch") as string}
                      onClick={toggleTorch}
                    >
                      {torchOn ? <Flashlight className="h-4 w-4" /> : <FlashlightOff className="h-4 w-4" />}
                    </Button>
                  )}
                </div>

                {total > 0 && (
                  <Badge className="absolute left-3 top-3 gap-1 bg-black/50 text-white backdrop-blur">
                    <ScanBarcode className="h-3 w-3" /> {total}
                  </Badge>
                )}
              </>
            )}

            {status === "starting" && (
              <div className="absolute inset-0 grid place-items-center text-white">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="text-xs">{t("pos.cameraStarting") as string}</p>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="absolute inset-0 grid place-items-center bg-secondary px-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
                    <CameraOff className="h-6 w-6" />
                  </div>
                  <p className="max-w-xs text-sm text-muted-foreground">{errorMessage}</p>
                  <Button size="sm" variant="outline" onClick={retry}>
                    <Camera className="mr-1.5 h-3.5 w-3.5" /> {t("pos.cameraRetry") as string}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Scanned list pane ───────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col lg:w-2/5 lg:border-l">
            <div className="flex items-center justify-between border-b px-4 py-2.5 sm:px-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("pos.cameraScannedList") as string}
              </span>
              {total > 0 && <Badge variant="secondary" className="tabular-nums">{total}</Badge>}
            </div>

            <ScrollArea className="flex-1">
              {resolvedScans.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <ScanBarcode className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">{t("pos.cameraScannedEmpty") as string}</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {resolvedScans.map(({ entry, match }) => {
                    const found = match.kind === "found" ? match.product : null;
                    return (
                      <li key={entry.code} className={cn("flex items-center gap-2.5 px-4 py-2.5 sm:px-5", !found && "bg-destructive/5")}>
                        <div className="min-w-0 flex-1">
                          {found ? (
                            <>
                              <p className="truncate text-sm font-medium">{found.name}</p>
                              <p className="text-xs tabular-nums text-muted-foreground">{fmtXAF(found.price)}</p>
                            </>
                          ) : (
                            <>
                              <p className="flex items-center gap-1 truncate text-sm font-medium text-destructive">
                                {match.kind === "ambiguous"
                                  ? <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                                  : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                                {match.kind === "ambiguous" ? (t("pos.cameraCodeAmbiguous") as string) : (t("pos.cameraCodeUnknown") as string)}
                              </p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">{entry.code}</p>
                            </>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="icon" variant="outline" className="h-6 w-6"
                            onClick={() => setScans((s) => setScanQty(s, entry.code, entry.qty - 1))} aria-label="−">
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{entry.qty}</span>
                          <Button size="icon" variant="outline" className="h-6 w-6"
                            onClick={() => setScans((s) => setScanQty(s, entry.code, entry.qty + 1))} aria-label="+">
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setScans((s) => removeScan(s, entry.code))} aria-label="remove">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>

            {/* Manual fallback entry */}
            <div className="flex items-center gap-2 border-t p-3 sm:p-4">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleManualAdd())}
                placeholder={t("pos.cameraManualEntry") as string}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" className="shrink-0" onClick={handleManualAdd} disabled={!manualCode.trim()}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {t("pos.cameraManualAdd") as string}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t px-4 py-3 sm:gap-2 sm:px-5">
          <Button variant="outline" onClick={handleClose}>{t("pos.cameraCancel") as string}</Button>
          <Button onClick={handleFinish} disabled={scans.length === 0} className="shadow-glow">
            <Check className="mr-1.5 h-4 w-4" />
            {scans.length > 0 ? (t("pos.cameraFinishWithCount", { count: total }) as string) : (t("pos.cameraFinish") as string)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
