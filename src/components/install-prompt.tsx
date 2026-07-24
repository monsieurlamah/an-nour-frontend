import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone, Share, Plus, X } from "lucide-react";

const EB_ICON_URL = "/icon-512.png";

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
};

const DISMISS_KEY = "eb_install_dismissed_at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const SHOW_DELAY_MS = 2500;

type Platform = "android-desktop" | "ios" | null;

function detectIOS(): boolean {
  const ua = window.navigator.userAgent;
  const isIPad =
    /iPad/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
  return /iPhone|iPod/.test(ua) || isIPad;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isDesktop(): boolean {
  return window.matchMedia?.("(min-width: 1024px) and (pointer: fine)").matches ?? false;
}

function isRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Guards: never show in editor preview iframe, in standalone mode, or if user dismissed recently.
    if (isInIframe() || isStandalone() || isRecentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setPlatform(isDesktop() ? "android-desktop" : "android-desktop");
      window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      rememberDismiss();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari never fires beforeinstallprompt — show manual instructions card.
    let iosTimer: number | undefined;
    if (detectIOS()) {
      iosTimer = window.setTimeout(() => {
        if (!isStandalone()) {
          setPlatform("ios");
          setVisible(true);
        }
      }, SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  const close = () => {
    setVisible(false);
    rememberDismiss();
  };

  const install = async () => {
    if (!deferred) return;
    try {
      setInstalling(true);
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
      } else {
        rememberDismiss();
        setVisible(false);
      }
      setDeferred(null);
    } catch {
      setVisible(false);
    } finally {
      setInstalling(false);
    }
  };

  if (!visible || !platform) return null;

  const desktop = isDesktop();
  const Icon = desktop ? Monitor : Smartphone;
  const title = desktop ? "Installer AN-NOUR sur votre bureau" : "Ajouter AN-NOUR à votre écran d'accueil";
  const subtitle = desktop
    ? "Lancez l'application en un clic depuis votre bureau, comme un vrai logiciel."
    : "Accédez à AN-NOUR en un geste depuis votre écran d'accueil, comme une vraie app.";

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md rounded-2xl border border-border/60 bg-card/95 p-4 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:left-auto sm:w-[400px] animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <button
        onClick={close}
        aria-label="Fermer"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <img
            src={EB_ICON_URL}
            alt="AN-NOUR"
            width={48}
            height={48}
            className="h-12 w-12 rounded-xl shadow-md ring-1 ring-border/40"
          />
          <div className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-card">
            <Icon className="h-3 w-3" />
          </div>
        </div>
        <div className="min-w-0 flex-1 pr-6">
          <p className="text-sm font-semibold leading-tight text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {platform === "ios" ? (
        <div className="mt-3 rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
          <p className="mb-2 font-medium text-muted-foreground">Sur iPhone / iPad :</p>
          <ol className="space-y-1.5">
            <li className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">1</span>
              <span className="flex items-center gap-1">Appuyez sur <Share className="inline h-3.5 w-3.5" /> Partager</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">2</span>
              <span className="flex items-center gap-1">Choisissez « Sur l'écran d'accueil » <Plus className="inline h-3.5 w-3.5" /></span>
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">3</span>
              <span>Validez en haut à droite</span>
            </li>
          </ol>
          <button
            onClick={close}
            className="mt-3 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            J'ai compris
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={close}
            className="flex-1 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Plus tard
          </button>
          <button
            onClick={install}
            disabled={installing || !deferred}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {installing ? "Installation…" : "Installer"}
          </button>
        </div>
      )}
    </div>
  );
}
