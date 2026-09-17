# Avancement

État au 17 septembre 2026, après la refonte complète du moteur sur le document
directeur MOTORFX2. Ce fichier dit ce qui est fait, ce qui est partiel, et
**quelle est la prochaine action précise**.

## Le dépôt cible

Le document désigne `MOTORFX2` comme projet cible. Le travail a été mené dans
`Morton-Hub/MoteurFX---2026`, sur la branche `claude/refonte-complete-t8xamu`,
qui est le dépôt auquel cette session a accès. Créer un dépôt distinct nommé
`MOTORFX2` et y transférer l'historique reste une opération à décider : rien
dans le code ne dépend du nom du dépôt.

## Jalons

| Jalon | État | Ce qui est fait | Ce qui manque |
|---|---|---|---|
| **J0** Inventaire | fait | Socle conservé : mathématiques, aléatoire déterministe, projection, caps, encodeurs PNG et GIF. Le reste — rendu RGBA direct, temps continu, six sorts sans rang — contredisait le document et a été remplacé. | — |
| **J1** Bible et motifs | fait | Palettes par rôles (douze matières), trente-sept dessins originaux, planches couleur / monochrome / silhouette régénérables. | — |
| **J2** Première tranche | fait | La famille du feu de bout en bout, huit caps, capture et export. La colonne n'est pas un projectile ; le météore a une arrivée du ciel et une masse rocheuse. | — |
| **J3** Noyau hybride | fait | Pixels indexés, motifs par rôles, identifiants stables, événements attribués à une image, retouches signées, scrubbing exact, parité preview / export testée. | — |
| **J4** Neuf recettes, 16 caps | **partiel** | Neuf recettes livrées ; distinction rang par rang et élément par élément mesurée sur silhouettes normalisées ; exports 8 et 16 caps sans débordement. | Le test de reconnaissance à l'aveugle par des participants réels. Aucun taux ne sera annoncé avant. |
| **J5** Atelier | **partiel** | Parcours complet création → modification → sauvegarde → réouverture → export. Crayon, gomme, pipette, historique, verrous, comparaison des caps, pelure d'oignon. | Sélection et déplacement de clusters, remplacement de motif depuis l'interface, import de PNG + JSON externes, édition d'une pose tenue. |
| **J6** Runtime et réactions | **à faire** | Le code d'intégration Unity est écrit (manifeste, pack, lecteur directionnel, assemblage des rôles, importeur). | Exécution réelle dans Unity, scène de démonstration, puis l'eau et les deux premières réactions avec un vrai support géométrique. |
| **J7** Stabilisation | **à faire** | Coût par image mesuré (0,7 à 4,1 ms selon la recette). | Budgets d'export et de mémoire sur gros lots, mesure de l'annulation sous charge, extension aux autres éléments. |

## Ce qui a été corrigé en regardant les pixels

Trois défauts n'étaient pas des questions de goût mais des erreurs de
construction, trouvées en inspectant les rendus :

| Symptôme | Cause mesurée | Correction |
|---|---|---|
| Les lobes d'impact ressemblaient à des ailes plates | La largeur d'un ruban était posée selon une direction fixe, pas perpendiculairement à l'axe de la langue ; et le plan face caméra était anisotrope (22,6 px horizontaux pour 16 verticaux) | Rubans construits en coordonnées de plan avec normale locale, et `cameraPlane` mis à l'échelle pour être isotrope en pixels |
| Les grandes masses de feu devenaient blanches au centre | Le seuil de cœur de l'ombrage émissif était fixe : au-delà d'une certaine épaisseur, toute la masse atteignait le haut de la rampe | Le seuil suit l'épaisseur maximale de la masse (`coreRatio`) |
| La colonne de feu se lisait comme une gerbe de filaments | La masse principale était une ellipse basse : chaque langue portait seule la largeur | Mode `core: 'column'` — un fût continu, les langues au-dessus |
| Le météore était couvert de confettis | Les veines chaudes étaient semées par bruit | Les veines sont des **traits** tracés depuis le centre et coupés par la silhouette |
| Le pilier était identique dans les huit caps | Failles, lobes et semis ne dépendaient pas du cap | Marques au sol, lobes latéraux et semis orientés par le cap ; le test de variation de silhouette par cap le vérifie |

## Contrôles automatiques en place

68 tests, dont ceux qui gardent les promesses du document :

- douze images, douze expositions positives, plages sans trou ni chevauchement ;
- aucune recette ne déborde de son canevas, sur quatre caps ;
- aucune image du milieu n'est vide, et la fin est déclarée ;
- les trois rangs d'une famille diffèrent sur silhouettes **normalisées en
  taille** — un agrandissement ne passe pas ;
- les trois éléments restent distincts à rang égal ;
- la silhouette change avec le cap pour au moins un tiers des images ;
- déterminisme complet et scrubbing équivalent à une lecture séquentielle ;
- parité pixel entre preview et export ;
- une retouche obsolète est signalée et non appliquée ;
- un projet portable refuse une clé inconnue et une version future.

## Prochaine action précise

Exécuter l'importeur Unity sur un projet réel avec le pack
`fire-ember-petal-s` en huit caps, vérifier la conversion de repère des pivots
(l'atlas compte les Y depuis le haut, Unity depuis le bas), puis monter la
scène de démonstration qui montre le même sort à plusieurs distances et
plusieurs caps.
