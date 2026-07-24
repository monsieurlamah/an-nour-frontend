/**
 * useBarcodeScanner — captures HID scanner input (USB & Bluetooth).
 *
 * HID scanners act as keyboards. They type the entire barcode within ~50 ms,
 * always ending with Enter. This hook distinguishes scanner bursts from human
 * typing using two signals:
 *
 *  1. Inter-character gap < SCANNER_GAP_MS (30 ms) → scanner burst
 *  2. Minimum code length (3 chars)
 *
 * When the target element is a "slow" text input (gap > SCANNER_GAP_MS) the
 * hook lets normal keyboard events through, so the search field and payment
 * forms are never disrupted.
 *
 * Place the returned `inputRef` on an <input data-scanner> element. The hook
 * refocuses it after every successful scan so subsequent scans are always
 * captured, even if other elements temporarily steal focus.
 */

import { useEffect, useRef, useCallback, RefObject } from "react";

/** ms between consecutive scanner keystrokes (scanners are < 10 ms typically) */
const SCANNER_GAP_MS = 30;

/** ms of silence before flushing the buffer without an Enter */
const FLUSH_TIMEOUT_MS = 100;

/** minimum code length to be treated as a real barcode / SKU */
const MIN_CODE_LENGTH = 3;

export interface ScanEvent {
  code: string;
  durationMs: number;
}

/**
 * @param onScan  Called with the scanned code whenever a complete scan is
 *                detected (Enter key or flush timeout after a burst).
 * @returns       A RefObject to attach to `<input data-scanner>` — the input
 *                that receives focus after each scan.
 */
export function useBarcodeScanner(
  onScan: (evt: ScanEvent) => void
): RefObject<HTMLInputElement | null> {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef("");
  const lastKeyMsRef = useRef(0);
  const burstStartMsRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan; // always fresh — no stale closure

  const resetBuffer = useCallback(() => {
    bufferRef.current = "";
    lastKeyMsRef.current = 0;
    burstStartMsRef.current = 0;
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    const code = bufferRef.current.trim();
    const duration = Date.now() - burstStartMsRef.current;
    resetBuffer();
    if (code.length >= MIN_CODE_LENGTH) {
      onScanRef.current({ code, durationMs: duration });
      // Refocus scanner input after a short delay so the caller's state
      // updates (toast, cart mutation) don't steal focus away first.
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [resetBuffer]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastKeyMsRef.current;

      // ── Enter ──────────────────────────────────────────────────────────
      if (e.key === "Enter") {
        if (bufferRef.current.length >= MIN_CODE_LENGTH) {
          e.preventDefault(); // never submit a form via scanner Enter
          flush();
        } else {
          resetBuffer();
        }
        return;
      }

      // Only care about printable single characters
      if (e.key.length !== 1) return;

      // ── Determine if this keystroke belongs to a scanner burst ─────────
      const targetEl = e.target as HTMLElement;
      const isTextElement =
        targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA";
      // Our own scanner bar input always accepts scanner bursts
      const isScannerInput = (targetEl as HTMLElement).getAttribute("data-scanner") === "true";
      const isNormalTextInput = isTextElement && !isScannerInput;

      // Human is typing slowly in a normal text field — don't intercept.
      // On the scanner input itself (data-scanner="true"), we always capture,
      // including the first char of a burst (gap is large since last keystroke
      // but that's expected for a scanner that fires after seconds of silence).
      const isHumanTyping = isNormalTextInput && gap > SCANNER_GAP_MS && bufferRef.current.length === 0;
      if (isHumanTyping) return;

      // If there was a long gap and we had buffered chars from before,
      // treat it as a new burst (previous burst was incomplete / human)
      if (gap > SCANNER_GAP_MS * 10 && bufferRef.current.length > 0) {
        resetBuffer();
      }

      // ── Accumulate ─────────────────────────────────────────────────────
      if (bufferRef.current.length === 0) {
        burstStartMsRef.current = now;
      }
      lastKeyMsRef.current = now;
      bufferRef.current += e.key;

      // Schedule auto-flush in case Enter never comes (some scanners omit it)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flush, FLUSH_TIMEOUT_MS);
    };

    // capture:true so we intercept before any React synthetic handler can
    // consume the event (important when focus is inside dialogs).
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [flush, resetBuffer]);

  return inputRef;
}
