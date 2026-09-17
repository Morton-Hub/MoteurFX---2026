# Conventions de projection et de direction

Quatre repères sont distingués. Les confondre est la cause la plus courante de
sprites qui glissent d'un cap à l'autre.

## 1. Monde

- Sol `(x, y)` en **tuiles**, hauteur `z` en **tuiles**, repère direct.
- Le cap `0` pointe vers `+x` et croît vers `+y`.
- Toutes les tailles de recette sont en tuiles, jamais en pixels : une recette
  ne connaît pas la taille du canevas.

## 2. Repère local du sort

`makeFrame(origine, cap)` donne `avant`, `côté`, `haut`. Une recette exprime
« 30 cm devant la main, à gauche » sans jamais manipuler d'angle d'écran.

## 3. Caméra

```text
screenX = originX + groundScale * (x - y)
screenY = originY + groundScale * groundRatio * (x + y) - heightScale * z
```

`groundRatio = 0,5` correspond au profil de sol 2:1. Le ratio n'est recopié
dans aucun opérateur : la direction de caméra et le plan face caméra en sont
**déduits** (`cameraDir`, `cameraPlane`), de sorte qu'un autre profil de
projection reste cohérent.

`heightScale` est indépendant de `groundScale` : un objet haut ne s'écrase pas
sous prétexte que le sol est projeté en 2:1.

## 4. Image

Pixels logiques, origine en haut à gauche, `y` vers le bas. Le pivot d'un
export est la projection de la cible au sol : il ne bouge pas d'un cap à
l'autre, ce qui est la condition d'un changement de direction sans saut.

## Contrat directionnel

- Le système accepte un cap quelconque sur 360°.
- Les exports standards couvrent 8 et 16 caps ; tout `N ≥ 1` est accepté.
- Les caps sont échantillonnés **dans le monde**, avec un angle initial
  explicite. Leurs angles à l'écran ne sont donc pas régulièrement espacés —
  c'est exactement pourquoi l'échantillonnage n'est pas fait à l'écran.
- Chaque cap exporté déclare son angle monde, son vecteur et son angle écran.
- Une spritesheet finie n'est pas un rendu continu exact.

## Capacités directionnelles des ressources

Chaque motif déclare ce qu'il sait faire :

| Capacité | Sens | Exemple livré |
|---|---|---|
| `procedural` | La structure est reconstruite pour chaque cap | prismes, masses de feu, réseaux de foudre |
| `drawn-8` / `drawn-16` | Le motif possède 8 ou 16 jeux de dessins | aucun à ce jour |
| `billboard` | Le dessin fait face à la caméra, son attache vit dans le monde | langue de feu, éclat de cristal, fumée |
| `radial` | Rendu partageable entre caps, invariance réelle | braise, étincelle, marque au sol |

Un angle libre demandé à un motif dessiné en huit directions ne crée pas de
nouveaux dessins. Le miroir horizontal est autorisé **uniquement** si la
ressource le déclare ; `mirrorPairs` documente pourquoi cinq dessins suffisent
à huit caps dans cette projection, et une transformation non déclarée lève une
erreur au lieu de casser silencieusement la lumière.

## Hystérésis

`pickDirection(dirs, cap, courant, marge)` ne quitte le cap courant que si un
autre est meilleur d'au moins la marge. Sans cela, un personnage qui pivote
fait clignoter le sprite entre deux directions voisines. Le lecteur Unity
applique la même règle, avec la marge exprimée en degrés.
