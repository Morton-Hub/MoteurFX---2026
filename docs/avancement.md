# Avancement

## Jalon atteint

**J0 → J1 → J2 complets, J3 partiel** (six recettes au lieu de neuf : un sort
par élément de base plutôt que trois sorts sur trois éléments).

Le dépôt était **vide au démarrage** : aucun commit, aucun code V1 à migrer.
L'état des lieux J0 se résume donc à ce constat, et les défauts listés dans
l'audit du commit `8665e3e` n'ont pas pu être reproduits sur une version
courante — ils ont été traités comme un cahier de contraintes à ne pas
reproduire, et chacun fait aujourd'hui l'objet d'un test.

| Défaut de l'audit V1 | Traitement | Vérification |
|---|---|---|
| Identité portée surtout par le bloom | Grammaires de forme séparées par élément ; contrôle sans lumière et en silhouette | `planche-silhouettes.png`, bouton « Silhouette » de l'atelier |
| `faller` rond même pour la glace | La glace n'utilise que des solides à facettes ; aucune primitive ronde dans sa recette | lecture du code, planche silhouettes |
| Paramètres perdus entre `fromSpec` et le contexte | Un seul contexte typé, construit par `makeContext` | tests « consomme réellement le rang / la portée » |
| Durées de flash exprimées dans la mauvaise unité | Toutes les fenêtres sont en fraction de clip, dans une table `T` par recette | test de fin de clip, test d'absence de trou |
| Glyphes sans fenêtre d'activation effective | — | test « ne laisse aucun trou au milieu du clip » |
| Clips finissant avec des objets visibles | `CLIP_OUT` par recette + rabotage automatique des durées de vie des grains | test « termine sur une image vide », 4 caps × 6 recettes |
| Taille du canevas utilisée pour dimensionner les objets | Les objets sont en unités monde ; le canevas est vérifié en prépasse | test « tient dans son canevas », 16 caps |
| Tables anciennes donnant l'illusion de définir des sorts | Un seul chemin : `SPELLS` → `sample()` → `renderFrame` | — |
| Récits de combos non modélisés | Aucun combo n'est annoncé à ce stade | — |

## Ce qui fonctionne

- Projection isométrique à ratio configurable, repères locaux, cap libre 360°,
  échantillonnage N directions dans le repère monde, hystérésis de sélection.
- Aléatoire déterministe dérivé d'identifiants stables ; évaluation analytique,
  donc navigation temporelle exacte.
- Rastériseur logiciel sans anti-crénelage : polygones, rubans à largeur
  variable, polylignes, disques, anneaux, vides internes, tramage ordonné,
  liseré de silhouette, passe lumière séparable.
- Six recettes, une par élément de base, avec grammaires de forme distinctes.
- Atelier web : lecture, pause, navigation image par image, vitesse, boucle,
  timeline avec événements cliquables, cadran de visée isométrique, comparaison
  8 / 16 caps, isolation silhouette / lumière / liseré / sol / débris,
  diagnostics de cadrage et de fin de clip.
- Export CLI : PNG par image et par cap, GIF de contrôle clair et sombre,
  planches d'images et de directions, planches de catalogue couleur / sans
  lumière / silhouettes, manifeste versionné.

## Commandes exécutées

```
npm run typecheck      → aucune erreur
npm test               → 138 tests, 4 fichiers, tous verts
npm run render:all     → 6 recettes × 8 caps, 12 s
npm run bounds         → 6/6 recettes contenues dans leur canevas à 16 caps
npm run build:web      → dist/atelier.html, 213 Ko
```

## Preuves visuelles

Versionnées dans `docs/planches/` :

- `catalogue.png` — six sorts × cinq instants, en couleur.
- `catalogue-sans-lumiere.png` — même planche sans passe lumière ni liseré.
- `catalogue-silhouettes.png` — silhouettes seules, pour juger les formes.
- `<sort>.gif` — l'animation complète de chaque sort, cap 0, fond sombre.

Régénérables, avec en plus les planches de directions et la variante fond
clair, par `npm run render:all` puis `npx tsx src/cli/board.ts` — sortie dans
`out/`, qui n'est pas versionné.

## Limites connues

1. **Trois recettes par élément non livrées.** Le catalogue J3 demandait neuf
   recettes sur trois éléments ; ce dépôt livre six recettes sur six éléments,
   ce qui correspond à la demande formulée pour cet incrément. Couronne de
   cristaux, vague de gel, chaîne électrique, cage de décharges, projectile de
   feu et jet directionnel restent à écrire.
2. **Découpage `cast` / `fly` / `hit` / `residue` non exploité.** Le contrat et
   le manifeste le prévoient ; les six recettes sont des `oneshot` cuits pour
   une portée donnée. Un tir de distance arbitraire dans un moteur de jeu
   demande des recettes découpées, qui restent à écrire.
3. **Atlas en grille non implémenté.** L'export produit des PNG individuels et
   un manifeste. Le découpage en pages et les limites de taille sont prévus par
   le format mais pas codés.
4. **Unity non validé.** Aucun environnement Unity n'est disponible ici. La
   conversion de repère et les règles d'import sont documentées et testées côté
   moteur ; l'exécution dans Unity reste à valider, et aucun importeur C# n'est
   fourni dans cet incrément.
5. **Web Worker et OffscreenCanvas non câblés.** Le rendu se fait sur le thread
   principal, en 2 à 4 ms par image, ce qui suffit à la lecture temps réel.
   Ils deviendront nécessaires pour un export par lots depuis le navigateur.
6. **IndexedDB, undo/redo, fichiers de projet non implémentés.** L'atelier lit
   le catalogue, il ne l'édite pas encore. C'est le jalon J4.
7. **Aucun combo.** Eau + électricité et eau + glace demandent que les objets
   exposent masque, frontière et points de conduction. Le contrat de nœuds
   typés est esquissé dans `sim/types.ts` mais les sorties ne sont pas encore
   exposées entre recettes.
8. **Test de reconnaissance non réalisé.** La planche anonyme de silhouettes
   est produite pour le rendre possible, mais **aucun test utilisateur n'a eu
   lieu**. Sur cette planche, les silhouettes de l'eau et du feu sont les deux
   plus proches : ce sont deux masses pleines à sommet irrégulier. Le jugement
   reste subjectif tant que la planche n'a pas été montrée à quelqu'un.

## Prochaine étape précise

Écrire les deux recettes manquantes de glace demandées par le catalogue J3 —
**couronne de cristaux** et **vague de gel qui fracture des plaques** — en
réutilisant `grammar/solid.ts` pour la fracture et `grammar/frost.ts` pour la
prise en glace. Cela exercera la fracture d'une surface existante, qui est la
brique dont dépendra ensuite le combo eau + glace.

Dans la foulée : découper la Lance de Givre en `cast` / `fly` / `hit` /
`residue` pour valider le contrat de clips sur un cas réel, et vérifier la
continuité de phase lors d'un changement de cap.
