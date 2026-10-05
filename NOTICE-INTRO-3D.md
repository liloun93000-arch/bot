# Intro 3D ARBI JACOB — v7 (jouée PAR-DESSUS le vrai dashboard, après « Se connecter »)

## Parcours
Identifiants → clic « Se connecter » → le dashboard se charge → Jacob et Lilou arrivent par-dessus (fond transparent, aucun décor) → ils repartent et l'intro s'efface en fondu → le dashboard, déjà là, est immédiatement utilisable. « Passer » (en bas à droite) : fondu de 0,2 s, aucun rechargement.

## Ce qui a changé par rapport à v6
- **Fond = le vrai dashboard** (plus d'écran 3D ni de décor). Léger vignettage + halo derrière les personnages, ombres de contact au sol.
- **Rythme** : ≈ 25 s au total (avant ≈ 55 s). Plus de pauses mortes : chaque réplique s'enchaîne, Lilou entre dès le cri « LILOU ! », les réactions se font pendant que l'autre parle. Tout se règle dans `config3d.ts` → `TIMING3` / `WALK`.
- **Mouvements naturels** : saut supprimé, plus de balancement permanent. Pendant qu'il parle : respiration, léger mouvement de tête, changement d'appui, une main de temps en temps (geste puis retour au repos) ; l'autre écoute (regard, hochement, appui). Gestes scénarisés calés sur les mots (« n'oublie pas de dire », « la meilleure », « Regarde comment on fait »).
- **Bras/manches** : gestes faits en flexion vers l'avant (plus d'écartement latéral qui déformait les manches).
- **Préchargement** : pendant la saisie des identifiants, les modèles et textures sont décodés en arrière-plan. L'intro n'apparaît qu'une fois tout chargé, compilé et « chauffé » (aucun personnage ni texture qui apparaît progressivement). Si l'appareil est trop lent / sans WebGL / « mouvement réduit » : pas d'intro, le dashboard s'ouvre directement.

## Branchement (Next.js)
- `app/admin/login/page.tsx` : au clic « Se connecter », pose `sessionStorage["aj-intro-pending"]` + précharge le moteur 3D.
- `app/admin/(protected)/admin-intro.tsx` (+ `<AdminIntro />` dans `(protected)/layout.tsx`) : si le drapeau est posé, joue l'intro par-dessus le dashboard, une seule fois.
- three.js est embarqué dans `(site)/_components/intro/vendor/` : aucune dépendance npm ajoutée (`package.json`/lock inchangés).
- `?intro3d=1` force la 3D, `?intro3d=0` la coupe. L'intro 2D du site public (v5) n'est pas touchée.
- Maquette : `maquette-artefact/arbi-jacob-dashboard.html` s'ouvre maintenant sur l'écran de connexion (comme le vrai dashboard) ; « Se connecter » lance l'intro. Scripts de génération dans `intro-3d-sources-demo/`.

## Testé / non testé
Testé : séquence complète, image par image, par-dessus le dashboard, à 320, 360(*), 390, 430 px et en bureau 1280×720 ; fin sans résidu (dashboard intact et cliquable) ; typage TS strict. (*) 360 lancé, non relu image par image.
**Non testé** : vrais téléphones, vrai GPU, 60 FPS réels (mesure impossible en rendu logiciel), `next build`, parcours avec le vrai serveur de login. À faire : build + essai sur 2-3 téléphones dont un d'entrée de gamme.

## Limites
Bras fusionnés au corps et mains sans doigts (modèles IA) ; pas d'animation du visage ; animation procédurale (pas de capture de mouvement) ; le dashboard ne « réagit » pas encore à l'intro (pas de flou/éléments animés, pour garder la fluidité) ; l'intro 2D n'est plus utilisée sur le dashboard.

## Correctifs v8 (petits bugs)
- Pose finale de Jacob (mains aux hanches) : les mains semblaient détachées des manches → pose plus douce, bras bien rattachés.
- Ombres de contact sous les pieds renforcées (les personnages « flottaient » sur le fond sombre).
- Re-testé : « Passer » en plein milieu, puis déconnexion/reconnexion et 2e lecture (overlay, canvas et bulles bien retirés, menu du dashboard cliquable, aucune erreur console).
