/**
 * Replie le build Vite en pages autonomes.
 *
 *  dist/atelier.html   page complète, ouvrable par un serveur statique.
 *  dist/artifact.html  fragment sans <html>/<head>/<body>, pour une
 *                      publication ou l'hote fournit ce squelette.
 *
 * Dans les deux cas le script et la feuille de style sont inseres dans le
 * document : aucune ressource annexe a heberger. La police reste chargee par
 * lien, c'est la seule dépendance externe.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const htmlPath = join(dist, 'index.html');
if (!existsSync(htmlPath)) {
  throw new Error("dist/index.html absent : lancer `npm run build:web` d'abord");
}

const js = readFileSync(join(dist, 'app.js'), 'utf8');
const cssPath = join(dist, 'app.css');
let css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';

// Le @import de police est extrait : dans une balise <style> il doit rester en
// tête, et un <link> est de toute facon plus sur.
// Vite minifie `@import url("x");` en `@import"x";` : les deux formes doivent
// etre reconnues.
const FONT_IMPORT = /@import\s*(?:url\()?\s*(['"])(https:\/\/fonts\.googleapis\.com[^'"]+)\1\s*\)?\s*;?/;
const fontMatch = css.match(FONT_IMPORT);
const fontHref = fontMatch ? fontMatch[2] : null;
if (fontMatch) css = css.replace(FONT_IMPORT, '');

const fontLink = fontHref
  ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${fontHref}">`
  : '';

const title = 'MoteurFX 2026';
const head = `${fontLink}\n<style>\n${css}\n</style>`;
const body = `<div id="root"></div>\n<script type="module">\n${js}\n</script>`;

writeFileSync(
  join(dist, 'atelier.html'),
  `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n<title>${title}</title>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`,
);

writeFileSync(
  join(dist, 'artifact.html'),
  `<title>${title}</title>\n${head}\n${body}\n`,
);

const size = (p) => (readFileSync(join(dist, p), 'utf8').length / 1024).toFixed(0);
process.stdout.write(
  `pages autonomes : dist/atelier.html (${size('atelier.html')} Ko), dist/artifact.html (${size('artifact.html')} Ko)\n`,
);
