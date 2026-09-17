# Pipeline pixel art — plan de construction

Document de travail. Il décrit la reprise complète du moteur sur un pipeline
pixel art dessiné, dont la Boule de Feu est le prototype validé.

---

## 1. Le principe, en une phrase

**Le moteur ne fabrique plus de matière. Il compose des dessins.**

| Dessiné | Calculé |
|---|---|
| la silhouette | où, quand, combien |
| l'ombrage | l'ordre de profondeur |
| l'identité de l'élément | la trajectoire et le cap |
| | le rythme, les fenêtres, les événements |
| | le déterminisme, le cadrage, l'export |

Ce partage n'est pas une préférence : il vient d'une mesure. En comptant les
inversions de sens dans les longueurs de marche du contour, les rendus
projetés se tiennent entre 0,57 et 0,82 inversion en excès par comparaison,
les dessins entre 0,00 et 0,11. Une arête projetée à un angle quelconque n'a
aucune longueur de marche « voulue » à restituer ; aucun post-traitement ne
peut la reconstruire.

**Corollaire à retenir pendant tout le chantier :** les dessins sont un
**vocabulaire**, pas des images d'animation. Dessiner les images une par une
donnerait 18 images × 5 orientations × 6 sorts ≈ 540 dessins. C'est la
composition qui anime — c'est ce que la Boule de Feu démontre avec neuf
dessins.

---

## 2. Extension du format de tampon

Aujourd'hui un tampon ne porte qu'une silhouette (`0` vide, `1` matière). Le
feu s'en contente parce que la passe émissive le colore. Un rocher, un éclat
de glace ou une lame d'eau ne rayonnent pas : leur ombrage doit être
**dessiné**.

### Valeurs

| Caractère | Valeur | Couleur |
|---|---|---|
| `.` ou espace | 0 | vide |
| `1` `2` `3` `4` | 1–4 | `palette.ramp[0..3]`, du plus clair au plus sombre |
| `5` | 5 | `palette.core` — point de lumière |
| `6` | 6 | `palette.rim` — liseré sombre dessiné |
| `#` | 1 | alias de `1`, pour les tampons de pure silhouette |

Les quatre niveaux correspondent aux rampes déjà en place dans
`style/palette.ts`. Conséquence utile : **un même dessin sert plusieurs
éléments** — un éclat trapu passé dans la rampe de la terre donne un rocher,
dans celle de la glace un bloc de givre. Le dessin porte la forme, la palette
porte la matière.

Rétrocompatible : les tampons du feu n'utilisent que `#`.

### Matières

Trois matières, trois domaines nets :

| `DrawCmd.material` | Ce que le renderer fait | Pour quoi |
|---|---|---|
| `emissive` | ignore les valeurs, colore la **silhouette réunie** par son épaisseur | feu, plasma, foudre |
| `painted` *(nouveau)* | peint chaque pixel à sa valeur dessinée, sans aucune passe de lumière | roche, glace, métal, eau |
| `soft` | aplat + tramage, valeurs ignorées | fumée, ombres, brûlures |

`painted` n'a **pas** de passe de lumière, et c'est volontaire : la caméra est
fixe et la lumière aussi, donc l'ombrage juste est celui que le dessinateur a
posé. Rallumer un sprite déjà ombré ne peut que le salir.

---

## 3. Deux types que le socle n'a pas encore

### `DirectionalStamp` — un objet qui a un axe

Une lance de givre ou un marteau de pierre pointent quelque part. Il leur faut
une orientation par cap — mais **cinq dessins suffisent pour huit caps**, les
caps θ et π/2 − θ étant exactement symétriques à l'écran dans cette
projection. `mirrorPairs()` encode déjà cette preuve ; il manque le type qui
s'en sert.

```
DirectionalStamp = { orientations: readonly Stamp[] }   // 5 dessins
pick(heading) -> { stamp, flipX }
```

Test associé : les huit caps se résolvent, et chaque paire miroir est un
miroir exact.

### `StampStrip` — quelques images clés

Un balancement de marteau, un battement de flamme : 3 à 5 dessins joués sur
une fenêtre de temps. Échantillonné analytiquement comme le reste, donc le
défilement reste identique à la lecture.

---

## 4. Ce que le socle garde, ce qu'il perd

**Garde** — projection, tri de profondeur, caps, trajectoires, fenêtres de
temps, seeds déterministes, limites de capture en prépasse, export PNG/GIF/
atlas/manifeste, atelier web, toute la suite de tests. Plus `applyEmissive` et
`fillEnclosed`, qui servent la matière rayonnante.

**Perd** — tout ce qui fabriquait de la géométrie pour la regarder :

| Module | Sort |
|---|---|
| `grammar/solid.ts` (rockLump, shatterVolume, prism, spike, stratify) | supprimé — 435 lignes |
| `grammar/blob.ts` (blobPolygon) | supprimé |
| `render/material.ts` : liseré clair, ombrage par facettes, contour sélectif | supprimé — ne s'applique qu'à des polygones projetés |
| `grammar/motion.ts` (emitDebris) | réécrit : émet des tampons, pas des micro-polygones |
| `grammar/ground.ts` | réécrit : ombres et brûlures en tampons tramés |
| `grammar/frost.ts`, `discharge.ts` | à trancher au stade concerné |

C'est une **simplification nette** : environ 900 lignes de géométrie
procédurale disparaissent, remplacées par des dessins et du placement.

---

## 5. Le vocabulaire de formes, par élément

C'est le gros du travail, et c'est là que se joue l'exigence d'identité en
silhouette. Chaque élément a une **langue de formes** dont on ne sort pas :

| Élément | Langue | Interdit |
|---|---|---|
| Feu | gouttes, pointes vers le haut, contours lisses | angles droits |
| Glace | éclats à arêtes **droites**, angles francs | toute courbe |
| Terre | blocs trapus, contours anguleux et irréguliers | symétrie, rondeur |
| Eau | nappes courbes, crêtes en volute, masses larges | pointes sèches |
| Vent | croissants fins et **ouverts** | masse pleine |
| Foudre | zigzags, branches, angles vifs | masse, courbe |

Compte visé par élément : **10 à 14 tampons** — trois tailles de masse, deux
ou trois accents, deux tailles de débris, une ou deux marques au sol, plus les
orientations là où l'objet a un axe. Total du chantier : **70 à 85 dessins**.

C'est le chemin critique. Le socle, lui, est de l'ordre de deux ou trois
séances.

---

## 6. Étapes, chacune livrable seule

| Étape | Contenu | Fin quand |
|---|---|---|
| **1. Socle** | valeurs 1–6, matière `painted`, `DirectionalStamp`, `StampStrip`, outil PNG ↔ ASCII, tests | le feu est migré au nouveau format **sans changer d'aspect** |
| **2. Glace** | premier élément `painted`, et le pire cas du contour projeté (0,82) | une lance de givre dessinée, 8 caps, 12 i/s |
| **3. Terre** | masses trapues, éclats, marteau directionnel | idem |
| **4. Eau + Vent** | nappes courbes / croissants ouverts | idem |
| **5. Foudre** | **à trancher** — voir les risques | idem |
| **6. Nettoyage** | suppression de la grammaire projetée morte, docs, planche de silhouettes, test de reconnaissance | plus aucune recette ne projette de polygone |

L'ordre n'est pas arbitraire : la glace vient en premier parce que ses arêtes
droites sont exactement ce que la projection ratait le plus. Si le pixel art
tient là, il tient partout.

---

## 7. Tests à ajouter

Les six tests de tampons existants restent. S'ajoutent :

- **Valeurs légales** : aucune valeur dessinée ne sort de la rampe de sa palette.
- **Intégrité du placement** : aucune échelle non entière n'atteint jamais le
  rastériseur (la garantie de tout le pipeline tient à ça).
- **Jeux directionnels** : les huit caps se résolvent, les paires miroir sont
  des miroirs exacts.
- **Distinguabilité des silhouettes** — le plus intéressant. Le cahier des
  charges demande une identité reconnaissable ; c'était jusqu'ici un jugement
  subjectif. On peut le mesurer : recouvrement (IoU) deux à deux entre les
  silhouettes des six éléments, recadrées sur leur boîte, à plusieurs
  instants. Un seuil transforme « ça se ressemble » en fait vérifiable. La
  planche actuelle donne déjà l'eau et le feu comme les deux plus proches.

---

## 8. Risques, et ce que j'en dis

1. **Le volume de dessin est le chemin critique**, pas le code. 70 à 85
   dessins, et le feu a demandé plusieurs passes pour neuf. À planifier comme
   du travail d'atelier, pas comme une tâche d'ingénierie.

2. **L'ASCII atteint sa limite vers 16 × 16.** Une silhouette simple s'y lit
   très bien. Un rocher de 24 × 32 avec quatre valeurs d'ombrage devient
   illisible et pénible à retoucher. D'où l'outil PNG ↔ ASCII de l'étape 1 —
   c'est la question ouverte ci-dessous.

3. **La foudre ne gagnera peut-être rien.** Un éclair *est* une polyligne ;
   c'est le seul cas où la géométrie procédurale décrit la forme réelle plutôt
   que de l'approcher. Proposition : garder l'arc procédural, ne dessiner que
   ses extrémités et ses ramifications. À trancher à l'étape 5, sur mesure, pas
   avant.

4. **Un sprite dessiné ne suit pas `groundScale`.** C'est correct — un sprite
   ne change pas de définition quand la caméra recule — mais cela veut dire que
   si le jeu a plusieurs niveaux de zoom, il faut plusieurs jeux dessinés. À
   savoir avant de dessiner, pas après.

5. **Le catalogue sera hétérogène pendant tout le chantier.** Le feu est
   dessiné, le reste projeté. Chaque étape réduit l'écart ; il faut l'accepter
   entre-temps plutôt que de tout garder en chantier ouvert.

---

## 9. Décisions à confirmer

1. **Qui dessine, et dans quoi ?** ASCII dans le dépôt, ou PNG faits dans un
   éditeur pixel et importés ? C'est la décision qui structure toute la moitié
   outillage du plan.
2. **La foudre** : tout dessiné, ou arc procédural + extrémités dessinées ?
3. **Niveaux de zoom** : un seul jeu de dessins, ou plusieurs ?
