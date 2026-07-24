import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { InstallPrompt } from "@/components/install-prompt";
import "@/lib/i18n";
import { useT } from "@/lib/i18n";

function NotFoundComponent() {
  const { t } = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("common.empty") as string}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("common.emptyHint") as string}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("nav.home") as string}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const ICON_URL = "/icon-512.png";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#6366F1" },
      { name: "color-scheme", content: "light dark" },
      { title: "AN-NOUR · Commerce OS multi-boutiques, caisse & stock" },
      {
        name: "description",
        content:
          "AN-NOUR centralise vos boutiques : point de vente, stock temps réel, gestion des créances, achats fournisseurs et reporting consolidé pour les retailers ambitieux.",
      },
      { name: "keywords", content: "AN-NOUR, POS, point de vente, gestion de boutique, multi-boutiques, stock, inventaire, créances, achats, retail, commerce, ERP commerce" },
      { name: "author", content: "AN-NOUR" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "application-name", content: "AN-NOUR" },
      { name: "apple-mobile-web-app-title", content: "AN-NOUR" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:site_name", content: "AN-NOUR" },
      { property: "og:title", content: "AN-NOUR · Commerce OS multi-boutiques" },
      {
        property: "og:description",
        content:
          "Pilotez vos boutiques en un seul endroit : caisse, stock, créances, achats et rapports consolidés.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "fr_FR" },
      { property: "og:image", content: ICON_URL },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { property: "og:image:alt", content: "Logo AN-NOUR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AN-NOUR · Commerce OS multi-boutiques" },
      {
        name: "twitter:description",
        content: "Caisse, stock, créances et achats. Pilotez toutes vos boutiques depuis un dashboard unique.",
      },
      { name: "twitter:image", content: ICON_URL },
    ],
    links: [
      { rel: "icon", type: "image/png", href: ICON_URL },
      { rel: "shortcut icon", type: "image/png", href: ICON_URL },
      { rel: "apple-touch-icon", sizes: "180x180", href: ICON_URL },
      { rel: "apple-touch-icon", sizes: "512x512", href: ICON_URL },
      { rel: "mask-icon", href: ICON_URL, color: "#6366F1" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "AN-NOUR",
          description:
            "Plateforme de gestion multi-boutiques : caisse, stock, créances, achats et rapports consolidés.",
          logo: ICON_URL,
          sameAs: [],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "AN-NOUR",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description:
            "Commerce OS multi-boutiques : point de vente, stock temps réel, créances, achats fournisseurs, reporting.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-right" richColors closeButton />
      <InstallPrompt />
    </QueryClientProvider>
  );
}
