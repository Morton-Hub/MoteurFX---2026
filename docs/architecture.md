# Architecture

## Le partage des rôles

| Le moteur garantit | L'artiste décide |
|---|---|
| Projection et cohérence des repères | Caractère des silhouettes |
| Répétabilité des variations | Hiérarchie des masses |
| Synchronisation et export | Poses clés et exagérations |
| Positions et attaches | Choix des motifs et des palettes |
| Diagnostics de cadrage | Acceptation visuelle finale |

Le procédural accélère la fabrication et les variantes. Il ne garantit pas un
résultat artistique fini : c'est pourquoi la moitié du produit est faite
d'outils d'inspection.

## Modules

```text
src/
  core/        math, aléatoire déterministe, bruit, identifiants, diagnostics
  projection/  monde, caméra, caps exportés, repères locaux
  pixels/      canevas indexé, palettes par rôles, masques, ombrage, tramage, style
  motifs/      format PixelMotif, bibliothèque dessinée, placement
  geometry/    prismes, blocs, plaques, masses de feu, réseaux de foudre, sol, fragments
  animation/   budget de douze images, rôles de clips, événements
  renderer/    contexte de frame, objets, tri, émission, scène de capture, rendu
  recipes/     paramètres sémantiques, catalogue, neuf opérateurs de sort
  compiler/    schémas stricts, compilation et diagnostics
  patches/     retouches non destructives signées sur la base
  exporter/    PNG, GIF, atlas, manifeste, projet, ZIP
  workers/     génération hors du fil principal
  cli/         rendu, planches, animations, inspection, résumé
web/           atelier React
unity/         importeur et lecteur
tests/         invariants et contrôles visuels mesurés
docs/          ce dossier
```

Trois règles de dépendance, vérifiables à la lecture des imports :

1. `core/`, `projection/` et `pixels/` ne connaissent aucune recette.
2. Une recette **ne peint jamais** : elle renvoie des objets à peindre, le
   renderer trie et compose. C'est ce qui permet le tri par objet et les passes
   avant/arrière.
3. La preview, le CLI et l'export passent par `renderFrame`. Il n'existe pas de
   second chemin de rendu.

## Décisions et raisons

### Pixels indexés plutôt que RGBA

Le corps d'un sprite est un `Uint8Array` d'index, l'index 0 étant la
transparence franche. La conversion en couleurs n'a lieu qu'à l'affichage ou à
l'export. Sans cela, « palette du corps respectée en mode strict » ne serait
pas vérifiable, et la pipette de l'atelier ne pourrait désigner qu'un RGB
au lieu d'une encre (matière + rôle).

### Douze images, pas un temps continu

La version précédente échantillonnait une simulation continue. Le contrat du
document impose douze images ; un échantillonnage uniforme d'une longue
simulation rate son impact. Chaque recette construit donc **une image à la
fois**, à partir de son index, et les événements sont attribués à une image.

### Le plan face caméra est isotrope en pixels

`cameraPlane` met le vecteur horizontal à l'échelle pour qu'une unité couvre
autant de pixels qu'une unité verticale. Sans cette correction — mesurée en
regardant un rendu — une masse construite ronde sortait ovale, et les lobes
d'ouverture ressemblaient à des ailes.

### Tri par objet, pas par facette

Une dalle inclinée couvre beaucoup plus de profondeur que l'écart entre deux
dalles voisines. Un tri global facette par facette les fait s'interpénétrer.
Chaque solide est donc peint entier, à la profondeur de son centre, puis
contouré une seule fois.

### Retouches après génération, jamais pendant

Une correction porte la signature du rendu sur lequel elle a été faite. Si la
base change, elle est **signalée obsolète et non appliquée** : appliquer une
retouche au mauvais endroit est pire que ne pas l'appliquer. La revalidation
est un geste explicite.

### Particules analytiques, jamais accumulées

Une particule n'a pas d'état : sa position est une fonction fermée de son âge,
freinage compris. C'est ce qui permet au scrubbing de rester exact et à une
image de se régénérer seule. La seed vient de `(seed projet, identifiant
d'émetteur, index)` : ajouter une braise ne déplace pas les autres.

### Deux plans de peinture

Les décalques au sol — ombres, brûlures, givre, ondes — sont peints **tous
avant** la scène. Un décalage de profondeur ne suffisait pas : la clé de tri
dépend de la position monde, donc un objet placé derrière la cible passait sous
le décalque de la cible et se faisait découper par son tramage. Mesure avant /
après sur l'image la plus chargée du catalogue : 65 pixels isolés, puis 29.

### Un opérateur par rang

`familyId` lie trois recettes ; un bouton de rang sélectionne une recette
sœur, il n'interpole rien. Une famille dont deux rangs partageraient un
opérateur échoue au test `auditFamily`.

## Coût mesuré

Sur la machine de cette session (conteneur Linux, Node 22), coût moyen d'une
image complète, huit caps exportés :

| Recette | ms par image |
|---|---|
| Aiguille d'aurore | 0,7 |
| Fil d'orage | 0,8 |
| Couronne du tonnerre | 0,9 |
| Ricochet ionique | 1,0 |
| Jardin de givre | 1,3 |
| Pilier du dragon | 1,8 |
| Cathédrale boréale | 1,9 |
| Cœur de comète | 2,3 |
| Pétale de braise | 4,1 |

Un clip de douze images coûte donc entre 8 et 50 ms, et un export huit caps
entre 70 et 400 ms hors encodage PNG. Ces chiffres valent pour cette machine ;
ils sont régénérés par `npx tsx src/cli/summary.ts`.
