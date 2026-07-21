# Yaugurú — Catálogo — Project Notes

Sitio de catálogo para la editorial uruguaya Yaugurú. Astro + Tailwind v4,
estático (SSG), sin backend. Este archivo documenta decisiones no obvias y
el estado del trabajo para poder retomarlo en una sesión nueva sin
contexto previo.

Repo: https://github.com/catuy/yauguru (main, público)

## Stack

- Astro 7 (`output: static`, sin adapter — build genera HTML puro)
- Tailwind v4 (`@import "tailwindcss"` + bloque `@theme` en
  `src/styles/global.css`, sin `tailwind.config.js`)
- Sin framework de UI (React/Vue/etc) — todo Astro components + vanilla JS
  en `<script is:inline>`
- Content collections (`src/content/books/*.md`, `src/content/collections/*.md`)
  cargadas vía `glob()` loader — **552 libros**, dato importado de un
  catálogo real (`materiales/catálogo.docx`, no trackeado en git)

## Estructura clave

```
src/
  lib/books.ts              — getBookData(): fetch+shape de todos los libros
                               (slug, colección, notas, etc). Compartido
                               entre index, /libro/[slug] y catalogo.astro.
  components/BookCatalog.astro
                             — TODO el homepage/catálogo grilla vive acá:
                               hero, texto "sobre nosotros", barra de
                               filtros + persiana, grilla de libros, y el
                               modal de detalle de libro. Se usa tanto en
                               index.astro como en libro/[slug].astro con
                               un prop `activeSlug` opcional.
  pages/
    index.astro              — <BookCatalog /> sin activeSlug
    libro/[slug].astro        — getStaticPaths() sobre los 552 libros;
                               <BookCatalog activeSlug={slug} /> — modal
                               abierto de entrada, mismo grid de fondo
    catalogo.astro            — vista alternativa en tabla (no rediseñada
                               en esta sesión, sigue con selects nativos)
  layouts/Layout.astro        — <html>/<head>, incluye <ClientRouter />
                               de astro:transitions (View Transitions API)
  styles/global.css           — @theme (--color-primario, --font-sans) +
                               CSS de animaciones/scrollbar custom
```

## Qué hace el catálogo (UX)

- **Grilla de 552 libros**, renderizada 100% client-side (JS arma
  `#grid.innerHTML` desde un JSON embebido — ver "Por qué la grilla es
  client-side" abajo).
- **Click en un libro** → navega a `/libro/[slug]` (URL real,
  compartible). La tapa hace zoom-in con la View Transitions API nativa
  del navegador (sin JS de animación propio). El resto de la página
  (grilla) queda blureada e `inert` detrás.
- **Cerrar** (×, click afuera, o Esc) → vuelve a `/`. La posición de
  scroll y los filtros aplicados se restauran (sessionStorage). El modal
  se desvanece como una unidad (portada + panel de info juntos, con
  blur+scale) — no es un "zoom out" posicional hacia la tarjeta real de
  la grilla (ver por qué abajo).
- **Barra de filtros**: "Filtros [(N)]" a la izquierda (abre una persiana
  con buscador + 3 columnas de radio buttons: Colección/Género/Año, más
  un scroll custom rojo por columna), cantidad de resultados centrada,
  "Vista: Grilla" / "Orden: ..." a la derecha (ambos son botones que
  cambian de valor al click, no dropdowns). Todo el texto usa el mismo
  cuerpo tipográfico (`text-lg tracking-[0.18px] text-primario`).

## Decisiones no obvias (leer antes de tocar BookCatalog.astro)

Esta sección documenta bugs reales encontrados durante el desarrollo —
si algo de esto se toca sin entender el porqué, es fácil reintroducir el
bug.

### 1. Por qué la grilla es client-side (no SSR)

Para poder filtrar/ordenar 552 libros instantáneamente sin re-navegar,
el grid se arma con JS desde un JSON embebido (`#app-data`), no server-
rendered. Esto tiene una consecuencia importante: en el momento en que
el navegador saca la "foto" de la página para una View Transition, el
grid todavía puede estar vacío (ver punto 4).

### 2. `data-astro-rerun` es obligatorio en el script que arma el grid

Astro evita re-ejecutar un `<script>` si su contenido es idéntico al de
una página ya visitada (para no duplicar trabajo). El script que arma
el grid es **byte-idéntico** en `/` y en cada `/libro/[slug]` (mismos
552 libros siempre) — sin `data-astro-rerun`, Astro lo saltea después
de la primera vez y el grid queda vacío al volver a `/`. Está en
`<script is:inline data-astro-rerun>`.

### 3. `define:vars` rompe atributos custom — por eso todo es `is:inline` + JSON

Al principio se pasaban datos al script con `define:vars`. Astro
**regenera el `<script>` desde cero** cuando ve `define:vars`,
descartando cualquier otro atributo (incluido `data-astro-rerun`). La
solución: nada de `define:vars`; los datos (libros, rotaciones) se
embeben como JSON en un `<script type="application/json" id="app-data">`
separado, y el script real es `is:inline` puro (preserva atributos) que
lee ese JSON en runtime.

### 4. Los scripts `is:inline` son "classic scripts" — comparten scope global

A diferencia de `type="module"`, dos ejecuciones del mismo script
`is:inline` (una en `/`, otra al volver desde `/libro/x`) comparten el
mismo scope global — un segundo `const rotations = ...` tira
`SyntaxError: Identifier already declared` y aborta todo el script
silenciosamente. Por eso el script entero está envuelto en un IIFE
`(function () { ... })();`.

### 5. Por qué el "zoom out" al cerrar no aterriza en la tarjeta real

Se intentó que el modal, al cerrar, se achicara exactamente hacia la
posición de su tarjeta en la grilla (view-transition-name compartido).
**No es posible con la arquitectura actual**: Astro solo re-ejecuta los
scripts de la página nueva (los que arman el grid — ver punto 1) recién
**después** de que el navegador ya capturó la foto "nueva" para la
transición (confirmado instrumentando `document.startViewTransition`).
O sea, la tarjeta objetivo no existe todavía en el DOM en el momento en
que importaría. Arreglarlo de verdad requeriría server-renderizar toda
la grilla (cambio de arquitectura grande). En su lugar: el modal entero
(portada + panel) tiene su propia animación de salida
(`view-transition-name: book-modal-exit`, asignada por JS un instante
antes de navegar — ver `global.css` y el handler de click en los
enlaces "Cerrar").

### 6. Restauración de scroll: doble `requestAnimationFrame`

Al volver de `/libro/[slug]` a `/`, el propio motor de View Transitions
del navegador puede tocar el scroll (alineando el elemento con
`view-transition-name` saliente) **después** de que `astro:page-load`
ya disparó. Un `scrollTo()` llamado directo en ese evento se pisa. Hay
que esperar dos `requestAnimationFrame` antes de restaurar
(`sessionStorage` guarda la posición en `astro:before-preparation`).

### 7. El scrollbar de las columnas de filtro es dibujado a mano

`scrollbar-color`/`::-webkit-scrollbar` **no** fuerza un scrollbar
siempre visible en Safari/macOS (sigue auto-ocultándose). Se optó por
ocultar el scrollbar nativo (`scrollbar-width: none` +
`::-webkit-scrollbar { display: none }`) y dibujar un thumb propio
(`.scroll-track` / `.scroll-thumb`, posicionados por JS en
`setupScrollThumb()`). Detalle importante: la medición inicial del alto
de contenido pasa con el panel todavía `display:none` (mide 0) — por
eso `setFiltersOpen()` vuelve a medir con un `requestAnimationFrame`
cada vez que el panel se abre.

### 8. Verificación con Playwright en este entorno

No hay browser real disponible; se instala Playwright + Chromium vía
`npx playwright install chromium` (queda cacheado en
`~/.npm/_npx/.../node_modules/playwright`) y se symlinkea a
`node_modules/playwright` en el scratchpad para poder importarlo. El
Chromium headless de este entorno **no renderiza scrollbars en
absoluto** (ni nativos ni custom) — no sirve para verificar visualmente
el punto 7, hay que confiar en la lógica + pedirle al usuario que lo
confirme en un navegador real.

`npx astro build` a veces resuelve una versión de Astro distinta (vía
un hash de cache de npx diferente) y tira un error de rolldown
irrelevante — si pasa, usar `node_modules/.bin/astro build` directo.

### 9. `coverImage` es un string plano, no `image()` de Astro

El schema de `books` en `content.config.ts` define `coverImage: z.string().optional()`
(ruta pública tipo `/covers/<slug>.jpg`), **no** `image()` de Astro. Razón: el
grid/lista se arma client-side desde el JSON embebido (ver punto 1) — necesita
una URL de string plana para meter en un `<img src="...">` armado por JS, no un
objeto `ImageMetadata` que requiere el pipeline de Vite/`<Image />`. Las
imágenes en `public/covers/*.jpg` ya vienen pre-optimizadas a mano (ver sección
siguiente) — no dependen del pipeline de assets de Astro para nada.

En `BookCatalog.astro`, tanto la tarjeta de grilla (`card()`) como el modal de
detalle muestran `coverImage` si existe (con `object-contain`, no `object-cover`
— la tapa respeta su proporción real en vez de recortarse) y si no, caen al
placeholder de texto de siempre. La sombra (`.book-shadow` / `.book-shadow-lg`
en `global.css`) simula el canto de páginas de un libro real.

## Cómo agregar tapas nuevas

El editor va subiendo tapas escaneadas a `materiales/<algo con el año>/` (no
trackeado en git, ver `.gitignore`) de a tandas — hasta ahora se procesaron los
lotes con tapas de 2021-2026. Cuando aparezcan lotes nuevos, el flujo que ya se
usó es:

1. **Listar los archivos** de la carpeta nueva (`ls`) — los nombres son
   inconsistentes y crípticos (fragmentos de título, apellido del autor,
   sufijos tipo "-Maquetación 1", mayúsculas sueltas).
2. **Matchear cada imagen a un libro** en `src/content/books/*.md` por
   título/autor/año. Buscar candidatos con `grep` sobre el frontmatter
   (título, autores, año) del `.md`; para los ambiguos o crípticos, **leer la
   imagen con el tool Read** (funciona con imágenes) para ver el texto real de
   la tapa y confirmar. Si el libro no existe todavía en el catálogo (pasó
   varias veces: tapas de libros que el editor todavía no había cargado),
   crear una entrada nueva en la colección que corresponda (mismo criterio de
   numeración que ya usa esa colección — buscar el próximo número libre con
   `ls` sobre el prefijo).
3. **Optimizar cada imagen** con `sips` (viene instalado en macOS, no hace
   falta ninguna librería): `sips -Z 760 --setProperty formatOptions 78 "<origen>" --out "public/covers/<slug>.jpg"`
   — reduce de varios MB a ~80-150KB por tapa, suficiente para el tamaño real
   en pantalla (grilla ~190px, modal ~380px). Detalles que salieron al procesar
   los lotes 2021-2023 (fuentes en `.tif`/`.psd`/`.pdf`, no solo `.jpg`):
   - Muchos originales (tanto `.tif`/`.psd` como varios `.jpg`) vienen en **CMYK**
     de Photoshop/QuarkXPress. `sips` los deja tal cual si no se le pide
     conversión — hay que agregar `-m "/System/Library/ColorSync/Profiles/sRGB Profile.icc"`
     antes de `-s format jpeg` para forzar RGB real (si no, el jpg queda con
     4 components y se ve mal/no renderiza en navegador).
   - Para `.tif`/`.psd`/`.pdf`, `sips` **no** infiere el formato de salida del
     `--out ....jpg` (a diferencia de un `.jpg` de entrada) — hace falta el
     flag explícito `-s format jpeg`, si no guarda el archivo con la extensión
     `.jpg` pero contenido tiff/psd intacto.
   - Comando completo recomendado para cualquier fuente (sirve también para
     `.jpg`/`.jpeg` ya en RGB, no hace daño):
     `sips -m "/System/Library/ColorSync/Profiles/sRGB Profile.icc" -s format jpeg -Z 760 --setProperty formatOptions 78 "<origen>" --out "public/covers/<slug>.jpg"`
   - Algunas tapas son en realidad la **tapa completa** (contratapa + lomo +
     tapa, formato apaisado, ratio ancho/alto > 1.2) en vez de sólo la tapa
     frontal — se detectan por el ratio y por tener marcas de corte de imprenta
     en las esquinas. Hay que recortar sólo el panel de tapa (lado derecho)
     antes de optimizar: convertir a jpg RGB de resolución completa, mirar la
     imagen (el tool Read acepta jpg pero no tif/psd — convertir primero con
     `sips` a un jpg temporal para poder verla), y recortar con Python/PIL
     (`im.crop((left, 0, w, h))`, `left` como % del ancho hasta encontrar el
     lomo) — `sips -c` sólo recorta centrado, no sirve para esto. Verificar
     visualmente el recorte final antes de optimizar a 760px.
4. **Agregar `coverImage: /covers/<slug>.jpg`** al frontmatter del `.md`
   correspondiente (después de `featured:`, ver cualquier libro ya migrado
   como ejemplo).
5. **Reportarle al usuario** qué imágenes no se pudieron matchear o quedaron
   dudosas (con el título/autor que dice la tapa, si se pudo leer) — no forzar
   un match de baja confianza.
6. Verificar con `astro dev --background` + una pasada de Playwright (grid y
   modal, con y sin filtros) antes de dar por terminado.

## Estado actual (revisar con `git status` / `git log`)

Trabajo hecho hasta ahora: grilla/lista unificadas con toggle, rediseño del
modal de detalle (dos paneles full-bleed), punto rojo que sigue al mouse (con
modos hover/cerrar/lápiz), zona de dibujo en la sección "about", footer fijo
que aparece cuando la barra de filtros queda sticky, tapas reales para
~130 libros + 3 libros nuevos (**562 libros** en total, ver "Cómo agregar
tapas nuevas" arriba), y un editor web (Sveltia CMS) para que el editor de
Yaugurú cargue/edite contenido sin tocar markdown — ver sección propia
abajo.

**`main` está pusheado y sincronizado con `origin/main`** (confirmado con
`git rev-list --count origin/main..HEAD` / `HEAD..origin/main`, ambos en 0).
La única excepción: hay un rediseño del cursor-lápiz (la sección "about",
`#cursor-dot`/`.cursor-pencil-icon` en `BookCatalog.astro` y `global.css`)
**sin commitear a propósito** — quedó así varias sesiones porque nunca se
pidió commitearlo, no porque esté roto. Antes de tocar esos dos archivos,
correr `git status`/`git diff` para no perderlo por accidente; si el editor
quiere el commit, es la única tarea suelta de esa sesión.

Libros nuevos agregados con metadata inferida por patrón del lote (colección/
serie/año no confirmados en la tapa misma — sí el título/autor) que conviene
que el editor revise:
- `narrativas--19--tiritantes-de-la-ciudad.md` (Raquel Lubartowski Nogara)
- `todos-los-gallos-estan-despiertos--41--casi-vacio.md` (Viktor Gómez)
- `todos-los-gallos-estan-despiertos--43--la-caida.md` (Pablo Galante
  Martorelli) — la tapa fuente tiene un ratio apaisado inusual (título
  "LA CAÍDA" con letras dispersas por todo el ancho); se dejó sin recortar
  porque el título no es legible si se recorta a sólo un panel — confirmar
  con el editor si es al diseño o un jpg de tapa completa mal exportado.

## Cómo levantar el entorno

```
cd /Users/diego/www/yauguru
astro dev --background     # o node_modules/.bin/astro dev --background
astro dev logs             # ver logs
astro dev stop
npm test                   # vitest — valida admin/config.yml contra el schema real
```

Nota: ~13 archivos de `src/content/books/*.md` fallan el schema
(`authors` vacío) — son preexistentes, no relacionados a este trabajo
(ver TODO en `src/content.config.ts`).

## Editor de catálogo (Sveltia CMS, para el editor de Yaugurú)

`public/admin/index.html` + `public/admin/config.yml` — un editor web para
que el editor de Yaugurú cargue/edite libros y colecciones sin tocar
markdown. Es [Sveltia CMS](https://sveltiacms.app), un CMS git-based que
corre como página estática (se sirve junto con el resto del sitio, sin
build ni servidor propio) y escribe **directo al repo de GitHub vía su
API** — no toca ni lee el filesystem local para nada.

**Esto es clave para retomar sesiones**: como Sveltia lee/escribe contra
`catuy/yauguru` en GitHub y no contra el checkout local, **el estado de
`origin/main` y el del working directory local pueden divergir en
cualquier momento** si el editor guarda algo desde el navegador entre
sesiones. Al arrancar a trabajar acá, conviene `git fetch` +
revisar `git log --oneline HEAD..origin/main` antes de asumir que el
local está al día — si hay commits nuevos (mensaje
`Update {colección} {entrada}`, el formato que define `config.yml` en
`settings.commit`), son ediciones reales hechas desde el CMS y hay que
traerlas con `git pull` antes de seguir.

Detalles de la config:

- **Login: "Sign In Using Access Token"** — el editor genera un Personal
  Access Token en GitHub (botón de la propia UI de login da el link con
  los scopes ya seleccionados) y lo pega ahí. Se guarda en el
  `localStorage` del navegador. **No hace falta GitHub App, OAuth App, ni
  ningún worker/proxy** — se evaluó y se descartó Pages CMS explícitamente
  por esto (su modo self-hosted pedía crear una GitHub App con private
  key/webhook secret, y el modo hosteado dependía de un tercero — ninguno
  de los dos hacía falta).
- El content type de nivel superior para colecciones editoriales se llama
  `editorial-collections` en `config.yml`, **no** `collections` — si se
  renombra de vuelta a `collections` se reintroduce una colisión de
  nombre con el campo `collections` (la referencia) dentro de `books`, que
  hacía que Sveltia mezclara campos de libros en el formulario de
  colecciones. Hay un test de regresión para esto en
  `src/test/cms-config.test.ts`.
- **Campos de `books` en el CMS = exactamente los que usa el sitio**, ni
  uno más: `title`, `collections`, `series`, `year`, `authors`, `genre`,
  `notes`, `coverImage`. Se sacaron `translators`/`illustrators`/
  `coEdition`/`awards` (se migraron los ~65 archivos que tenían datos a un
  solo campo `notes` de texto libre — antes esos 4 campos sólo alimentaban
  una línea "Notas" armada a mano en `books.ts`) y `featured`/
  `purchaseLink`/`body` (cero uso real en el sitio, confirmado con grep
  antes de tocar nada). `notes` es `widget: text` (multi-línea,
  `white-space: pre-line` en el sitio) para que los saltos de línea se
  respeten.
- **Campos de `editorial-collections` = solo `name` y `order`** —
  `description`/`coverImage`/`body` no se leen en ningún lado de
  `books.ts`, así que se sacaron del CMS. 4 archivos (`boca-a-boca`,
  `clu-de-yauguru`, `urgente`, `yauguru`) todavía tienen `description`
  cargada en el frontmatter — es un dato dormido a propósito (decisión
  explícita del editor de no borrarlo), no editable desde el CMS.
- Sin preview template custom para ninguna de las dos colecciones —se
  probó uno para libros (tapa a la izquierda, texto rojo a la derecha,
  imitando la ficha real del sitio) pero se sacó porque desentonaba con el
  tema oscuro del editor de Sveltia; el preview default alcanza.
- `config.yml` se valida en cada sesión contra el JSON schema real de
  Sveltia (`https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json`) y
  hay tests en `src/test/cms-config.test.ts` (`npm test`, usa `js-yaml`)
  que lo parsean de verdad y fallan si se desincroniza del schema de
  Astro (`src/content.config.ts`) o si vuelve a aparecer un campo muerto.
- Detalle de dev local: `astro dev` no resuelve `/admin/` (sin el
  `index.html` explícito) porque el dev server de Astro no hace
  directory-index sobre `public/` — entrar a `/admin/index.html` a mano.
  En producción (GitHub Pages o cualquier host estático real) `/admin/`
  funciona normal.
- Filenames: los libros existentes siguen su convención
  `{colección}--{número}--{slug}` sin cambios (Sveltia edita por path, no
  la toca, aunque sí reformatea las listas YAML a `  - item` indentado en
  vez de `- item`, cosmético); libros *nuevos* creados desde la UI usan un
  slug más simple basado solo en el título.

## Próximos pasos posibles (no pedidos aún, solo ideas si preguntan)

- Confirmar con el editor la colección/serie/año de los 3 libros nuevos
  agregados en esta sesión (ver "Estado actual" arriba) y si la tapa de
  "La caída" debe recortarse o no.
- `catalogo.astro` (la vista tabla vieja) ya no existe — se eliminó al
  fusionar grilla y listado en un solo toggle dentro de `BookCatalog.astro`.
- El "zoom out" preciso a la tarjeta (punto 5) quedaría resuelto si se
  decide invertir en server-renderizar la grilla — evaluar si vale la
  pena antes de que alguien lo vuelva a pedir.
