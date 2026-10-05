# Intro animée ARBI JACOB — v5 (planches HD, échelle commune)

Dossier : `apps/dashboard/src/app/(site)/_components/intro/`. Scénario, dialogues, bulles, « Passer », session, révélation : inchangés.

## Ce qui change
- **Échelle commune verrouillée** : `CHARACTER_BASE_HEIGHT` (config.ts) → une seule hauteur `charH` (layout.ts) pour Jacob ET Lilou, une seule ligne de sol `floorY`. Pour agrandir/réduire les deux : `CHARACTER_BASE_HEIGHT.scale`.
- **Normalisation à la source** (maquette-artefact/intro-sources-detourage/build.py) : chaque pose est mise à l'échelle sur la hauteur réelle sol → sommet de tête/casquette (`REF_PX` = 600 px pour les deux), jamais sur la taille des planches. Ancre x stable (torse en marche, milieu des pieds à l'arrêt), semelles = bas de l'image.
- **Vraie marche** : cycle de 4 poses synchronisé sur la distance parcourue (pas de glissement d'une image), ordre MARCHE 1 → 4 → 2 → 3 (celui où le pied d'appui recule régulièrement par rapport au corps, mesuré sur les planches ; modifiable : `walk` dans characters.ts), accélération, décélération, rebond, inertie à l'arrêt.
- **Orientations** : Jacob s'arrête en 3/4 avant puis passe face caméra ; pour appeler Lilou : face → 3/4 droit → profil droit ; Lilou arrive de la droite (poses de marche retournées, texte « LILOU » re-corrigé pour rester lisible), s'arrête en 3/4 gauche vers Jacob ; à la fin elle se tourne vers nous (signe OK).
- **Gestes calés sur les phrases** : mains en avant, puis paumes ouvertes sur « la meilleure » ; pointage sur « Regarde comment on fait ».
- **Préchargement** : toutes les poses sont décodées avant le démarrage ; aucun vide entre deux poses. Module de sprites ≈ 0,9 Mo (WebP qualité 74), chargé seulement quand l'intro joue.
- Bulles ancrées au torse du personnage qui parle (`headX()`), écrans étroits : personnages rapprochés, même échelle.

## Limites connues
- Les cellules des planches font ~175×375 px : les poses sont agrandies ×1,6 (léger flou sur très grands écrans/écrans 3×).
- Le texte de la casquette de Lilou, retourné en marche vers la gauche, n'est pas lisible à cette taille.
- Sections 11 à 14 du cahier des charges non reçues : non prises en compte.
