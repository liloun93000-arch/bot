import { LegalDraft } from "../legal";

export default function Confidentialite() {
  return (
    <LegalDraft
      titre="POLITIQUE DE CONFIDENTIALITÉ"
      sections={[
        ["Responsable du traitement", "[À COMPLÉTER : identité et coordonnées]"],
        ["Données collectées", "Lors d'une réservation d'appel : prénom, numéro WhatsApp, sujet facultatif, date et heure choisies. Le site compte aussi les clics sur les liens WhatsApp, sans identifier la personne."],
        ["Finalité", "Rappeler la personne au créneau choisi et répondre à ses questions sur WhatsApp."],
        ["Durée de conservation", "[À COMPLÉTER]"],
        ["Vos droits", "Accès, rectification et suppression de vos données sur simple demande. [À COMPLÉTER : adresse de contact]"],
        ["Hébergement", "[À COMPLÉTER : hébergeur et pays]"],
      ]}
    />
  );
}
