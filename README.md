# MoteurFX 2026 — V2

Moteur de création de FX pixel art pour jeux isométriques : un éditeur de sorts
procéduraux déterministe, à cap libre sur 360°, avec export utilisable dans un
moteur de jeu.

Ce dépôt contient l'incrément **J0 → J3 partiel** de la feuille de route : le
noyau déterministe, la projection isométrique, le rastériseur logiciel, un
catalogue de **six sorts — un par élément de base**, un atelier de lecture web,
et un export PNG / GIF / manifeste par ligne de commande.

## Ce qui tourne aujourd'hui

| Sort | Élément | Idée directrice |
|---|---|---|
| **Lance de Givre** | Glace | Un prisme hexagonal se construit, tient rigide, part d'un bloc, se rompt en fragments facettés |
| **Arc de Rupture** | Électricité | Cinq décharges de géométrie figée, séparées par du noir, reliées par un fantôme d'ionisation |
| **Météore** | Feu | Un bloc en fusion entre en oblique dans l'axe du cap, s'écrase sur la cible et pousse devant lui une nappe de feu rasante |
| **Lame Déferlante** | Eau | Une lame pleine dont la lèvre dépasse la base, forme un tube, puis se disloque en gouttes |
| **Marteau de Pierre** | Terre | Une masse s'arrache du sol, monte, marque une suspension lourde, puis s'abat en arc sur la cible et éclate |
| **Spirale de Coupe** | Vent | Des arcs ouverts tournent autour d'un axe vertical, accélèrent, puis fuient par la tangente |

Chaque sort accepte un **cap horizontal arbitraire** et s'exporte en 8, 16 ou N
directions échantillonnées dans le repère monde.

## Commandes

```bash
npm install

npm run typecheck          # TypeScript strict, aucun any implicite
npm test                   # 138 tests d'invariants (Vitest)

npm run dev                # atelier web sur serveur Vite local
npm run build:web          # dist/atelier.html — page unique autonome

npm run render:all         # PNG + GIF + planches + manifestes dans out/
npm run bounds             # diagnostic de cadrage par recette
npx tsx src/cli/board.ts   # planche de contrôle du catalogue
```

Exemples d'export ciblé :

```bash
# 16 directions, toutes les images en PNG
npx tsx src/cli/render.ts --spell ice-frost-lance --dirs 16 --frames

# quelques instants clés, agrandis, pour inspection
npx tsx src/cli/render.ts --spell fire-rising-gout --inspect 0.2,0.4,0.6,0.8 --inspectScale 3

# planches de contrôle : couleur, sans lumière, silhouettes seules
npx tsx src/cli/board.ts --scale 2
npx tsx src/cli/board.ts --raw --out out/planche-sans-lumiere.png
npx tsx src/cli/board.ts --silhouette --raw --out out/planche-silhouettes.png
```

L'atelier web est un **site statique** : il n'a ni backend ni compte. Il se sert
par HTTP — `npm run dev` en développement, `dist/atelier.html` en production.
Un double-clic sur un fichier local ne suffit pas toujours : les modules ES
demandent une origine HTTP(S).

## Carte du dépôt

```
src/core/       math, aléatoire déterministe
src/space/      projection isométrique, repères locaux, directions exportées
src/raster/     framebuffer RGBA, masques de couverture, tramage ordonné
src/render/     commandes de dessin, renderer, limites de capture
src/style/      StyleProfile, palettes par rôle
src/grammar/    primitives par famille : solides, débris, sol, givre, décharges, corps mous
src/sim/        contrat des recettes, événements
src/spells/     les six recettes
src/export/     PNG, GIF, planches, manifeste versionné
src/cli/        rendu par lots, diagnostic de cadrage, planche de contrôle
web/            atelier de lecture (React + Vite)
tests/          invariants du moteur
docs/           architecture, conventions spatiales, contrat d'export, avancement
```

## Planches de contrôle

![Catalogue élémentaire : six sorts, cinq instants](docs/planches/catalogue.png)

Les mêmes formes sans passe lumière et en silhouettes seules —
[`catalogue-sans-lumiere.png`](docs/planches/catalogue-sans-lumiere.png),
[`catalogue-silhouettes.png`](docs/planches/catalogue-silhouettes.png) — servent
à vérifier que chaque identité tient **sans glow et sans couleur**. Les
animations complètes sont dans [`docs/planches/`](docs/planches/).

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — modules, flux de données, décisions
- [`docs/conventions-spatiales.md`](docs/conventions-spatiales.md) — repères, projection, caps, conversions Unity
- [`docs/format-recette.md`](docs/format-recette.md) — contrat d'une recette et grammaires élémentaires
- [`docs/export.md`](docs/export.md) — manifeste, atlas, pivots, intégration runtime
- [`docs/avancement.md`](docs/avancement.md) — jalon atteint, preuves, limites connues, prochaine étape

## Conventions de code

- TypeScript strict, `noUncheckedIndexedAccess` activé, aucun `any`.
- Les commentaires expliquent **pourquoi**, pas ce que le code fait déjà lire.
- Aucun opérateur inconnu n'est masqué par un repli visuellement plausible :
  une recette qui demande quelque chose d'absent échoue avec le nom du champ.
