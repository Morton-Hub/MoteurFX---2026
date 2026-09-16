# Format d'une recette

Une recette est un objet `SpellRecipe` (`src/sim/types.ts`). Elle décrit une
identité artistique et un contrat temporel, et expose une seule fonction de
rendu.

```ts
export const monSort: SpellRecipe = {
  id: 'element-nom',
  element: 'ice',
  title: 'Nom lisible',
  concept: 'Une phrase qui dit ce que le sort raconte.',
  signature: ['trait de forme 1', 'trait de forme 2', '…'],
  role: 'oneshot',            // cast | fly | hit | residue | oneshot
  duration: 1.5,              // secondes
  fps: 24,                    // cadence conseillée ; le nombre d'images en dérive
  canvas: { width: 336, height: 200 },
  pivot: { x: 165, y: 109 },  // position image de la source, identique pour tous les caps
  defaultRange: 3.3,          // distance source → cible, en tuiles
  defaultPower: 0.3,          // rang dans [0,1]
  radial: false,              // true seulement si l'effet est réellement invariant
  loop: 'none',               // none | seamless
  events: [{ id: 'contact', at: 0.55, note: '…' }],
  sample(t, ctx) { return [/* DrawCmd[] */]; },
};
```

## `sample(t, ctx)`

`t` est normalisé dans `[0, 1]`. La fonction ne doit dépendre d'aucun état
extérieur : même recette, même seed, même `t` ⇒ mêmes pixels.

`ctx` fournit :

| Champ | Rôle |
|---|---|
| `ctx.wl(avant, côté, haut)` | point monde depuis le repère local du sort |
| `ctx.pl(avant, côté, haut)` | le même, directement projeté en pixels |
| `ctx.p(monde)` | projection d'un point monde |
| `ctx.frame` | `origin`, `heading`, `forward`, `side`, `up` |
| `ctx.distance` | portée au sol, en tuiles |
| `ctx.power` | rang dans `[0,1]` |
| `ctx.palette`, `ctx.style` | contrat artistique |
| `ctx.seed` | seed de projet ; les seeds de nœuds en dérivent |

## Commandes de dessin

```ts
type DrawCmd = {
  layer: 'ground' | 'main' | 'light';
  depth: number;                    // croissante vers l'observateur
  shape: Shape;                     // poly | polys | ribbon | line | disc | ellipse | ring
  paint: { color, ramp?, dither?, mode? };
  holes?: Shape[];                  // vides internes retirés du masque
  outline?: { color, dither? };     // liseré par commande
  tag?: string;                     // affichage isolé dans l'atelier
};
```

Le `ramp` est un dégradé **postérisé** le long de l'axe vertical écran : des
bandes franches, pas une interpolation continue. C'est ce qui donne la lecture
16 bits du feu et de l'eau.

Le `dither` est un tramage ordonné local, avec une phase réglable pour que deux
surfaces voisines ne tramènt pas à l'identique. Il est choisi selon la matière,
jamais appliqué globalement.

## Le rang (`power`)

Le rang **change le comportement**, jamais la résolution des pixels ni la durée
de toutes les phases. Un test vérifie que chaque recette consomme réellement ce
paramètre — un réglage visible mais inerte est traité comme un défaut.

| Sort | Effet du rang |
|---|---|
| Lance de Givre | 1, 2 ou 3 lances tirées en séquence, décalées latéralement |
| Arc de Rupture | densité de ramification et nombre de relais au sol |
| Boule de Feu | densité de la charge et largeur de l'explosion |
| Lame Déferlante | 1 à 3 lames successives, plus basses et décalées |
| Marteau de Pierre | 1 à 3 marteaux successifs, échelonnés le long du cap |
| Spirale de Coupe | nombre d'arcs en orbite |

## Grammaires élémentaires

Chaque famille de matière a ses primitives, dans `src/grammar/` :

| Module | Primitives | Utilisé par |
|---|---|---|
| `solid.ts` | prismes, pointes, blocs rocheux irréguliers, découpe d'un volume en fragments, strates, rotation rigide | glace, terre, feu |
| `discharge.ts` | déplacement du point médian, réseaux multi-ancres, branches | électricité |
| `blob.ts` | corps mous harmoniques dans le plan face caméra, vides internes | feu, fumée |
| `frost.ts` | plaques étoilées, aiguilles de croissance | glace |
| `ground.ts` | fractures, plaques, anneaux, résidus | tous |
| `motion.ts` | balistique analytique, cônes orientés, éclats / blocs / gouttes / étincelles / braises, ombres au sol | tous |

Une lance de glace n'emprunte pas les primitives du feu : c'est cette
séparation, et non la palette, qui porte l'identité élémentaire.

## Événements

`cast`, `release`, `contact`, `peak`, `fracture`, `settled`. Ce sont des repères
éditoriaux exportés dans le manifeste, pas une contrainte rigide imposée à tous
les sorts : une recette ne déclare que ceux qui ont un sens pour elle.

**La simulation FX n'arbitre aucun dégât de gameplay.** Un événement de contact
externe peut déclencher l'impact ; les marqueurs sont là pour que le jeu s'y
accroche.

## Flashs très courts

Un flash doit rester visible à cadence réduite. La règle appliquée : une fenêtre
de flash couvre au moins deux à trois images à la cadence déclarée de la
recette. Pour la Lance de Givre, la fenêtre de contact fait 0,075 du clip, soit
environ trois images à 24 Hz sur 1,5 s.

## Fin de clip

Un clip ne doit pas se terminer avec des objets encore visibles. Chaque recette
déclare un `CLIP_OUT` (0,96 par défaut) au-delà duquel plus aucune matière n'est
émise, et les émetteurs de grains rabotent eux-mêmes les durées de vie. Un test
vérifie, pour quatre caps, que la dernière image est **vide**.
