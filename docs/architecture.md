# Architecture

## Séparation des responsabilités

| Module | Rôle | Ne fait pas |
|---|---|---|
| `core/` | math, aléatoire déterministe | ne connaît ni pixels ni recettes |
| `space/` | projection, repères locaux, caps exportés | ne dessine rien |
| `raster/` | framebuffer RGBA, masques, tramage | ne connaît aucune sémantique de sort |
| `render/draw` | commandes de dessin en espace écran | ne touche pas le framebuffer |
| `render/renderer` | tri 2.5D, rastérisation, passes, limites de capture | ne fabrique pas de géométrie |
| `style/` | StyleProfile, palettes par rôle | ne décide d'aucune forme |
| `grammar/` | primitives par famille de matière | n'impose aucune recette |
| `sim/` | contrat d'une recette, événements | ne calcule pas de dégâts |
| `spells/` | les recettes | ne parle jamais au framebuffer |
| `export/` | PNG, GIF, planches, manifeste | ne rend rien lui-même |
| `cli/`, `web/` | outils et interface | n'ont aucun chemin de rendu propre |

**La preview et l'export passent par le même compilateur et le même moteur.**
`renderFrame` est le seul point d'entrée du rendu ; l'atelier web et la CLI
l'appellent tous les deux. Il ne peut donc pas y avoir de divergence entre ce
qui est vu et ce qui est livré.

## Flux de données

```
SpellRecipe.sample(t, ctx)
        │  géométrie construite en coordonnées monde
        ▼
   DrawCmd[]            (espace écran, profondeur, calque, peinture)
        │
        ├─► cmdBounds()      → limites de capture, sans rastériser
        │
        ▼
   renderCommands()
        │  filtre (tranche de profondeur, calques isolés)
        │  tri stable par profondeur, calque par calque
        │  masque de couverture par commande, puis un seul mélange
        ▼
   Framebuffer couleur + Framebuffer lumière
        │
        ├─► Canvas 2D (agrandissement entier, sans lissage)
        └─► PNG / GIF / atlas / manifeste
```

## Décisions

### Évaluation analytique plutôt qu'intégration

`sample(t)` ne dépend d'aucun état accumulé. Chaque particule est une fonction
fermée de son index et du temps. Conséquences directes :

- naviguer à un instant donne **exactement** le même état qu'une lecture depuis
  le début — vérifié par test, et non promis ;
- l'ordre d'évaluation n'a aucune influence ;
- il n'y a ni checkpoints ni replay à maintenir.

Aucune recette du catalogue n'a besoin d'intégration. Si une recette future en
demandait, elle devrait déclarer un replay déterministe ou des points de
reprise — le contrat le prévoit, l'implémentation viendra avec le besoin.

### Temps normalisé pour les systèmes de grains

Les émetteurs de débris travaillent en **fraction de clip**, pas en secondes.
Les vitesses sont donc en tuiles par clip, la gravité en tuiles par clip². Ce
n'est pas une simulation physique mais une balistique artistique, et ce choix
garantit qu'une même recette relue à une autre cadence donne la même
trajectoire. L'émetteur rabote lui-même la durée de vie de chaque grain pour
qu'aucun ne survive à la dernière image (`endsBy`, 0,97 par défaut).

### Un masque de couverture par commande

Un ruban semi-transparent est fait de quads qui se recouvrent à leurs
jonctions. Peindre segment par segment mélangerait deux fois sur les
recouvrements. Chaque commande accumule donc d'abord un masque binaire borné,
puis mélange une seule fois. Un test le vérifie sur un ruban plié.

### Tri par objet quand les solides se côtoient

`emitSolid` trie les faces d'un solide entre elles, et le renderer trie ensuite
toutes les commandes globalement. Cela suffit pour un solide isolé, mais pas
pour une scène qui en contient plusieurs côte à côte : une dalle de terre
inclinée couvre à elle seule une centaine d'unités de profondeur, là où deux
dalles voisines n'en séparent qu'une vingtaine. Le tri global entrelaçait donc
les faces de dalles qui ne se croisent jamais.

`SolidPaint.groupDepth` impose une profondeur commune à toutes les faces d'un
objet, l'ordre interne des faces étant conservé à un epsilon près. L'objet est
peint d'un bloc. À utiliser dès qu'une recette pose plusieurs solides convexes
dans la même scène.

### Le rastériseur ne suffit pas : il faut une passe de matière

Des faces planes projetées, livrées telles quelles, donnent du **low-poly à
plat** : on voit le maillage, les aplats se touchent sans transition, et rien
ne dit où est le volume. C'est la différence entre un rendu 3D en basse
résolution et du pixel art.

`render/material.ts` travaille donc sur la silhouette déjà peinte, en espace
écran, et lui rend les trois choses qui font lire un volume :

1. un **liseré clair** sur les bords tournés vers la lumière — interrompu, pas
   continu : un seuil trop bas allume toute la moitié supérieure d'un trait
   uniforme qui se lit comme une bordure dorée ;
2. une **ombre de contact** sur les bords opposés, à l'intérieur ;
3. un **contour sélectif** à l'extérieur, franc du côté sombre et atténué du
   côté éclairé.

Deux conséquences dans le reste du moteur. Les contours **par face** ont
disparu : ils exposaient le maillage. Et `StyleProfile.facetRange` réserve les
extrêmes de la rampe aux arêtes — une face entière qui atteint le noir
transforme le corps en silhouette.

### Un feu ne s'ombre pas, il rayonne

La même passe appliquée à une flamme la transforme en caillou. Une flamme
n'est pas éclairée de l'extérieur : sa valeur dépend de son **épaisseur de
matière**, bord sombre et cœur blanc.

`applyEmissive` prend donc la silhouette **réunie** de tout ce qui brûle,
mesure en chaque pixel sa distance au bord, et en déduit la couleur. Deux
lobes qui se recouvrent fusionnent alors en un corps plus épais, donc plus
chaud en son milieu — au lieu de rester deux objets orange empilés, ce qui
donnait un « amas de briques ». La rampe est normalisée par corps, en
8-connexité : une constante globale ne peut pas servir à la fois une mèche de
dix pixels et une explosion de quarante.

La couleur, elle, ne vient **pas** d'un dégradé concentrique. Une flamme
dessinée à la main est mouchetée : des amas d'orange et de rouge dispersés
dans un champ majoritairement jaune. L'épaisseur n'incline donc la valeur que
sur la frange extérieure — appliquée linéairement, elle décale toute la masse
d'un échelon, la moyenne de `1 - t` sur un disque valant déjà un tiers — et
c'est un bruit par cellules qui porte le reste, remonté par un exposant qui
décide de la part de jaune.

Trois détails comptent, chacun mesuré plutôt que jugé à l'œil (les proportions
visées sont celles d'une référence de pixel art : environ 55 % de jaune, 25 %
d'orange, 12 % d'orange foncé, 7 % de rouge) :

- **pas de tramage entre échelons.** Il ajoute un grain parasite et déplace la
  moitié des pixels de la valeur claire vers la suivante : la masse vire à
  l'orange quel que soit le réglage ;
- **pas de moyenne de deux bruits d'égal poids.** Elle resserre la
  distribution autour de 0,5, donc tous les pixels tombent sur le même
  échelon. Les gros amas décident, le détail ne fait que froisser leur bord ;
- **pas de contour.** Un feu se détache par sa propre clarté ; un trait sombre
  autour en fait un objet découpé.

La rampe du feu a suivi : quatre valeurs saturées du jaune au rouge, aucune
sombre. La précédente allait du blanc cassé au brun profond, si bien que la
moitié de la masse tombait dans des valeurs éteintes.

Corollaire : un corps émissif ne se fond pas par tramage. Trouer sa silhouette
fait mesurer à la passe l'épaisseur d'un grillage, et toute la masse retombe
sur les échelons sombres. Il s'éteint en rétrécissant.

Chaque commande déclare donc sa matière — `solid`, `soft` ou `emissive` — et
`soft` existe pour la même raison : appliquer une structure de volume à de la
poussière ou de la fumée en fait des objets solides.

### Une boîte se lit toujours comme une boîte

Deux tentatives successives l'ont montré à l'écran. Un pavé à six faces, même
avec ses sommets bruités, garde trois directions d'arêtes parallèles que l'œil
reconstruit immédiatement : le météore ressemblait à un dé, le marteau à un
carton. Et un éventail de triangles convergeant vers un sommet unique dessine
un parasol, dont la régularité saute aux yeux.

`rockLump` résout les deux : quatre couronnes bruitées, tronquées par une face
franche en haut et en bas, décalées latéralement les unes par rapport aux
autres et roulées différemment, de sorte qu'aucune arête n'en prolonge une
autre. `shatterVolume` construit ses fragments de la même façon — découpés en
pavés, ils formaient à l'atterrissage un pavage de tuiles plates.

### Le dégradé appartient au corps, pas à la primitive

Un dégradé postérisé ancré sur la silhouette de chaque primitive fonctionne
pour un objet isolé, et échoue pour un flux : chaque parcelle de flamme portait
son propre dégradé clair-vers-sombre, et la colonne se lisait comme une pile de
tranches. Le feu partage donc un dégradé unique, calé sur la hauteur de la
gerbe : la couleur d'un pixel ne dépend plus que de son altitude dans la
colonne, et les parcelles se fondent en un seul corps.

### Seeds dérivées d'un identifiant stable

`deriveSeed(seedProjet, cheminDeNœud)`. Jamais l'index d'un tableau, jamais
l'horloge. Ajouter un élément décoratif ne décale donc pas les tirages des
autres objets.

### Liseré de silhouette en dilatation extérieure

Le liseré est calculé après la peinture du calque principal, par dilatation
d'un pixel de la silhouette déjà composée. Il cerne donc l'objet entier et non
chaque primitive, ce qui garde la lecture d'ensemble. Il ne s'applique ni aux
décalques de sol ni à la passe lumière : cerner une ombre n'a pas de sens.

### Passe lumière séparée

Le calque `light` est rendu dans son propre framebuffer, puis composé en
additif selon `StyleProfile.glowAlpha`. Il peut être exporté seul pour une
composition adaptée dans le jeu, et désactivé pour vérifier que **le sujet
reste lisible sans glow** — c'est un contrôle, pas une option cosmétique.

### Canevas fixe par recette, limites calculées en prépasse

La taille du canevas ne sert **jamais** à dimensionner les objets : ceux-ci
sont exprimés en unités monde. Augmenter la puissance d'un sort ne peut donc
pas provoquer de recadrage. Les limites de capture sont calculées en prépasse
sur toutes les images **et** tous les caps, avec marge explicite ; un test
vérifie qu'elles tiennent dans le canevas déclaré, et `npm run bounds` propose
un canevas et un pivot corrects quand ce n'est plus le cas.

## Ce qui n'est pas dans le socle

Ni moteur 3D, ni WebGPU, ni WebAssembly, ni service IA. Le rastériseur logiciel
rend une image de 336 × 200 en **2 à 4 ms** sur un poste de développement, ce
qui suffit largement à une lecture temps réel à 30 Hz dans l'atelier. Ces
technologies restent possibles si une mesure les justifie.

Le Web Worker et OffscreenCanvas ne sont pas encore câblés : ils deviendront
nécessaires quand l'export par lots se fera depuis le navigateur, pas avant.
L'atelier annonce donc explicitement que l'écriture de fichiers passe par la
CLI, plutôt que d'afficher un bouton sans effet.
