import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, MessageCircle, PlayCircle, Search } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/help")({ component: Page });

function Page() {
  const { t } = useT();
  const FAQS = [
    { q: "Comment ajouter une boutique ?", a: "Allez dans Boutiques → Nouvelle boutique." },
    { q: "Les caissiers peuvent-ils rembourser ?", a: "Uniquement si la permission est activée dans Utilisateurs → Permissions." },
    { q: "Comment fonctionne l'approbation d'approvisionnement ?", a: "Un gérant crée la commande, le siège l'approuve, puis elle passe en préparation puis livrée." },
    { q: "Puis-je exporter en Excel ?", a: "Oui, chaque rapport dispose des boutons PDF et Excel." },
    { q: "Où configurer le taux de TVA ?", a: "Paramètres → Localisation. Par défaut 19,25 %." },
  ];
  return (
    <>
      <PageHeader title={t("help.title") as string} description={t("help.subtitle") as string} />
      <Card className="mb-6 overflow-hidden border-0 shadow-elevated">
        <div className="gradient-brand p-8 text-white">
          <h2 className="text-2xl font-semibold tracking-tight">{t("help.title") as string}</h2>
          <p className="mt-1 text-sm text-white/80">{t("help.subtitle") as string}</p>
          <div className="relative mt-5 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            <Input placeholder={t("help.search") as string} className="h-11 border-white/20 bg-white/15 pl-9 text-white placeholder:text-white/60 focus-visible:bg-white/20" />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { i: BookOpen, t: "Documentation", d: t("help.subtitle") as string },
          { i: PlayCircle, t: "Tutoriels vidéo", d: "12 vidéos · < 5 min" },
          { i: MessageCircle, t: t("help.contact") as string, d: t("help.contactHint") as string },
        ].map((c, i) => (
          <Card key={i} className="shadow-soft transition-shadow hover:shadow-elevated">
            <CardHeader><CardTitle className="text-base">{c.t}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{c.d}</p>
              <Button variant="outline" size="sm" className="mt-4"><c.i className="mr-1.5 h-3.5 w-3.5" /> {t("common.continue") as string}</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6 shadow-soft">
        <CardHeader><CardTitle className="text-base">{t("help.popular") as string}</CardTitle></CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </>
  );
}
