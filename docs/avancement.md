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

## Refonte FX

Les neuf sorts ont été remis en scène sur la structure anticipation → climax →
dissipation, avec un système de particules déterministe et un vocabulaire
propre à chaque élément. Quatre corrections sont venues de mesures, pas de
préférences :

| Symptôme | Cause mesurée | Correction |
|---|---|---|
| Pétales d'onde qui se lisaient comme des feuilles découpées | Peints à plat, sans structure de valeur | Ombrage par épaisseur : pointe saturée, racine claire |
| Matière réduite en damier sous la fumée et le givre | Une matière tramée posée **par-dessus** laisse un pixel sur deux du dessous | Le bord tramé ne se pose que sur du vide ; le cœur reste plein |
| Objets découpés par les décalques au sol | Le tri par profondeur ne peut pas exprimer « toujours sous ce qui se tient dessus » | Deux plans de peinture : sol, puis scène — 65 pixels isolés ramenés à 29 |
| Sprites qui débordaient du canevas | Les gerbes portent plus loin que les masses | Scènes de capture agrandies, portée des gerbes plafonnée, zéro débordement sur 16 caps |

## Passe « plus de feuilles »

Après relecture, la première refonte gardait des formes végétales : les novas
posaient des polygones **couchés au sol**, et l'éclatement du feu s'ouvrait en
trois lobes symétriques autour d'un cœur. À cette taille, les deux se lisent
comme une fleur ou une feuille découpée, jamais comme de la matière. Cette
passe les remplace par des volumes debout et supprime le code fautif.

| Ancienne forme | Pourquoi elle échouait | Nouvelle forme |
|---|---|---|
| `groundPetals`, `groundSpikes` — couronnes de polygones à plat | Un polygone couché n'a pas d'épaisseur à ombrer : il se lit comme du papier posé sur le décor, à l'identique dans les huit caps | Couronnes de volumes **debout** : langues de flamme (feu), prismes (glace), chacune à sa propre profondeur |
| `openLobes` — trois pétales symétriques autour d'un cœur | Trois lobes de longueur voisine forment une fleur, ou un papillon de trois quarts | Gerbe montante (`flameBody`) : verticale, asymétrique, langues de hauteurs inégales |
| « Pétale de braise » (nom et paramètres du rang S) | Le vocabulaire floral décrivait encore l'ancienne forme | « Poing de braise » ; `tongues` remplace `petals` |

Les trois fonctions ont été **retirées**, pas seulement débranchées : le
fichier garde à leur place une note expliquant pourquoi, pour qu'elles ne
reviennent pas.

La foudre, elle, n'avait pas de problème de feuille mais manquait de poids :
elle se lisait comme un gribouillis fin posé au sol. Deux effets l'ont
corrigée, tous deux construits dans le monde puis projetés, donc différents
selon le cap :

- `boltFlash` — l'**étoile brisée** du contact : des dards droits, d'inégale
  longueur, partant tous du point de frappe, qui s'ouvrent puis se rétractent
  en trois images. L'irrégularité des longueurs est ce qui l'empêche de
  redevenir une fleur ;
- `boltColumn` — la **décharge de retour** : le canal vertical tenu une image
  après le contact, qui s'éteint par le haut. C'est lui qui donne sa hauteur à
  une frappe vue de trois quarts.

Les canaux principaux ont aussi été épaissis au moment de la connexion.

## Passe « moins géométrique »

Les formes en feuille parties, un défaut plus discret restait : les flammes se
lisaient comme des **cônes**. La cause était dans la construction, pas dans le
tramage — chaque masse était un ruban à largeur monotone et symétrique autour
de sa ligne médiane. Une telle loi de largeur ne peut produire qu'un tronc de
cône ou un fuseau, quelle que soit la palette posée dessus.

| Cause | Correction |
|---|---|
| Ruban symétrique : même largeur à gauche et à droite | Les deux bords sont donnés séparément. Une flamme gonfle d'un côté pendant qu'elle rentre de l'autre |
| Largeur strictement décroissante | Trois sinusoïdes de fréquences non entières entre elles, à phases tirées du germe : le bord avance et recule trois ou quatre fois sur la hauteur, avec un décalage vers le dehors pour que le battement gonfle plus qu'il ne creuse |
| Six échantillons sur toute la hauteur | Seize pour le fût, douze par langue — en dessous, les segments sont si longs que le contour ne peut pas onduler |
| Masse basse en ellipse exacte | Contour irrégulier, qui gonfle et rentre — l'ellipse donnait la « boule ronde uniformément orange » que le style refuse |
| Langue à décroissance régulière | Épaisseur tenue longtemps puis fermeture brusque. La décroissance régulière donnait des bois de cerf, pas une flamme |
| Pied de colonne posé sur rien | Évasement au contact du sol : la matière s'étale avant de monter |

Le fût serpente aussi, par deux vagues lentes déphasées plutôt que par un
bruit par échantillon : une colonne de feu se tord, elle ne grésille pas.

**Ce que cette passe n'a pas obtenu.** J'ai tenté d'ajouter un test qui mesure
le caractère du contour — le nombre d'inversions de sens des bords gauche et
droit, une valeur basse pour un cône, haute pour une masse dessinée. Mesurée
sur l'image composée, la valeur est noyée par les braises et les décalques ;
mesurée sur la géométrie isolée, les plages avec et sans bosses se recouvrent
(4 à 7 contre 3 à 5). Le test aurait été vert dans les deux cas : il n'aurait
rien gardé. Il n'a donc pas été retenu, et cette correction-là repose sur la
vérification visuelle seule.

## Contrôles automatiques en place

75 tests, dont ceux qui gardent les promesses du document :

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
- les particules sont analytiques : sauter à une image donne le même état qu'y
  arriver, et ajouter une particule ne déplace pas les autres ;
- aucune image ne se dissout en poussière d'un pixel, ni ne dépasse le nombre
  de formes lisible ;
- un projet portable refuse une clé inconnue et une version future.

## Prochaine action précise

Exécuter l'importeur Unity sur un projet réel avec le pack
`fire-ember-fist-s` en huit caps, vérifier la conversion de repère des pivots
(l'atlas compte les Y depuis le haut, Unity depuis le bas), puis monter la
scène de démonstration qui montre le même sort à plusieurs distances et
plusieurs caps.
