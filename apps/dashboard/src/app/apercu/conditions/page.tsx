import { LegalDraft } from "../legal";

export default function Conditions() {
  return (
    <LegalDraft
      titre="CONDITIONS GÉNÉRALES"
      sections={[
        ["Éditeur", "[À COMPLÉTER : nom ou raison sociale, forme juridique, numéro d'immatriculation, adresse, e-mail de contact]"],
        ["Objet", "Les présentes conditions encadrent la présentation des offres de Jacob (formations, création de société, comptes Snapchat, sourcing, affiliation) et la prise de contact via WhatsApp."],
        ["Prix et paiement", "Les prix affichés sont en euros. Les formations vendues sur chinacces.com sont soumises aux conditions de ce site. [À COMPLÉTER : modalités pour les autres offres]"],
        ["Rétractation et remboursement", "[À COMPLÉTER PAR JACOB — ne pas publier sans validation juridique]"],
        ["Responsabilité", "Aucun résultat, revenu ou avantage fiscal n'est garanti : ils dépendent de la situation et du travail de chacun."],
        ["Droit applicable", "[À COMPLÉTER : droit applicable et juridiction]"],
      ]}
    />
  );
}
