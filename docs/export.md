# Export et intégration

## Ce que produit un export

Pour `--recipe fire-ember-petal-s --dirs 8` :

```text
out/fire-ember-petal-s/
  fire-ember-petal-s-body.png        atlas du corps, 8 lignes × 12 colonnes
  fire-ember-petal-s-emission.png    même grille, passe lumineuse
  fire-ember-petal-s.manifest.json   le contrat de lecture
  frames/d00-f00.png …               images séparées, avec --frames
  fire-ember-petal-s-apercu.gif      animation de contrôle, avec --preview
```

L'aperçu GIF **n'est pas un asset livrable** : c'est un contrôle de rythme.

## Le manifeste

Il déclare, sans rien laisser deviner :

- version de schéma, de moteur et de manifeste ; recette, famille, rang,
  opérateur, seed, style ;
- exactement douze images par direction, douze durées positives, la somme, le
  comportement de fin, et la durée du **mode uniforme** ;
- les plages de rôles avec leur ancrage, leur mode de lecture et leur
  déclencheur ; les événements, avec leur image **et** leur instant en ms ;
- le profil de projection, la métrique pixel/tuile, la taille de capture et le
  pivot ;
- chaque cap : index, angle monde, vecteur monde, angle écran, label ;
- chaque cellule : position, taille, pivot, durée, rôle, et le rectangle
  réellement occupé ;
- les passes, avec leur mode de fusion et leur alpha **droit** ;
- la palette indexée du corps, matière et rôle par entrée ;
- le mode d'assemblage : `composable` ou `baked-sequence` ;
- et les **limites** de cet export, en clair.

Les répétitions runtime ne comptent jamais comme de nouvelles images : un vol
en `playback: loop` se répète sans ajouter une cellule d'atlas.

## Vérifications faites à l'export

- Une frame qui touche le bord du canevas est signalée.
- Le nombre de cellules vaut exactement `directions × 12`.
- Toutes les directions partagent les mêmes douze durées.
- La passe lumineuse partage exactement la grille du corps.
- Les pixels de l'export sont ceux de la preview : les signatures sont
  comparées dans les tests.

## Commandes

```bash
npm install
npm run typecheck          # TypeScript strict
npm test                   # 68 tests d'invariants et de contrôles mesurés
npm run render -- --all --dirs 8 --out out
npm run render -- --recipe fire-comet-heart-l --dirs 16 --frames --preview --out out
npm run board -- --all --mode silhouette --scale 2 --out docs/planches/silhouettes.png
npm run board -- --all --gif --crop 5 --scale 3 --out docs/planches/anim.gif
npm run motifs -- --out docs/planches/motifs.png --scale 4
npm run inspect -- --all --dirs 8        # bornes de chaque image, cap par cap
npm run summary > docs/catalogue.json    # durées, tailles, couleurs, coûts
npm run dev                              # atelier sur un serveur local
npm run build:web                        # atelier en pages autonomes
```

## Unity

Le code d'intégration est dans `unity/` : modèle du manifeste, ressource de
pack, lecteur directionnel, assemblage `cast → fly → hit → residue`, et un
importeur qui applique le filtrage Point, l'absence de compression, les pixels
par unité du manifeste et les pivots déclarés.

**Unity n'est pas exécutable dans l'environnement où ce code a été écrit.** Il
est fourni et relu ; sa validation réelle reste ouverte, et `unity/README.md`
liste les points à vérifier en premier sur un projet réel.
