# Bible artistique — Arcane miniature

Ce document dit **ce qu'on veut voir**, et surtout comment on le vérifie. Une
règle qui ne se vérifie pas sur des pixels n'a pas sa place ici.

## Les trois piliers

1. **Silhouette avant décoration.** Le sort est reconnaissable sans sa palette
   et sans sa lumière additionnelle. Contrôle : `--mode silhouette` et le
   bouton « Silhouette » de l'atelier.
2. **Matière avant particules.** Un cristal, une flamme et un éclair ont des
   structures et des mouvements différents, pas une même boule recolorée.
   Contrôle : `--mode mono`, et le test automatique de distinction entre
   éléments à rang égal.
3. **Animation avant accumulation.** Une préparation lisible et un changement
   de pose fort valent mieux qu'un écran rempli de points. Contrôle : lecture à
   vitesse normale, puis ralentie, sur les animations de contrôle.

## Le contrat pixel art

| Paramètre | Valeur en vigueur | Où c'est appliqué |
|---|---|---|
| Tuile de référence | 64 × 32 pixels logiques | `ARCANE_MINIATURE.tile` |
| Personnage témoin | 32 pixels de haut | dessiné dans la scène de l'atelier |
| Palette d'une matière | 4 à 7 couleurs | vérifié au chargement par `material()` |
| Affichage de contrôle | ×1 à ×4, agrandissement entier | atelier et planches |
| Budget d'animation | exactement 12 images par sort et par direction | `FRAME_COUNT`, validé |
| Lecture | une exposition déclarée par image | `frameDurationsMs`, douze valeurs positives |

La taille de la silhouette, la taille de la tuile et celle du canevas sont
trois notions différentes. Les canevas de capture vont de 144 × 120 à
176 × 200 pixels selon le sort ; les silhouettes mesurées vont de 49 × 28
(Aiguille d'aurore) à 114 × 92 (Pilier du dragon) — voir `docs/catalogue.json`,
régénérable par `npx tsx src/cli/summary.ts`.

## Construction des pixels

- **Clusters** : des groupes contigus qui décrivent une surface ou une lumière.
  Les pixels isolés sont des accents rares — braise, étincelle, poudrin.
- **Pas de contour noir universel.** Le contour est déclaré par la matière :
  le cristal et la croûte rocheuse en ont un, la flamme et la décharge n'en ont
  pas. Le bord d'une flamme est sa couleur la plus saturée, et c'est le fond
  qui fait le contraste.
- **Tramage réservé aux transitions** où il améliore la matière : l'ombre
  portée (damier 2×2, faute d'alpha partiel dans un sprite indexé) et les
  marques au sol. Le profil de référence reste lisible sans lui.
- **Aucun redimensionnement non entier.** Les motifs se placent à des
  coordonnées entières, s'agrandissent d'un facteur entier, se retournent
  horizontalement si la ressource le déclare, et ne tournent jamais.

## Palette et lumière

Chaque matière porte des **rôles** — contour, ombre profonde, ombre, corps,
lumière, accent — et non des RGB dispersés dans les recettes. Deux régimes
d'ombrage, et pas un seul :

- **Solide** : la valeur vient de la normale de la facette et de la lumière
  monde, qui arrive du haut-gauche de l'écran et **ne tourne pas** avec le
  sprite. C'est ce qui rend les huit caps cohérents entre eux.
- **Émissif** : la valeur vient de l'**épaisseur** locale — cœur clair, bord
  saturé. Le seuil de cœur suit la masse : avec un seuil fixe, une grande masse
  atteint partout sa teinte la plus claire et devient le « gros centre blanc »
  que le document proscrit.

Le haut de la rampe est réservé aux arêtes : les facettes d'un solide sont
bornées à `facetRange = [0,06 ; 0,78]`. Une face entière qui atteint l'accent
efface la matière.

La passe lumineuse est **séparée et déduite** : seuls les pixels de matière
émissive déjà clairs rayonnent, avec un débord d'un pixel. Aucun flou. Le corps
doit rester lisible sans elle — c'est le profil `pixel-strict`.

## Identités élémentaires livrées

| Élément | Silhouette et motifs | Gestuelle | Fin | Dérive évitée |
|---|---|---|---|---|
| Feu | Langues crochues, lobes, pétales ouverts, trous internes | Compression, déploiement, déchirement vers le haut | Braises et fumée en amas | Nuage rond uniformément orange |
| Glace | Prismes obliques, facettes, étoiles cassées, plaques | Croissance par paliers, maintien rigide, rupture sèche | Fragments plats et givre | Pics de terre simplement bleus |
| Foudre | Zigzags, nœuds, fourches, branches interrompues | Connexion brusque, pose tenue, coupure, reprise | Courts arcs résiduels | Trait tremblant redessiné à chaque image |

Trois décisions concrètes en découlent dans le code :

- la glace n'utilise **aucune primitive ronde** ; ses fragments dérivent des
  facettes du prisme cassé ;
- la foudre porte la seed de **sa frappe**, pas de la frame : une pose tenue
  garde exactement le même dessin, et c'est la coupure qui anime ;
- le feu construit ses masses dans un plan face caméra **isotrope en pixels** :
  sans cette correction, une masse ronde sort ovale et les lobes deviennent des
  ailes.

## Ce que l'on évite, et comment on s'en assure

| Dérive | Garde-fou dans le produit |
|---|---|
| Le même anneau lumineux sous chaque élément | Aucune primitive d'anneau ; les marques au sol sont des disques irréguliers tramés, orientés par le cap |
| Bruit renouvelé à chaque image | Tout bruit dépend de `(seed, coordonnées)` ; test de déterminisme sur les neuf sorts |
| Gros centre blanc | Le seuil de cœur suit l'épaisseur de la masse ; `facetRange` borne les solides |
| Halo flou pour finir un sort | Aucune passe de flou n'existe dans le moteur |
| Contours qui vibrent | Placement entier, pas de rotation de dessin, seed stable par objet |
| Quantité de recettes prise pour de la diversité | Neuf recettes, chacune avec son opérateur ; une famille dont deux rangs partageraient un opérateur échoue au test |

## Particules et secondaires

Un sort n'est pas seulement sa masse principale. Ce qui le rend **impressionnant**,
c'est ce qui l'accompagne — et ce qui distingue les éléments, une fois la masse
retirée, ce sont précisément ces secondaires-là.

### La structure en trois temps

| Temps | Ce qu'on montre | Où c'est appliqué |
|---|---|---|
| **Anticipation** | Peu de matière, elle **converge**, le sol chauffe ou se charge | frames 1–3 des neuf recettes |
| **Climax** | Densité et contraste maximaux, une seule image, onde au sol | frame de contact, marquée `contact` dans le manifeste |
| **Dissipation** | Ce qui reste retombe, le gazeux prend le relais, le décalque se retire | trois à quatre dernières images |

Plus l'anticipation est lisible, plus le climax porte. C'est pour cela que les
premières images ne montrent presque rien d'autre qu'une convergence.

### Vocabulaires élémentaires

| Élément | Secondaires | Onde au sol | Ce qu'on refuse |
|---|---|---|---|
| Feu | Braises qui montent et refroidissent, étincelles à traînée, cendres qui tournoient, fumée qui s'ouvre | Pétales rayonnants, creux au centre | Un halo orange uniforme |
| Glace | Éclats rigides **sans traînée**, poudrin flottant, brume rasante, éclats de lumière tenus une image | Pointes nettes qui poussent par paliers | Une poussière bleue générique |
| Foudre | Étincelles filantes, poussière statique **aspirée** vers la charge, nœuds tenus | Branches qui courent et s'interrompent | Un anneau lumineux, sous aucun prétexte |

### Règles de fabrication

- **Une particule est un amas**, jamais un point : cinq pixels au minimum. Un
  pixel isolé grésille en mouvement et disparaît à la lecture.
- **Le gazeux a un cœur plein et un bord tramé**, et son bord ne se pose que
  sur du vide : une bouffée entièrement tramée perfore ce qu'elle recouvre.
- **Tout est semé dans le monde et orienté par le cap.** À l'impact, la gerbe
  part vers l'avant du sort : c'est ce qui rend les huit directions réellement
  différentes.
- **Les décalques au sol forment un plan peint avant la scène.** Un simple
  décalage de profondeur ne suffit pas : un objet placé derrière la cible
  passait sous le décalque et se faisait découper par son tramage.
- **Rien ne se renouvelle au hasard d'une image à l'autre.** Positions et
  tailles sont des fonctions fermées de `(seed, identifiant, index)`.

Deux tests mesurent ces règles sur les neuf recettes : nombre de pixels isolés
et nombre de formes par image, en voisinage 8 — une diagonale d'un pixel est
une forme, pas de la poussière.

## Trois rangs, trois constructions

Pour passer d'un rang à l'autre, au moins la silhouette, le comportement
dominant et la nature de la conséquence changent. Changer seulement la taille,
la couleur ou le nombre de particules ne vaut pas évolution — et le test
`les trois rangs d'une famille ont des silhouettes différentes` le mesure sur
des empreintes **normalisées en taille**, donc un simple agrandissement ne
passe pas.
