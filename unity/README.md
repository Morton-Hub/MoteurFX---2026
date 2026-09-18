# Intégration Unity

Ce dossier contient le code d'intégration du pack MOTORFX2 dans Unity.

> **État de validation.** Unity n'est pas exécutable dans l'environnement où ce
> code a été écrit : il est **fourni et relu, mais sa validation réelle reste
> ouverte**. Les points à vérifier en premier sur un projet réel sont listés en
> bas de page. Aucun résultat d'exécution n'est annoncé ici.

## Contenu

| Fichier | Rôle |
|---|---|
| `Runtime/MotorFxManifest.cs` | Modèle du manifeste : douze expositions, plages de rôles, caps monde, cellules d'atlas, pivots. Choisit l'image par cumul des durées et le cap par plus proche voisin avec hystérésis. |
| `Runtime/MotorFxPack.cs` | Ressource liant le manifeste, l'atlas du corps et l'atlas d'émission découpés. Vérifie que le nombre de sprites correspond aux cellules déclarées. |
| `Runtime/MotorFxPlayer.cs` | Lecteur d'un clip directionnel. Conserve le temps lors d'un changement de cap, émet les événements du manifeste, affiche la dernière image pendant toute son exposition puis applique l'effacement déclaré. |
| `Runtime/MotorFxSpell.cs` | Assemblage `cast` → `fly` → `hit` → `residue`. La position du projectile avance à la fréquence du jeu, le dessin suit la timeline. Le contact est notifié ; les dégâts restent au gameplay. |
| `Editor/MotorFxImporter.cs` | Menu **MOTORFX2 ▸ Importer un pack…** : filtrage Point, aucune compression, pixels par unité déduits du manifeste, découpage et pivots pris sur les cellules déclarées. |

## Marche à suivre

1. Exporter un pack depuis le CLI ou l'atelier :
   `npx tsx src/cli/render.ts --recipe fire-ember-fist-s --dirs 8 --out out`
2. Copier le dossier du sort (`<id>-body.png`, `<id>-emission.png`,
   `<id>.manifest.json`) dans `Assets/` du projet Unity.
3. Menu **MOTORFX2 ▸ Importer un pack…**, choisir le `.manifest.json`.
4. Poser un `MotorFxSpell` sur un objet, lui donner le pack, une source et une
   cible, puis appeler `Cast()`.

## Ce qu'il faut vérifier en premier sur un projet réel

- La conversion de repère des pivots : l'atlas compte les Y depuis le haut,
  Unity depuis le bas. Un décalage d'un pixel se voit au changement de cap.
- `TextureImporter.spritesheet` est une API héritée ; sur les versions récentes
  d'Unity, le découpage peut devoir passer par `SpriteDataProviderFactories`.
- Le cap est mesuré ici dans le plan `(x, z)` de Unity. Un projet qui pose sa
  scène en `(x, y)` doit adapter `MotorFxSpell.Heading()`.
- La passe lumineuse doit être rendue en additif par un matériau dédié ; le
  corps doit rester lisible si cette passe est désactivée.
- Les pixels par unité viennent de `projection.pixelsPerTile` (16 par défaut) :
  ils doivent correspondre à l'échelle des tuiles du jeu, sinon les sorts ne
  seront pas à la même échelle de pixels que le décor.
