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

## Reprise artistique — terre et feu

Trois défauts de la terre étaient des bugs, pas des questions de goût :

| Symptôme | Cause mesurée | Correction |
|---|---|---|
| Dalles qui semblent se plier comme du carton | Tri face par face global : une dalle inclinée couvre ~130 unités de profondeur, deux dalles voisines ~25 | `groupDepth` : chaque dalle est peinte comme un objet entier |
| Faces striées en travers | Les strates suivaient une arête de la face inclinée | Elles sont construites sur le bloc avant bascule, donc dans le lit de sédimentation, et tournent avec lui |
| Dalles qui s'évaporent sur place | L'angle repassait sous le seuil de visibilité en deux images | Inclinaison résiduelle après retombée, puis la terre se referme (les dalles redescendent dans le sol) |

Plus : épaisseur portée de 0,13–0,22 à 0,24–0,38 tuile, logement sombre au sol
sous chaque dalle, éclats sur les grandes faces plates.

Le feu, lui, ne bougeait pas : entre t = 0,28 et t = 0,64 la silhouette était
quasi identique. Le corps était un faisceau de langues ancrées à un point fixe,
qui rétrécissaient au lieu de monter. Il a été reconstruit en **flux** : des
parcelles naissent en continu à la base, montent, s'étirent et refroidissent, et
le déchirement n'est plus un effet ajouté mais la conséquence de la coupure du
débit — les dernières parcelles poursuivent leur montée, le socle s'éteint sous
elles, un vide s'ouvre. Le dégradé est désormais partagé par toute la colonne,
sinon les parcelles se lisaient comme une pile de tranches.

Deux réglages de finition ont suivi, chacun corrigé après inspection :

- **Socle du feu.** Il se lisait comme un dôme blanc posé sous la gerbe. Aplati
  et bruité, il est devenu une éclaboussure en étoile plus large que la colonne
  — l'excès inverse. Il est désormais tenu **plus étroit que le pied du flux**
  et peu accidenté : il ferme le bas de la colonne sans jamais en dépasser, et
  les premières parcelles le recouvrent.
- **Assise des dalles.** En projection isométrique, une dalle replantée à 24°
  se lit déjà comme posée à plat. L'inclinaison résiduelle est portée à 0,7 rad
  (≈ 40°), plafonnée à 60 % de l'inclinaison initiale pour que la chute reste
  lisible : les dalles partent de 60 à 86° et retombent à 33–40°.

Coût mesuré : 4,3 ms par image en moyenne pour le feu, la recette la plus
chargée du catalogue.

## Refonte du feu et de la terre

Les deux sorts ont été remplacés, pas retouchés. Le diagnostic reposait sur une
mesure : pour chaque recette, on rend les huit caps, on **recadre chaque image
sur sa propre silhouette** — sans ce recadrage on ne mesure que la translation,
pas la forme — puis on compare.

| Recette | La forme change avec le cap |
|---|---|
| Arc de Rupture | 75 % |
| Lance de Givre | 72 % |
| Lame Déferlante | 50 % |
| Éventration *(remplacée)* | 48 % |
| Spirale de Coupe | 26 % |
| Gerbe Ascendante *(remplacée)* | **9 %** |

À 9 %, la gerbe donnait la même silhouette dans les huit directions : une
colonne verticale n'existe pas en isométrie, elle serait identique dans un jeu
vu de côté. Le sort n'était pas non plus un événement mais un phénomène continu,
sans battement.

L'éventration, elle, était bien directionnelle, mais sans hiérarchie : sept
dalles équivalentes le long d'une ligne, aucune dominante, le même battement
répété sept fois, et 30 px d'amplitude verticale seulement.

- **Feu → « Météore ».** Un bloc en fusion entre sur une oblique alignée sur le
  cap, venant de derrière et au-dessus du lanceur. L'ombre au sol court devant
  lui et se resserre : le point de chute est lisible avant l'impact. La
  conséquence est dirigée — fragments en cône orienté par la trajectoire
  d'arrivée et nappe de feu rasante poussée vers l'avant — et non un anneau
  concentrique.
- **Terre → « Marteau de Pierre ».** Une masse unique s'arrache du sol à côté
  du lanceur, monte à 2,3 tuiles, marque une suspension — c'est ce temps mort
  qui donne le poids —, puis s'abat en arc sur la cible et éclate. Amplitude
  verticale portée de 30 à près de 60 px.

Dans les deux cas les fragments sont découpés dans le volume de la masse
(`shatterVolume`) : ils s'y recollent exactement à l'instant de la rupture.

## Passe de matière, et le feu repris

Le rendu restait du low-poly à plat : le maillage visible — chaque face portant
son propre contour —, aucune structure de lumière, des aplats séparés par des
traits. Une passe de matière en espace écran corrige cela pour tout le
catalogue d'un coup : liseré clair interrompu, ombre de contact, contour
sélectif ; contours par face supprimés ; extrêmes de la rampe réservés aux
arêtes.

Le feu demandait autre chose : appliqué à une flamme, ce traitement en fait un
caillou. La passe **émissive** colore la silhouette réunie par son épaisseur,
si bien que des lobes qui se recouvrent fusionnent en une masse au lieu de
rester un empilement d'objets orange. Le sort est devenu une **Boule de Feu** :
les flammes se rassemblent dans la main, la masse part avec une traînée, puis
éclate.

Trois pièges rencontrés en chemin, tous corrigés :

- des **décalques semi-transparents superposés** additionnent leurs alphas —
  quatorze ombres de gravats au même endroit faisaient une flaque noire ;
- une **valeur d'épaisseur globale** ne peut pas servir une mèche de dix pixels
  et une explosion de quarante : la rampe est normalisée par corps ;
- **tramer l'opacité d'un corps émissif** le troue, la mesure d'épaisseur
  s'effondre et l'explosion finit en treillis rouge.

Une référence de pixel art fournie en cours de route a recalé la direction
artistique du feu : quatre valeurs saturées sans aucune sombre, aucun contour,
et une matière **mouchetée** plutôt que des anneaux concentriques. Le réglage
a été conduit à la mesure — on compte la proportion de chaque valeur dans le
corps de la flamme — et non à l'œil : trois tentatives successives donnaient
7 %, 13 % puis 21 % de jaune là où il en fallait environ 55 %.

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

Mesure de forme reproductible : voir `docs/architecture.md`, section sur les
boîtes, pour la raison d'être de `rockLump`.

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

## Passage au pixel art dessiné

Le rendu procédural avait un plafond, et il était mesurable. En comptant les
**inversions de sens** dans les longueurs de marche du contour — la mesure qui
sépare une courbe dessinée, qui n'inverse que là où la forme tourne, d'une
arête projetée, qui oscille — les rendus projetés se tenaient entre 0,57 et
0,82 inversion en excès par comparaison, sur les six sorts et quatre instants
chacun. Aucun réglage de palette, de tramage ou de contraste ne corrige cela :
une arête projetée à un angle quelconque n'a pas de longueur de marche
« voulue » à restituer.

La matière est donc désormais **dessinée** (`src/art/`) et le moteur la place.
Les tampons du feu mesurent 0,00 à 0,11 sur la même échelle.

`fire-ball` est la première recette montée ainsi, et la seule à ce jour. Ce
qu'elle a demandé, au-delà des dessins :

| Défaut constaté | Mesure | Correction |
|---|---|---|
| Intérieur des flammes en confetti | `emissiveEdgeBias` valait 0 et `emissiveTurbulence` 0,92 : la couleur d'un pixel était tirée **entièrement** au bruit, la transformée de distance ne servait à rien | 1,5 / 0,34 : l'épaisseur porte la couleur, la moucheture ne fait que la casser |
| Explosion identique sur les huit caps | 0 % d'écart de silhouette, contre 43 % en vol | Grappe placée dans le repère local et non en pixels, avec l'élan du projectile qui pousse le souffle vers l'avant → 27 % |
| Explosion creuse, en couronne | 22 lambeaux de 95 px ne couvrent que deux tiers d'un disque de 32 px de rayon | Le compte suit l'aire : `R²/17` |
| « Yeux » sombres dans la masse | Les vides entre trois tampons sont vus comme des bords par la transformée de distance, qui y pose un liseré | `fillEnclosed` comble les vides **enclos** de moins de 64 px, avant la transformée |
| Auréole brune derrière la tête et flash de 50 px à l'impact | — | Les deux disques de halo sont supprimés ; la chaleur vient du blanc que la passe émissive met au cœur de la silhouette |
| Traînée qui pendait au lieu de suivre la course | Les décalages étaient composés en unités monde, donc leur direction à l'écran changeait avec la projection | La direction de fuite est lue là où elle est vraie : à l'écran, entre deux points de la trajectoire |

**Cadence.** Toutes les recettes passent à 12 images par seconde, sauf la
foudre qui reste à 30 : elle est bâtie sur des fenêtres plus courtes qu'une
image à 12 i/s, et un arc qui apparaît et disparaît en 20 ms n'existerait pas
à cette cadence. Le cahier des charges autorise explicitement cette exception
(« ne force pas tous les effets à 20 images »).

**Limite assumée.** Les cinq autres recettes sont encore projetées, donc au
plafond de contour mesuré plus haut. Le catalogue est pour l'instant
hétérogène : le feu est dessiné, le reste ne l'est pas.

## Prochaine étape précise

Étendre les tampons aux cinq autres éléments, en commençant par la glace et la
terre : ce sont des matières à arêtes franches, donc celles où le contour
projeté se voyait le plus (0,82 et 0,60 d'inversions en excès). Tant que ce
n'est pas fait, le catalogue reste hétérogène.

Ensuite seulement, écrire les deux recettes manquantes de glace demandées par
le catalogue J3 —
**couronne de cristaux** et **vague de gel qui fracture des plaques** — en
réutilisant `grammar/solid.ts` pour la fracture et `grammar/frost.ts` pour la
prise en glace. Cela exercera la fracture d'une surface existante, qui est la
brique dont dépendra ensuite le combo eau + glace.

Dans la foulée : découper la Lance de Givre en `cast` / `fly` / `hit` /
`residue` pour valider le contrat de clips sur un cas réel, et vérifier la
continuité de phase lors d'un changement de cap.
