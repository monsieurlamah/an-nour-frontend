/**
 * useCameraBarcodeScanner — continuous 1D-barcode decoding from a live
 * camera feed via @zxing/browser.
 *
 * Uses BrowserMultiFormatOneDReader specifically (not the generic
 * multi-format reader) — it only tries 1D symbologies (EAN-13/8, UPC-A/E,
 * Code128/39/93, Codabar, ITF…), which is both all a retail barcode ever
 * is and meaningfully faster per frame than also matching QR/Aztec/PDF417.
 *
 * The hook owns the whole camera lifecycle (permission request, device
 * enumeration, stream teardown) so the dialog component only renders state.
 * Nothing here touches React state for the decoded codes themselves — the
 * caller's onDetect fires per frame match, as fast as the camera allows.
 *
 * The <video> element lives inside a Dialog's portal; a plain useRef's
 * `.current` isn't guaranteed to be populated yet on the very first effect
 * run after `enabled` flips true (portal/animation mount timing). A
 * callback ref backed by state sidesteps that entirely — the effect is
 * keyed on the actual DOM node, so it only ever runs once it truly exists.
 */

import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import { BrowserMultiFormatOneDReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

export type CameraScannerStatus = "idle" | "starting" | "running" | "error";

export type CameraScannerErrorCode =
  | "unsupported"
  | "insecure"
  | "denied"
  | "no_camera"
  | "unknown";

export interface UseCameraBarcodeScannerResult {
  videoRef: (node: HTMLVideoElement | null) => void;
  status: CameraScannerStatus;
  errorCode: CameraScannerErrorCode | null;
  devices: MediaDeviceInfo[];
  activeDeviceId: string | undefined;
  switchDevice: (deviceId: string) => void;
  torchSupported: boolean;
  torchOn: boolean;
  toggleTorch: () => void;
  retry: () => void;
}

export function useCameraBarcodeScanner(
  enabled: boolean,
  onDetect: (code: string) => void,
): UseCameraBarcodeScannerResult {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useCallback((node: HTMLVideoElement | null) => setVideoEl(node), []);

  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const [status, setStatus] = useState<CameraScannerStatus>("idle");
  const [errorCode, setErrorCode] = useState<CameraScannerErrorCode | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!enabled || !videoEl) {
      if (!enabled) setStatus("idle");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorCode("unsupported");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus("error");
      setErrorCode("insecure");
      return;
    }

    let cancelled = false;
    setStatus("starting");
    setErrorCode(null);
    setTorchSupported(false);
    setTorchOn(false);

    const reader = new BrowserMultiFormatOneDReader(undefined, {
      delayBetweenScanAttempts: 100,
      delayBetweenScanSuccess: 300,
    });

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(activeDeviceId, videoEl, (result) => {
          if (result) onDetectRef.current(result.getText());
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus("running");
        setTorchSupported(typeof controls.switchTorch === "function");

        // Device labels are only populated once permission has been granted,
        // so this is deliberately requested after decodeFromVideoDevice resolves.
        const list = await BrowserMultiFormatOneDReader.listVideoInputDevices();
        if (!cancelled) setDevices(list);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const name = err instanceof Error ? err.name : "";
        setErrorCode(
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "denied"
            : name === "NotFoundError" || name === "DevicesNotFoundError"
              ? "no_camera"
              : "unknown",
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [enabled, videoEl, activeDeviceId, retryToken]);

  const toggleTorch = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls?.switchTorch) return;
    const next = !torchOn;
    controls
      .switchTorch(next)
      .then(() => setTorchOn(next))
      .catch(() => {});
  }, [torchOn]);

  const switchDevice = useCallback((deviceId: string) => setActiveDeviceId(deviceId), []);
  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  return {
    videoRef, status, errorCode, devices, activeDeviceId,
    switchDevice, torchSupported, torchOn, toggleTorch, retry,
  };
}
