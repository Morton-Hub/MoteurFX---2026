# Contrat d'export

## Formats produits

| Fichier | Contenu |
|---|---|
| `dir-NN-LABEL/000.png` … | PNG transparent, une image par frame et par cap |
| `anim-dark.gif`, `anim-light.gif` | animation de contrôle, fond sombre et fond clair |
| `sheet-frames.png` | planche de toutes les images d'un cap |
| `sheet-directions.png` | un instant clé pour chaque cap |
| `manifest.json` | manifeste versionné |

Les planches de contrôle du catalogue (`src/cli/board.ts`) produisent en plus
une planche couleur, une planche sans lumière et une planche de silhouettes
seules.

## Manifeste

Le manifeste doit suffire à utiliser un pack **sans reconstituer les pivots à
la main**. Il contient :

- `schemaVersion`, `engineVersion` ;
- `recipeId`, `element`, `title`, `concept`, `signature`, `role`, `seed` ;
- `units` : ce que vaut une unité de sol, une unité de hauteur, un angle ;
- `projection` : identifiant du profil, `groundRatio`, `groundScale`,
  `heightScale`, et la formule elle-même ;
- `pixelScale`, `canvas`, `pivot` ;
- `captureBounds` : rectangle commun à toutes les images et tous les caps,
  marge comprise ;
- `timing` : `duration`, `fps`, `frames`, `loop`, et la liste des instants
  normalisés de chaque image ;
- `radial`, `defaultRange`, `defaultPower` ;
- `directions` : pour chaque cap, l'index, le label, l'angle en radians **et en
  degrés**, le vecteur monde, et l'angle écran à titre indicatif ;
- `events` : identifiant, instant normalisé, instant en secondes, numéro
  d'image, note.

Le **vecteur monde** est le contrat. Le label (`E`, `NE`, …) est lisible mais ne
définit rien : deux profils de projection différents donnent les mêmes labels et
des angles écran différents.

## Pivots et rognage

Le pivot est la position en pixels de la source du sort dans le canevas. Il est
**identique pour tous les caps** — un test le vérifie sur 16 directions — et
exprimé avant tout rognage. Après un rognage sur `captureBounds`, le pivot
utile devient `(pivot.x − captureBounds.x0, pivot.y − captureBounds.y0)`.

Les limites de capture sont calculées en **prépasse** sur toutes les images et
tous les caps. Aucun ajustement image par image n'est fait : c'est ce qui
garantit qu'un clip ne tremble pas.

## Alpha et fonds de contrôle

Les PNG sont en alpha **non prémultiplié**. Les GIF sont aplatis sur un fond
opaque, généré en deux variantes claire et sombre, parce qu'un tramage ou un
liseré qui fonctionne sur fond sombre peut disparaître sur fond clair.

## Atlas

Les limites d'atlas sont configurables selon la cible et contrôlées en largeur
et en hauteur ; le découpage en plusieurs pages est prévu par le format. La
génération d'atlas en grille n'est **pas encore implémentée** : l'export
actuel produit des PNG individuels plus un manifeste, ce qui suffit à
l'inspection et au premier import. C'est la prochaine étape de l'export.

Aucune promesse de taille en mégaoctets n'est faite : la qualité, les
dimensions et la cadence déterminent le volume réel.

## Couleur et lumière séparées

Le renderer produit deux framebuffers : couleur et lumière. La passe lumière
peut être exportée seule pour une composition adaptée dans le jeu, et
désactivée pour vérifier que le sujet reste lisible sans glow.

## Intégration runtime

Quatre rôles de clip sont distingués dans le contrat : `cast` à la source,
`fly` en vol (bouclable, ancré sur le projectile), `hit` à la cible, `residue`
au sol. Les six recettes actuelles sont des `oneshot` : elles jouent la scène
complète pour une portée donnée.

**Un tir de distance arbitraire ne doit pas dépendre d'une animation de trajet
complet prédessinée pour une seule distance.** Le découpage en `cast` / `fly` /
`hit` existe dans le contrat et dans le manifeste ; les recettes qui
l'exploitent restent à écrire. L'export d'une séquence A→B entièrement cuite
reste un mode optionnel distinct, et c'est ce que produisent les recettes
actuelles.

### Unity

L'importeur doit :

- régler les **pixels par unité** depuis `projection.groundScale` ;
- poser le pivot depuis `manifest.pivot`, corrigé du rognage ;
- sélectionner le cap depuis le **vecteur monde**, converti selon
  [`conventions-spatiales.md`](conventions-spatiales.md), et non depuis le
  label ;
- conserver la phase d'animation lors d'un changement de cap ;
- appliquer une hystérésis sur le choix du cap pour éviter les oscillations.

> L'environnement Unity n'est pas disponible dans ce dépôt. Le contrat est
> documenté et testé côté moteur ; **son exécution dans Unity reste à valider**,
> et aucune scène de démonstration n'est fournie.
