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

## Estado actual (revisar con `git status` / `git log`)

Todos los commits en `main` están pusheados a GitHub salvo el trabajo
de **esta sesión más reciente** (rediseño de la barra de filtros: full
width → 4 columnas → revert a scroll por columna + sticky → scrollbar
custom → 5 columnas con el botón de cerrar integrado al grid). Correr
`git status` / `git diff` al retomar — probablemente hay cambios sin
commitear en `src/components/BookCatalog.astro` y `src/styles/global.css`
que el usuario todavía no pidió subir.

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

- `catalogo.astro` (vista tabla) no se tocó — sigue con selects nativos,
  podría valer la pena unificar su estilo con el nuevo `BookCatalog`.
- No hay imágenes de tapa reales (`coverImage` vacío en los 552 libros)
  — el grid usa placeholders de texto (título + autor). Si en algún
  momento se cargan tapas reales, `card()` en `BookCatalog.astro` ya
  tiene el punto donde agregar el `<img>` condicional.
- El "zoom out" preciso a la tarjeta (punto 5) quedaría resuelto si se
  decide invertir en server-renderizar la grilla — evaluar si vale la
  pena antes de que alguien lo vuelva a pedir.
