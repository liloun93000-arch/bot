import { LegalDraft } from "../legal";

export default function Conditions() {
  return (
    <LegalDraft
      titre="CONDITIONS GÉNÉRALES"
      sections={[
        ["Éditeur", "[À COMPLÉTER : nom ou raison sociale, forme juridique, numéro d'immatriculation, adresse, e-mail de contact]"],
        ["Objet", "Les présentes conditions encadrent la présentation des offres de Jacob (formations, création de société, comptes Snapchat, sourcing, affiliation) et la prise de contact via WhatsApp."],
        ["Prix et paiement", "Les prix affichés sont en euros. Les formations vendues sur chinacces.com sont soumises aux conditions de ce site. Pour les autres offres et l'appel d'1 h, le paiement se fait sur WhatsApp avec le secrétariat (virement, crypto ou PayPal)."],
        ["Rétractation et remboursement", "Les formations et services donnent un accès immédiat après paiement. En demandant cet accès immédiat, le client renonce à son droit de rétractation : aucun remboursement n'est possible une fois l'accès ouvert."],
        ["Responsabilité", "Aucun résultat, revenu ou avantage fiscal n'est garanti : ils dépendent de la situation et du travail de chacun."],
        ["Droit applicable", "[À COMPLÉTER : droit applicable et juridiction]"],
      ]}
    />
  );
}
