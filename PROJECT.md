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
lotes con tapas de 2023-2026. Cuando aparezcan lotes nuevos (ej. `materiales/2021`,
`materiales/2022`, `materiales/2023`), el flujo que ya se usó es:

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
   en pantalla (grilla ~190px, modal ~380px).
4. **Agregar `coverImage: /covers/<slug>.jpg`** al frontmatter del `.md`
   correspondiente (después de `featured:`, ver cualquier libro ya migrado
   como ejemplo).
5. **Reportarle al usuario** qué imágenes no se pudieron matchear o quedaron
   dudosas (con el título/autor que dice la tapa, si se pudo leer) — no forzar
   un match de baja confianza.
6. Verificar con `astro dev --background` + una pasada de Playwright (grid y
   modal, con y sin filtros) antes de dar por terminado.

## Estado actual (revisar con `git status` / `git log`)

Todos los commits en `main` están pusheados a GitHub. Trabajo hecho hasta
ahora: grilla/lista unificadas con toggle, tapas reales para ~50 libros +
7 libros nuevos encontrados entre las tapas, rediseño del modal de detalle
(dos paneles full-bleed), punto rojo que sigue al mouse (con modos hover/
cerrar/lápiz), zona de dibujo en la sección "about", footer fijo que aparece
cuando la barra de filtros queda sticky. Quedan pendientes las tapas de los
lotes `materiales/2021`, `materiales/2022` y `materiales/2023` (subidas por
el editor, todavía sin procesar — ver "Cómo agregar tapas nuevas" arriba).

## Cómo levantar el entorno

```
cd /Users/diego/www/yauguru
astro dev --background     # o node_modules/.bin/astro dev --background
astro dev logs             # ver logs
astro dev stop
```

Nota: ~13 archivos de `src/content/books/*.md` fallan el schema
(`authors` vacío) — son preexistentes, no relacionados a este trabajo
(ver TODO en `src/content.config.ts`).

## Próximos pasos posibles (no pedidos aún, solo ideas si preguntan)

- Procesar las tapas de `materiales/2021`, `materiales/2022` y
  `materiales/2023` (ver "Cómo agregar tapas nuevas" arriba) — es lo
  próximo que pidió el usuario.
- `catalogo.astro` (la vista tabla vieja) ya no existe — se eliminó al
  fusionar grilla y listado en un solo toggle dentro de `BookCatalog.astro`.
- El "zoom out" preciso a la tarjeta (punto 5) quedaría resuelto si se
  decide invertir en server-renderizar la grilla — evaluar si vale la
  pena antes de que alguien lo vuelva a pedir.
