/** Retrait du MOQ de 20 pièces du fournisseur Apple (section 38) — novembre 2026. */
export const APPLE_EDITS: Array<[string, string]> = [
 [
  "- le MOQ de 20 pièces chez Apple\n",
  ""
 ],
 [
  "  ✗ « Il y a un minimum de 20 pièces. »\n  ✅ « Le minimum c'est 20 pièces, mais tu mixes comme tu veux :\n     2 iPhone et tu complètes avec des accessoires. Et comme le\n     port est inclus, remplir ta commande ne te coûte rien de\n     plus. »\n\n",
  ""
 ],
 [
  "→ Il faut compter plus haut : le minimum est de 20 pièces\nmixables. On peut le remplir avec des accessoires, mais il faut\nun budget cohérent. Le bot l'annonce avant.",
  "→ Il faut compter plus haut : les prix Apple sont plus élevés. Il\nn'y a aucune quantité minimum (le client peut commencer par une\nseule pièce), mais il faut un budget cohérent. Le bot l'annonce avant."
 ],
 [
  "les grades\nApple, le MOQ mixable, l'homologation",
  "les grades\nApple, l'homologation"
 ],
 [
  "⚠️ QUANTITÉ MINIMUM (MOQ) : 20 PIÈCES — MAIS MIXABLE\n-------------------------------------------------------\nC'est LA condition à connaître sur ce fournisseur, et c'est une\nexception par rapport aux autres accès fournisseurs.\n\nLe minimum de commande est de 20 PIÈCES AU TOTAL. Ce n'est PAS 20\npièces du même produit : le client MIXE librement ce qu'il veut.\n\nExemples valables :\n- 20 chargeurs\n- 10 chargeurs + 10 téléphones\n- 10 chargeurs + 10 stylets + 1 téléphone + 3 casques (= 24 pièces)\n- n'importe quelle combinaison, du moment que le total atteint 20\n\nLe MOQ porte sur LA COMMANDE ENTIÈRE, tous rayons confondus. Le\nclient peut donc mélanger librement :\n- du neuf et de l'occasion dans la même commande\n- de l'Apple, des consoles et de la photo/vidéo\n- n'importe quelle catégorie du catalogue\nSeule compte la règle : 20 pièces au total dans le panier.\n\nLe bot doit TOUJOURS présenter ça comme un avantage, pas comme un\nfrein : le client n'a pas besoin de 20 iPhone, il peut composer son\nlot avec des accessoires à petit prix pour atteindre les 20 pièces.\nUn lot de chargeurs ou de câbles suffit à compléter.\nEt comme le port est inclus, remplir la commande ne coûte pas plus\ncher en livraison : c'est un argument supplémentaire.\n\nFormulation possible :\n« Il y a un minimum de 20 pièces par commande, mais c'est mixable :\ntu peux prendre 2 iPhone et compléter avec des accessoires, des\nchargeurs, des coques... L'important c'est d'avoir 20 pièces au\ntotal, peu importe lesquelles. »\n\nLe bot ne doit jamais dire « aucune quantité minimum » sur ce\nfournisseur. C'est l'erreur à éviter.\n",
  "✅ AUCUNE QUANTITÉ MINIMUM (PAS DE MOQ)\n-------------------------------------------------------\nSur ce fournisseur, il n'y a PAS de quantité minimum : le client peut\ncommander à partir d'UNE SEULE pièce, du neuf comme de l'occasion,\nde l'Apple, des consoles ou de la photo/vidéo.\n\nLe bot ne parle JAMAIS d'un minimum de 20 pièces, ni d'un minimum\n« mixable » : cette ancienne règle n'existe plus. Un client qui\nveut un seul iPhone, un seul iPad ou un seul AirPods est le\nbienvenu. Si on lui demande, il répond simplement qu'il n'y a\naucune quantité minimum.\n\nLe port reste inclus, quelle que soit la quantité commandée : un\nargument commercial à mettre en avant.\n"
 ],
 [
  "C'est vrai quelle que soit la\nquantité commandée, y compris sur une commande de 20 pièces ou\nplus.",
  "C'est vrai quelle que soit la\nquantité commandée, même pour une seule pièce."
 ],
 [
  "→ Oui : 20 pièces minimum par commande, MAIS entièrement mixables\n(voir le bloc MOQ plus haut). Neuf, occasion, Apple, consoles,\nphoto : tout compte dans les 20. Le bot ne dit jamais « aucune\nquantité minimum » pour ce fournisseur, et ne dit jamais non plus\nqu'il faut 20 fois le même produit.",
  "→ Non : aucune quantité minimum, le client peut commander à partir\nd'une seule pièce. Le bot ne parle jamais d'un minimum de 20\npièces pour ce fournisseur."
 ],
 [
  "Mêmes conditions que le reste : port inclus, mêmes 20 pièces de\nminimum sur la commande globale.",
  "Mêmes conditions que le reste : port inclus, aucune quantité\nminimum."
 ],
 [
  "QUANTITÉ : 20 pièces minimum par commande, mixables (voir le bloc\nMOQ en haut de section). Les grosses quantités sont possibles.",
  "QUANTITÉ : aucune quantité minimum (dès une seule pièce). Les\ngrosses quantités sont possibles."
 ],
 [
  "DEUX EXCEPTIONS. La première : le fournisseur Apple / multimarques de Hong Kong (section 38) impose un minimum de 20 PIÈCES par commande — mais mixables, toutes références confondues. Le bot doit connaître cette exception et ne jamais répondre « aucun MOQ » quand la question porte sur ce fournisseur.\nLa seconde : les ACCESSOIRES du fournisseur de véhicules électriques (casques, gants, protections, tenues) se vendent par lots de 100 pièces — les véhicules eux-mêmes se commandent à l'unité (section 39).",
  "UNE EXCEPTION : les ACCESSOIRES du fournisseur de véhicules électriques (casques, gants, protections, tenues) se vendent par lots de 100 pièces — les véhicules eux-mêmes se commandent à l'unité (section 39). Le fournisseur Apple / multimarques de Hong Kong (section 38) n'a AUCUNE quantité minimum."
 ]
];
