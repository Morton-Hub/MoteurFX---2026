# Conventions spatiales

Quatre repères sont distingués explicitement. Les confondre est la source la
plus courante de sprites qui « glissent » entre deux caps.

## 1. Le monde

- Sol `(x, y)` en **tuiles**, hauteur `z` en **tuiles**.
- Repère direct, `z` vers le haut.
- Le cap horizontal `0` rad pointe vers `+x`, et croît vers `+y`.
- Une direction est toujours calculée par `cible − source` **dans le plan du
  sol** : la différence de hauteur n'entre jamais dans le cap.

## 2. Le repère local du sort

`(avant, côté, haut)`, obtenu par rotation du repère monde autour de l'axe
vertical.

```
avant = ( cos θ,  sin θ, 0)
côté  = (−sin θ,  cos θ, 0)
haut  = (     0,      0, 1)
```

Une recette construit sa géométrie dans ce repère (`ctx.wl(avant, côté, haut)`),
puis le moteur projette. Aucune orientation n'est fabriquée en faisant tourner
ou en retournant une image finale.

## 3. La caméra

Projection orthographique isométrique :

```
screenX = originX + groundScale × (x − y)
screenY = originY + groundScale × groundRatio × (x + y) − heightScale × z
```

- `groundRatio` vaut `0.5` par défaut — le ratio de sol 2:1 — et il est
  **configurable** : il n'est codé en dur dans aucune primitive.
- `heightScale` est **indépendant** de `groundScale`. Un objet haut ne
  s'écrase pas sous prétexte que le sol est projeté en 2:1.
- `originX, originY` est le **pivot** : la position en pixels de la source du
  sort dans le canevas. Il est identique pour tous les caps.

L'inverse `unprojectGround` ramène un point écran sur le sol `z = 0`. C'est la
conversion à utiliser quand l'utilisateur vise à la souris : on revient au sol,
**puis** on calcule la direction.

L'axe de vue est déduit du profil par `cameraDir` : c'est le vecteur monde dont
la projection est nulle. C'est lui qui élimine les faces arrière, sans que le
ratio 2:1 ait besoin d'être supposé quelque part.

### Cas dégénéré

Si source et cible sont confondues, `headingFromTo` renvoie le cap de repli
fourni par l'appelant. Le comportement est défini ; il ne produit jamais `NaN`.

## 4. Les pixels

Origine en haut à gauche, `y` vers le bas. Le rendu de référence se fait à la
résolution native, **sans anti-crénelage**. Le seul agrandissement autorisé est
entier et sans lissage.

## Caps exportés

- Le moteur accepte un cap arbitraire sur 360°.
- L'export propose 8 et 16 directions en standard ; `N` est configurable, avec
  un angle initial explicite.
- Les directions sont échantillonnées **dans le repère monde**. Leurs angles
  projetés à l'écran ne sont donc pas régulièrement espacés — un test le
  vérifie explicitement.
- Le manifeste stocke le vecteur monde et l'angle en radians. Le label (`E`,
  `NE`, …) est informatif : il ne définit aucun contrat.
- Une spritesheet à 8 ou 16 directions est une **approximation discrète** d'un
  moteur à cap libre. Son playback ne doit pas être présenté comme un rendu
  continu exact.
- `pickDirection` choisit le cap exporté le plus proche, avec une hystérésis
  optionnelle en radians qui empêche l'oscillation entre deux caps voisins.

Aucune recette du catalogue n'est déclarée radiale. Un effet réellement
invariant par rotation pourrait partager un rendu, à condition de le déclarer
(`radial: true`) — et le test de déterminisme vérifie alors la cohérence.

## Profondeur 2.5D

```
depthOf(p) = (p.x + p.y) × 64 − p.z
```

Croissante vers l'observateur : une commande de clé plus grande est peinte
après. La profondeur au sol domine ; la hauteur ne sert que de départage pour
une même cellule, de sorte que le bas d'une colonne passe devant son sommet.

**Limite assumée** : un tri global ne résout pas les intersections réelles. Une
image aplatie ne peut pas entourer correctement un personnage quelconque. Le
renderer accepte une option `depthRange` qui permet de produire deux passes
avant / arrière synchronisées ; les intersections complexes demandent une autre
solution, que ce moteur ne prétend pas fournir.

## Ombres, traînées, contact

- Les ombres sont projetées depuis la **position au sol** `(x, y, 0)`, jamais
  depuis la hauteur visuelle.
- Les traînées suivent la tangente réelle de la trajectoire, calculée à partir
  de la vitesse analytique du mobile.
- Les débris et les jets ont un **cône d'émission orienté** autour d'un axe
  monde donné (`coneDirection`).
- Le point de contact correspond à la cible quel que soit le cap : un test le
  vérifie pour les 16 directions.

## Conversion vers Unity

Unity utilise un repère gaucher avec `y` vers le haut. La correspondance :

| MoteurFX | Unity |
|---|---|
| `x` (sol) | `x` |
| `y` (sol) | `z` |
| `z` (hauteur) | `y` |
| cap θ (rad, 0 = +x, vers +y) | `Quaternion.Euler(0, −θ × Rad2Deg, 0)` |

Les **pixels par unité** se déduisent de `groundScale` du manifeste : avec
`groundScale = 22` et une tuile de sol d'une unité Unity, l'import se fait à
22 pixels par unité. Le pivot du sprite se règle sur `manifest.pivot`, exprimé
en pixels depuis le coin haut-gauche du canevas, avant tout rognage.

> L'environnement Unity n'est pas disponible dans ce dépôt : le contrat de
> conversion est documenté et testé côté moteur, **son exécution dans Unity
> reste à valider**.
