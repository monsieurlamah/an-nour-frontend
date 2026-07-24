import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/inventory/reports")({ component: Page });

function Page() {
  const { t } = useT();
  const REPORTS = [
    { name: "Valorisation du stock", desc: "Valeur totale par boutique et catégorie." },
    { name: "Stock à faible rotation", desc: "Articles à faible vente sur 90 jours." },
    { name: "Mouvements de stock", desc: "Entrées, sorties et transferts." },
    { name: "Articles à réapprovisionner", desc: "Stock sous le seuil de réappro." },
    { name: "Écarts d'inventaire", desc: "Différences comptage vs système." },
    { name: "Achats fournisseurs", desc: "Bons d'achat groupés par fournisseur." },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {REPORTS.map(r => (
        <Card key={r.name} className="shadow-soft transition-shadow hover:shadow-elevated">
          <CardHeader><CardTitle className="text-base">{r.name}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{r.desc}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm">{t("common.continue") as string}</Button>
              <Button size="sm" variant="outline"><FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
