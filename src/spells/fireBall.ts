/**
 * FEU — « Boule de Feu »
 *
 * Le classique, et il y a une raison à ça : le sort raconte une phrase en
 * trois temps que l'œil suit sans effort. Des flammes se rassemblent dans la
 * main — on voit la charge se constituer, elle ne surgit pas. La masse part.
 * Elle éclate.
 *
 * C'est la première recette montée sur des **tampons dessinés**. Le moteur
 * ne fabrique plus la matière du feu en projetant des polygones : il pose des
 * silhouettes dessinées à la main (`src/art/fireStamps.ts`) et garde pour lui
 * ce qu'il sait faire — trajectoire, cap, rythme, profondeur, export. La
 * raison est mesurée : le contour d'une arête projetée oscille presque
 * partout, celui d'un dessin n'inverse que là où la forme tourne vraiment
 * (voir `tests/stamps.test.ts`).
 *
 * Deux conséquences assumées :
 *
 *  - Les tailles sont **discrètes**. La boule passe de 7 à 11 à 15 pixels,
 *    elle ne grandit pas continûment. C'est exactement ce que faisaient les
 *    feuilles de sprites, et à 12 images par seconde l'œil lit une croissance,
 *    pas des paliers.
 *  - Les tampons ne suivent pas `groundScale`. Un sprite ne change pas de
 *    définition quand la caméra recule ; c'est la forme la plus stricte de la
 *    règle « le cadrage ne dimensionne jamais les objets ».
 *
 * Rien ici n'est un solide. Toute la matière qui brûle est déclarée
 * `emissive` : le renderer prend la **silhouette réunie** de tous ces tampons
 * et la colore par son épaisseur — bord sombre, cœur blanc. Deux tampons qui
 * se recouvrent fusionnent en un corps plus épais, donc plus chaud au milieu.
 * C'est ce qui fait qu'un amas de tampons se lit comme une masse et non comme
 * un tas de vignettes, et c'est pourquoi les dessins ne portent aucune couleur.
 */

import { type Vec3, type Vec2, add3, clamp01, easeIn, easeOut, easeOutExpo, ramp, window4 } from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import { type DrawCmd, stampAt } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import { emitDebris } from '../grammar/motion.js';
import { residueAlpha } from '../grammar/ground.js';
import {
  BALL_7,
  BALL_11,
  BALL_15,
  EMBER,
  FLAME_L,
  FLAME_S,
  LUMP_9,
  LUMP_13,
  PUFF_7,
  PUFF_11,
  SPARK,
} from '../art/fireStamps.js';
import type { Stamp } from '../art/stamp.js';
import type { SpellContext, SpellRecipe } from '../sim/types.js';

const DURATION = 1.5;
const CLIP_OUT = 0.96;

const T = {
  /** Les premières flammes apparaissent autour de la main. */
  gather: 0.0,
  /** La masse est constituée et pulse. */
  charged: 0.22,
  release: 0.28,
  contact: 0.56,
  /** L'explosion a fini de s'ouvrir et commence à monter. */
  bloom: 0.68,
  smokeEnd: CLIP_OUT,
} as const;

/** Les trois tailles de masse, du plus petit au plus gros. */
const BALLS = [BALL_7, BALL_11, BALL_15] as const;

/**
 * Choisit le dessin dont le diamètre approche le mieux la taille voulue.
 *
 * Aucune interpolation : on prend un dessin ou un autre. C'est le seul moyen
 * de garder les pixels tels qu'ils ont été posés — redimensionner un tampon
 * d'un facteur non entier rééchantillonne le contour et rend exactement le
 * bruit qu'on cherchait à quitter.
 */
function ballFor(diameter: number): Stamp | null {
  if (diameter < 4) return null;
  let best = BALLS[0] as Stamp;
  let bestErr = Infinity;
  for (const b of BALLS) {
    const err = Math.abs(b.width - diameter);
    if (err < bestErr) {
      bestErr = err;
      best = b;
    }
  }
  return best;
}

/** Pose un tampon qui brûle. La couleur vient de la passe émissive. */
function burn(
  ctx: SpellContext,
  s: Stamp,
  at: Vec2,
  depth: number,
  opts?: { flipX?: boolean; tag?: string },
): DrawCmd {
  return {
    layer: 'main',
    material: 'emissive',
    depth,
    shape: stampAt(s, at, { flipX: opts?.flipX }),
    paint: { color: ctx.palette.ramp[1] ?? ctx.palette.core },
    tag: opts?.tag ?? 'flame',
  };
}

export const fireBall: SpellRecipe = {
  id: 'fire-ball',
  element: 'fire',
  title: 'Boule de Feu',
  concept:
    "Des flammes dessinées se rassemblent dans la main du lanceur jusqu'à former une masse, qui part en laissant derrière elle des lambeaux qui s'éteignent, puis éclate à la cible en s'ouvrant large avant de monter et de se déchirer en langues.",
  signature: [
    'Silhouettes dessinées, jamais de contour reconstruit par projection',
    "Charge visible : les langues convergent et la masse grossit par paliers",
    "Sillage fait de lambeaux lâchés derrière la tête, pas d'un ruban continu",
    "Explosion qui s'ouvre d'abord large et basse, puis monte et se déchire",
  ],
  role: 'oneshot',
  duration: DURATION,
  // Douze images par seconde. La cadence fait autant que le dessin : à 24,
  // chaque image ne diffère que d'un pixel ou deux et l'animation glisse au
  // lieu de claquer. Les feuilles 16 bits tenaient entre 8 et 12.
  fps: 12,
  canvas: { width: 384, height: 272 },
  pivot: { x: 192, y: 163 },
  defaultRange: 3.3,
  defaultPower: 0.3,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.gather, note: 'Les flammes convergent vers la main' },
    { id: 'peak', at: T.charged, note: 'La masse est constituée' },
    { id: 'release', at: T.release, note: 'Départ du projectile' },
    { id: 'contact', at: T.contact, note: 'Explosion à la cible' },
    { id: 'settled', at: T.smokeEnd, note: 'Fumée dissipée' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'fire-ball');
    // Le rang change le comportement, pas la définition : plus de langues
    // convergent à la charge, la masse atteint une taille dessinée de plus,
    // et la boule de feu s'ouvre plus large — donc avec plus de lambeaux,
    // puisque leur nombre suit son aire.
    const wisps = 5 + Math.round(ctx.power * 5);
    const headSize = 11 + ctx.power * 8;

    const hand: Vec3 = ctx.wl(0.34, 0, 0.72);
    const target: Vec3 = ctx.wl(ctx.distance, 0, 0.55);

    // ------------------------------------------------------------------
    // Charge : des langues tournent autour de la main et s'y rabattent.
    // ------------------------------------------------------------------
    const charge = window4(t, T.gather, T.charged, T.release, T.release + 0.03);
    if (charge > 0 && t < T.release + 0.03) {
      for (let i = 0; i < wisps; i++) {
        const at = T.gather + i * 0.022;
        const pull = clamp01(ramp(t, at, T.charged));
        if (pull <= 0) continue;
        // Spirale rentrante : la langue part loin et se rabat sur la main.
        const angle = randRange(seed, i, 601, 0, Math.PI * 2) + pull * 4.2;
        const reach = (0.95 + randRange(seed, i, 602, 0, 0.5)) * (1 - easeIn(pull));
        const lift = randRange(seed, i, 603, -0.35, 0.45) * (1 - pull);
        const centre = add3(hand, {
          x: Math.cos(angle) * reach,
          y: Math.sin(angle) * reach,
          z: lift,
        });
        // Une langue qui s'éteint rétrécit d'un dessin, elle ne se trame pas :
        // trouer une silhouette émissive ferait mesurer l'épaisseur d'un
        // grillage à la passe de couleur.
        const near = charge * (0.4 + 0.6 * pull);
        const s = near > 0.72 ? FLAME_L : near > 0.34 ? FLAME_S : EMBER;
        out.push(burn(ctx, s, ctx.p(centre), depthOf(centre) + 2, { flipX: i % 2 === 1, tag: 'gather' }));
      }
      // Le noyau qui grossit à mesure que les langues arrivent.
      const grown = easeOut(clamp01(ramp(t, T.gather + 0.04, T.charged)));
      const core = ballFor(grown * headSize);
      if (core) out.push(burn(ctx, core, ctx.p(hand), depthOf(hand) + 3, { tag: 'core' }));
    }

    // ------------------------------------------------------------------
    // Vol.
    // ------------------------------------------------------------------
    const flight = clamp01(ramp(t, T.release, T.contact));
    const inFlight = t >= T.release && t < T.contact;
    const posAt = (u: number): Vec3 => {
      const k = clamp01(u);
      // Course tendue, très légèrement cintrée : un projectile, pas un obus.
      const arc = Math.sin(k * Math.PI) * 0.22;
      return {
        x: hand.x + (target.x - hand.x) * k,
        y: hand.y + (target.y - hand.y) * k,
        z: hand.z + (target.z - hand.z) * k + arc,
      };
    };

    if (inFlight) {
      const eased = easeOutExpo(flight) * 0.25 + flight * 0.75;
      const head = posAt(eased);

      // Sillage et tête, posés ensemble en **espace écran**.
      //
      // Une traînée doit partir droit derrière la tête, quel que soit le cap.
      // En composant les décalages en unités monde on obtenait une queue dont
      // la direction changeait avec la projection, et qui sur la plupart des
      // caps pendait vers le bas au lieu de suivre la course. La direction de
      // fuite se lit donc là où elle est vraie : sur l'écran, entre deux
      // points de la trajectoire.
      const hp = ctx.p(head);
      const prev = ctx.p(posAt(eased - 0.06));
      const dx = hp.x - prev.x;
      const dy = hp.y - prev.y;
      const len = Math.hypot(dx, dy);
      // Départ arrêté : tant que la tête n'a pas bougé, aucune direction de
      // fuite n'existe. Une valeur par défaut serait une queue qui pointe au
      // hasard ; on n'en met pas.
      const bx = len > 0.001 ? -dx / len : 0;
      const by = len > 0.001 ? -dy / len : 0;

      const ball = ballFor(headSize) ?? BALL_11;
      out.push(burn(ctx, ball, hp, depthOf(head) + 4, { tag: 'head' }));

      // Les lambeaux se suivent tous les cinq pixels : assez près pour que la
      // passe émissive les soude en une queue continue, assez espacés pour
      // qu'elle s'affine visiblement. Les derniers se détachent en braises.
      if (len > 0.001) {
        const TAIL: readonly (readonly [Stamp, number])[] = [
          [LUMP_9, 5],
          [PUFF_7, 10],
          [PUFF_7, 15],
          [EMBER, 20],
          [EMBER, 25],
          [SPARK, 30],
          [SPARK, 36],
        ];
        for (let k = 0; k < TAIL.length; k++) {
          const [s, d] = TAIL[k] as readonly [Stamp, number];
          // La queue s'allonge avec la vitesse : au départ elle est courte,
          // en pleine course elle file.
          const reach = d * (0.45 + 0.55 * flight);
          // Elle ondule légèrement, sinon c'est un trait.
          const wag = Math.sin(t * 30 + k * 1.1) * (k * 0.35);
          out.push(
            burn(
              ctx,
              s,
              {
                x: hp.x + Math.round(bx * reach - by * wag),
                y: hp.y + Math.round(by * reach + bx * wag),
              },
              depthOf(head) + 3.5 - k * 0.01,
              { flipX: k % 2 === 1, tag: 'trail' },
            ),
          );
        }
      }

      // Pas de disque de halo. Un disque tramé posé derrière la tête ne se
      // lit pas comme de la lumière mais comme une auréole sale, et sur fond
      // sombre la couleur de halo vire au brun. Ce qui donne la chaleur ici,
      // c'est le blanc que la passe émissive met au cœur de la silhouette :
      // il est déjà là, et il a la forme de la flamme.

      // Braises lâchées par le sillage.
      out.push(
        ...emitDebris(ctx, {
          seed: seed + 61,
          count: 22,
          clipTime: t - T.release,
          startedAt: T.release,
          origin: (i) => posAt(clamp01(eased - randRange(seed, i, 607, 0, 0.25))),
          axis: () => ({ x: 0, y: 0, z: 1 }),
          spread: 1.2,
          speed: [0.5, 1.6],
          gravity: 3.4,
          launch: (i) => randRange(seed, i, 608, 0, T.contact - T.release),
          life: [0.1, 0.24],
          size: [1, 2.2],
          kind: 'ember',
          palette: pal,
          style,
          tone: [0, 0.4],
          tag: 'ember',
        }),
      );
    }

    // ------------------------------------------------------------------
    // Explosion.
    // ------------------------------------------------------------------
    if (t < T.contact) return out;
    const age = t - T.contact;
    const impact = ctx.wl(ctx.distance, 0, 0);

    // Sol : brûlure, puis résidu.
    //
    // Une plaque polygonale posée à plat se lisait comme un hexagone sombre —
    // une forme nette là où il faut une tache. La brûlure est donc faite des
    // mêmes dessins que le reste, assombris et tramés : des masses qui se
    // recouvrent n'ont pas de bord franc.
    const scorch = residueAlpha(t, 0.74, 0.99, 0.55) * easeOut(clamp01(age / 0.1));
    if (scorch > 0.02) {
      const ip = ctx.p(impact);
      // Assez de dessins pour que la tache soit continue : à cinq elle se
      // lisait comme une poignée de pastilles sombres posées sous le feu.
      // Aplatie, aussi — une brûlure est vue au ras du sol.
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 * 3 + randRange(seed, i, 641, -0.5, 0.5);
        const r = i === 0 ? 0 : 5 + randRange(seed, i, 642, 0, 16);
        out.push({
          layer: 'ground',
          material: 'soft',
          depth: depthOf(impact) - 4 - i * 0.01,
          shape: stampAt(i % 3 === 0 ? LUMP_13 : LUMP_9, {
            x: ip.x + Math.round(Math.cos(a) * r),
            y: ip.y + Math.round(Math.sin(a) * r * 0.42),
          }, { flipX: i % 2 === 1 }),
          paint: { color: fade(pal.rim, scorch * 0.34), dither: { level: 0.45, matrix: 4 } },
          tag: 'decal',
        });
      }
    }

    // Le corps de l'explosion.
    //
    // Aucun dessin ne fait la taille d'une explosion, et agrandir un tampon
    // d'un facteur 2 donnerait des pixels deux fois plus gros que le reste du
    // sprite — le défaut le plus visible qu'on puisse commettre en pixel art.
    // La masse est donc **composée** d'une grappe de dessins à taille
    // normale, que la passe émissive réunit en un seul corps.
    //
    // Ce qui décide de tout ici, c'est la distance entre deux dessins
    // voisins : trop loin, la grappe se lit comme une rangée de bougies ;
    // assez près, elle devient une masse. On raisonne donc en **pixels**
    // — mais on place en **monde**, dans le repère local du sort.
    //
    // Une première version posait les lambeaux directement en pixels autour
    // de l'impact. Mesuré : la silhouette de l'explosion était identique au
    // pixel près sur les huit caps, alors que le vol variait de 43 %. Un
    // souffle est bien symétrique, mais il emporte l'élan du projectile —
    // il doit s'ouvrir vers l'avant. Le repère local porte ce cap, donc on y
    // place, et la conversion ci-dessous garde le contrôle du recouvrement.
    const open = easeOut(clamp01(age / 0.13));
    const rise = clamp01(ramp(t, T.bloom - 0.06, 0.86));
    const fadeOut = 1 - ramp(t, 0.8, 0.92);
    if (fadeOut > 0) {
      const alive = fadeOut * (1 - ramp(rise, 0.72, 1));
      const ip = ctx.p(impact);
      // Combien de pixels vaut une unité monde, ici, dans ce cadrage : mesuré
      // sur le repère local plutôt que supposé, pour rester juste si la
      // projection change.
      const oF = ctx.pl(ctx.distance + 1, 0, 0);
      const oS = ctx.pl(ctx.distance, 1, 0);
      const oU = ctx.pl(ctx.distance, 0, 1);
      // Deux échelles, pas une : dans cette projection la hauteur n'a pas le
      // même nombre de pixels par unité que le sol. Convertir la verticale
      // avec l'échelle du sol étirait la grappe et la creusait — elle se
      // lisait comme un anneau de flammes avec un trou au milieu.
      const pxFlat = Math.max(2, Math.hypot(oF.x - ip.x, oS.x - ip.x));
      const pxUp = Math.max(2, Math.abs(oU.y - ip.y));
      // Rayon écran de la boule de feu, en pixels, ramené en unités monde.
      const R = open * (26 + ctx.power * 10) * (1 + rise * 0.35);
      const rw = R / pxFlat;
      // L'élan du projectile pousse le souffle vers l'avant : c'est ce qui
      // rend l'explosion différente d'un cap à l'autre.
      const push = 0.35 * open;
      // Assez de lambeaux pour couvrir la masse sans trou.
      //
      // Le compte se calcule, il ne se devine pas : l'aire à couvrir vaut
      // πR², un dessin en couvre une centaine de pixels, et des tirages
      // aléatoires se recouvrent — il en faut donc bien plus que le quotient.
      // Réglé à πR²/46, l'explosion se creusait en couronne à mi-parcours,
      // parce que 22 lambeaux de 95 pixels ne couvrent que les deux tiers
      // d'un disque de 32 pixels de rayon.
      const lobes = Math.max(14, Math.round((R * R) / 17));
      for (let i = 0; i < lobes; i++) {
        if (alive <= 0.12) break;
        const a = randRange(seed, i, 611, 0, Math.PI * 2);
        // Racine carrée : sans elle les tirages s'entassent au centre et le
        // bord reste clairsemé.
        const rad = rw * Math.sqrt(randRange(seed, i, 612, 0.02, 1));
        const lobeSeedZ = randRange(seed, i, 613, 0.1, 0.75);
        // Bas et large à l'ouverture, haut et resserré ensuite : le souffle
        // passe, la colonne monte.
        // Épaisseur verticale du même ordre que le rayon : une grappe plate
        // se lit comme une flaque, une grappe trop haute comme une colonne.
        const liftPx = 5 + lobeSeedZ * 7 + rise * (16 + lobeSeedZ * 20);
        const lift = liftPx / pxUp;
        const w = ctx.pl(
          ctx.distance + push + Math.cos(a) * rad,
          Math.sin(a) * rad,
          lift,
        );
        const at: Vec2 = { x: Math.round(w.x), y: Math.round(w.y) };
        // En montant, la colonne se déchire : les masses cèdent la place aux
        // langues, puis aux braises. Les tailles alternent — des dessins
        // identiques posés en cercle se liraient comme un motif.
        const big = randRange(seed, i, 631, 0, 1) > 0.45;
        const s =
          alive < 0.3
            ? EMBER
            : rise > 0.45
              ? (big ? FLAME_L : FLAME_S)
              : big
                ? LUMP_13
                : LUMP_9;
        out.push(
          burn(ctx, s, at, depthOf(impact) + 2 + i * 0.001, {
            flipX: i % 2 === 1,
            tag: 'bloom',
          }),
        );
      }

      // Langues de bord : posées sur le contour de la masse, orientées vers
      // le haut. Elles la touchent, donc la passe émissive les y soude — le
      // contour cesse d'être une patate lisse et se met à lécher. Une langue
      // qui ne touche pas la masse serait une vignette isolée.
      const edgeAlive = fadeOut * (1 - ramp(rise, 0.66, 1));
      if (edgeAlive > 0.12) {
        const edges = 6 + Math.round(ctx.power * 6);
        for (let i = 0; i < edges; i++) {
          const a = (i / edges) * Math.PI * 2 + randRange(seed, i, 621, -0.4, 0.4);
          const rad = rw * randRange(seed, i, 622, 0.7, 1.05);
          const lift = (6 + randRange(seed, i, 623, 0, 10) + rise * 24) / pxUp;
          const w = ctx.pl(
            ctx.distance + push + Math.cos(a) * rad,
            Math.sin(a) * rad,
            lift,
          );
          const at: Vec2 = { x: Math.round(w.x), y: Math.round(w.y) };
          const s =
            edgeAlive <= 0.45
              ? SPARK
              : randRange(seed, i, 632, 0, 1) > 0.6
                ? FLAME_L
                : FLAME_S;
          out.push(
            burn(ctx, s, at, depthOf(impact) + 2.5 + i * 0.001, {
              // Une langue penche du côté où elle part : le miroir suffit, on
              // ne fait jamais tourner un dessin.
              flipX: Math.cos(a) < 0,
              tag: 'tongue',
            }),
          );
        }
      }

      // Cœur : il tient bas, au centre, et garde l'épaisseur qui donne le
      // blanc. Sans lui la grappe se creuse au milieu quand les lambeaux
      // partent vers le bord.
      const coreLife = window4(t, T.contact, T.contact + 0.03, T.contact + 0.16, T.bloom + 0.08);
      if (coreLife > 0.15) {
        for (let i = 0; i < 3; i++) {
          const w = ctx.pl(
            ctx.distance + push * 0.6 + randRange(seed, i, 651, -0.25, 0.25),
            randRange(seed, i, 653, -0.25, 0.25),
            (8 + rise * 12 + randRange(seed, i, 652, 0, 5)) / pxUp,
          );
          const at: Vec2 = { x: Math.round(w.x), y: Math.round(w.y) };
          out.push(
            burn(ctx, coreLife > 0.6 ? LUMP_13 : LUMP_9, at, depthOf(impact) + 3 + i * 0.001, {
              flipX: i === 1,
              tag: 'bloom',
            }),
          );
        }
      }
    }

    // Pas de flash blanc non plus : le cahier des charges le refuse comme
    // réflexe, et un disque de cinquante pixels de large posé sur l'impact
    // effaçait justement le dessin qu'on venait de gagner. Le coup se lit à
    // l'ouverture de la masse, qui passe de rien à cent pixels en une image.

    // Braises projetées puis fumée.
    out.push(
      ...emitDebris(ctx, {
        seed: seed + 71,
        count: 40,
        clipTime: age,
        startedAt: T.contact,
        origin: () => add3(impact, { x: 0, y: 0, z: 0.3 }),
        axis: () => ({ x: 0, y: 0, z: 1 }),
        spread: 1.15,
        speed: [1.5, 3.8],
        gravity: 4.5,
        launch: (i) => randRange(seed, i, 615, 0, 0.06),
        life: [0.2, 0.44],
        size: [1, 2.5],
        kind: 'ember',
        palette: pal,
        style,
        tone: [0, 0.4],
        tag: 'ember',
      }),
    );

    // Fumée : les mêmes bouffées dessinées, en gris et non émissives. Un
    // polygone projeté donnait ici un caillou gris à bord net — le défaut
    // exact qu'on venait de quitter, et le plus visible parce que c'est la
    // dernière chose que l'œil voit avant la fin du clip.
    for (let i = 0; i < 7; i++) {
      const at = T.contact + 0.18 + i * 0.04;
      const life = Math.min(0.42, CLIP_OUT - at);
      const smokeAge = t - at;
      if (smokeAge < 0 || smokeAge > life) continue;
      const k = clamp01(smokeAge / life);
      const centre = add3(impact, {
        x: randRange(seed, i, 616, -0.5, 0.5) * (0.4 + k),
        y: randRange(seed, i, 617, -0.5, 0.5) * (0.4 + k),
        z: 0.8 + 1.7 * easeOut(k),
      });
      // Elle se dissipe en rapetissant d'un dessin, jamais en se trouant.
      const s = k < 0.45 ? PUFF_11 : k < 0.8 ? PUFF_7 : EMBER;
      out.push({
        layer: 'main',
        material: 'soft',
        depth: depthOf(centre) - 2,
        shape: stampAt(s, ctx.p(centre), { flipX: i % 2 === 1 }),
        paint: {
          color: fade(pal.debris, (1 - k * 0.5) * 0.6 * (1 - ramp(t, CLIP_OUT - 0.1, CLIP_OUT))),
          dither: { level: 0.7 - k * 0.35, matrix: 4 },
        },
        tag: 'smoke',
      });
    }

    return out;
  },
};
