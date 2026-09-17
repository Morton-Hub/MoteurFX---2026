# Formats : recette, motif, projet, export

Tous les schémas sont **stricts** : une propriété inconnue est une erreur, pas
un champ ignoré en silence. C'est la seule façon d'éviter qu'une recette
décrive un comportement que le moteur ne lit pas.

## Recette (`schemaVersion: 3`)

```json
{
  "schemaVersion": 3,
  "id": "ice-aurora-needle-s",
  "familyId": "ice-aurora",
  "rank": "S",
  "name": "Aiguille d’aurore",
  "builder": "ice-aurora-needle-s",
  "seed": 42,
  "style": "arcane-miniature",
  "element": "ice",
  "action": "projectile",
  "projection": "iso-2:1",
  "parameters": { "crystalLength": 1.05, "crystalRadius": 0.27, "facets": 6 },
  "animation": {
    "frameCount": 12,
    "frameDurationsMs": [70, 60, 70, 80, 55, 40, 35, 50, 70, 80, 95, 110],
    "endBehavior": "clear",
    "frameIndexBase": 0,
    "events": [{ "id": "contact", "frame": 6 }]
  },
  "clips": {
    "cast": { "range": [0, 2], "anchor": "source", "operator": "prism" },
    "fly": { "range": [3, 5], "anchor": "projectile", "playback": "loop" },
    "hit": { "range": [6, 8], "anchor": "target", "trigger": "contact" },
    "residue": { "range": [9, 11], "anchor": "ground-target", "motif": "ice-frost-patch-v1" }
  },
  "export": {
    "directions": 8,
    "directionSpace": "world",
    "framesPerDirection": 12,
    "bodyProfile": "pixel-light",
    "separateEmission": true
  },
  "stage": { "width": 160, "height": 120, "distance": 2.6, "casterHeight": 0.55 },
  "silhouette": "Un prisme rigide construit par paliers, projeté dans l’axe du cap, qui casse net."
}
```

Ce que la compilation refuse ou signale :

| Code | Niveau | Sens |
|---|---|---|
| `frame-count`, `duration-count`, `duration-positive` | erreur | le contrat des douze images n'est pas tenu |
| `clip-gap`, `clip-overlap`, `clip-range` | erreur | les plages ne partitionnent pas exactement les douze images |
| `event-frame` | erreur | un événement pointe hors des douze cellules |
| `contact-outside-hit` | avertissement | le contact tombe hors de la plage d'impact |
| `builder-missing`, `builder-element`, `builder-rank` | erreur | la recette et son opérateur ne parlent pas du même sort |
| `motif-missing` | erreur | un motif cité n'existe pas |
| `motif-unused`, `operator-unused` | avertissement | une plage cite une ressource que l'opérateur ne consomme pas |
| `param-unknown`, `param-choice` | erreur | paramètre inconnu ou choix invalide |
| `param-range` | avertissement | valeur hors bornes, ramenée aux bornes |
| `param-unused` | avertissement | **le curseur existerait dans l'atelier sans rien piloter** |
| `frame-clipped` | avertissement | une image touche le bord du canevas de capture |
| `patch-stale` | avertissement | une retouche a été faite sur une autre base |

## Motif dessiné

Un motif est écrit en ASCII, un caractère par pixel, et chaque caractère
désigne un **rôle** de palette, pas une couleur — le même dessin sert donc
plusieurs matières.

```
'.' ou ' ' vide      '-' contour     'd' ombre profonde
's' ombre            'b' corps       'l' lumière        'a' accent
```

Un motif porte : identifiant, version, matière par défaut, images et durées
propres, pivot, points d'attache, capacité directionnelle, transformations
autorisées et **provenance**. Les trente-sept dessins livrés sont originaux ;
un motif importé devra porter sa licence.

## Projet portable

```json
{
  "formatVersion": 1,
  "engineVersion": "2026.2.0",
  "savedAt": "2026-09-17T22:10:00.000Z",
  "styleProfile": "arcane-miniature",
  "recipes": [ … ],
  "patches": [ … ],
  "notes": "lot de référence"
}
```

**Politique de migration, explicite.** Une clé inconnue n'est jamais
transformée en valeur par défaut ni supprimée en silence : le chargement
échoue avec un diagnostic qui la nomme. Une version antérieure est migrée par
une fonction déclarée dans `MIGRATIONS` ; en l'absence de migration, le
fichier est refusé plutôt que réinterprété au hasard. Une version future est
refusée de la même manière.

IndexedDB sert à **reprendre** une session ; le fichier exporté reste la
sauvegarde transportable.

## Retouche

```json
{
  "id": "ice-aurora-needle-s#f4#d0",
  "recipeId": "ice-aurora-needle-s",
  "frame": 4,
  "direction": 0,
  "baseSignature": "3f2a91c7",
  "pixels": [{ "x": 61, "y": 48, "ink": "ice.crystal:accent" }]
}
```

`direction: null` applique la correction à tous les caps. `ink: null` efface le
pixel. `baseSignature` est la signature du rendu de base : si elle ne
correspond plus, la retouche est rapportée obsolète et **n'est pas appliquée**.
