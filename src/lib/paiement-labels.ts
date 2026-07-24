// Display labels for the backend's PaiementMode enum. Kept as its own module
// (rather than inside a component file) so files that only export React
// components stay that way — see sale-ticket.tsx / app.pos.tsx for usage.
export const PAIEMENT_MODE_LABEL: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte: "Carte",
  virement: "Virement",
  cheque: "Chèque",
};
