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
  lib/about.ts               — getAboutData(): entry + Content compilado del
                               singleton "about" (texto "sobre nosotros" +
                               email/instagram/youtube).
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

### 10. `--color-primario` es random por carga real, no por navegación

`Layout.astro` tiene un `<script is:inline data-astro-rerun>` en el `<head>`
que elige un color al azar de una lista fija de 7 y lo aplica con
`document.documentElement.style.setProperty('--color-primario', ...)`. Todo
lo que antes tenía el rojo hardcodeado (fill/stroke del ícono-lápiz, fondo
del hover en grilla/lista vía `--color-primario-hover`, que es
`color-mix(in srgb, var(--color-primario) 88%, black)`) ahora lo sigue
automáticamente — ver `global.css`.

Dos cosas no obvias de la implementación:

- **`data-astro-rerun` es obligatorio, pero por una razón distinta al punto
  2**: no es para que el script vuelva a ejecutar el body (de hecho, no
  queremos que elija un color nuevo en cada navegación) — es porque el swap
  de View Transitions de Astro resetea los atributos del propio `<html>`
  (incluido cualquier `style` puesto en runtime por JS) para que coincidan
  con el markup estático de la página recién fetcheada. Sin volver a correr
  el script en cada navegación, el `--color-primario` puesto a mano
  desaparecería apenas se abre un libro. La guarda `window.__primarioColor`
  es la que evita elegir un color nuevo en esas re-ejecuciones — sólo se
  vuelve a sortear cuando `window` es nuevo de verdad (F5/recarga real).
- Envuelto en un IIFE por la misma razón que el punto 4: al reejecutarse
  como classic script, un `const` de nivel superior repetido tiraría
  `SyntaxError: Identifier already declared`.

### 11. Preloader de entrada

`src/components/Preloader.astro`, incluido en `Layout.astro` **después** de
`<slot />` (no antes) — overlay fijo (`position: fixed; inset: 0; z-index`
alto) que tapa toda la página mientras el `<slot />` real ya se renderizó
debajo. Pasó por dos diseños completamente distintos en la misma sesión —
si algo de esto suena raro comparado con commits viejos, es porque el
primer intento (fondo negro, wordmark con `mask-image` relleno de tapas
cicladas, contador subiendo a 561, cortina de color deslizándose) se
descartó del todo y no quedó nada de esa versión en el código actual.

**Diseño actual**: fondo plano en `--color-primario` (la de esa sesión, ver
punto 10) → el logo real (`/logo-yauguru.png`) aparece chico, `scale(0.5)`
→ arriba del logo se van apilando ~10 tapas reales del catálogo, de a una
(fade + zoom-in, rotadas al azar, encadenadas por `transitionend` para que
nunca se superpongan) → cuando la página termina de cargar de verdad
(`window.load`/`document.readyState==='complete'`, no un timer fijo) Y la
pila ya terminó de armarse (lo que tarde más de las dos), las tapas
desaparecen, el logo crece a `scale(1)`, y recién ahí el overlay se
disuelve (`opacity`) y se remueve del DOM. No pide datos nuevos: lee las
tapas directo de `#app-data`, el mismo JSON que `BookCatalog.astro` ya
embebe en cada página — por eso el componente va **después** del
`<slot />` en el DOM (si fuera antes, su script correría, en orden de
parseo del documento, antes de que `#app-data` exista todavía; al ser
`position: fixed`, igual tapa toda la pantalla sin importar su posición
real en el documento).

Bugs reales encontrados mientras se armaba (en orden cronológico, todos
con test de Playwright antes de darlos por resueltos):

- **Estilos scoped de Astro + elementos creados por JS**: las tapas se
  crean con `document.createElement('img')` en el script, no existen en el
  markup server-rendered del componente — el hash de scoping que Astro le
  agrega a los selectores de un `<style>` normal nunca llega a esos
  elementos, así que una regla `.preloader-cover { ... }` sin más los
  ignora silenciosamente (salían gigantes, sin posición). Hace falta
  `:global(.preloader-cover) { ... }`.
- **Reveal disparaba a mitad de la última tapa**: `stackDone` se ponía en
  `true` en el mismo tick en que se agregaba la última tapa al DOM, antes
  de que termine su propia animación de entrada — la pila nunca se
  alcanzaba a ver completa. Se agregó un `HOLD` (600ms) después de que la
  última tapa termina su propio `transitionend`.
- **El logo tenía dos reducciones apiladas**: el contenedor ya tenía un
  ancho igual a la mitad del tamaño real del hero, y ADEMÁS
  `transform: scale(0.5)` encima — al "crecer" a `scale(1)` solo llegaba a
  la mitad del tamaño real. El contenedor tiene que medir el 100% real; el
  `scale()` es la única reducción.
- **Stagger de tiempo fijo vs. secuencial de verdad**: con
  `setTimeout(i * STAGGER)`, si `STAGGER` quedaba más corto que la
  duración de la transición, las tapas se superponían apareciendo. Se
  cambió a una función recursiva `addCover(i)` que solo agrega la
  siguiente tapa desde el `transitionend` (`{ once: true }`) de la
  anterior — no puede superponerse pase lo que pase con la duración.
- **Un solo `requestAnimationFrame` no alcanza para forzar la transición**:
  crear el elemento, ponerle el estado inicial, y cambiar al estado final
  en el siguiente rAF funcionaba para la 1ª tapa (su decode de imagen es
  lo bastante lento como para dejar un frame de por medio) pero no para la
  2ª-10ª (con la imagen ya cacheada, el navegador podía coalescer ambos
  estilos en un solo paint, sin transición visible). Fix: forzar un reflow
  síncrono leyendo `void el.offsetWidth` entre poner el estado inicial y
  el final — sin eso, ningún rAF por sí solo garantiza que el "antes" se
  llegó a pintar.
- **Tapas recortadas → centrado roto al sacar el crop**: primero se cambió
  el `<img>` de una caja fija con `object-fit:cover` (recortaba tapas con
  otra proporción) a `max-width/max-height` + `width/height:auto` — pero
  eso hizo que el tamaño real de la caja dependiera de cuándo termina de
  cargar la imagen (asíncrono), y el `transform: translate(-50%, -50%)`
  usado para centrar cada tapa se calcula contra el tamaño de LA CAJA en
  ese momento — con la imagen todavía sin cargar, esa caja podía medir
  0×0, y el `-50%` efectivo terminaba siendo 0, corriendo la tapa lejos
  del centro. Fix definitivo: separar un wrapper de tamaño FIJO (200×280,
  conocido de forma síncrona, es el que lleva el `transform` de centrado)
  del `<img>` de adentro (que sí usa `max-width/height` + auto para no
  recortarse, pero nunca participa del cálculo de centrado).
- **Logo del preloader vs. logo real del hero, dos fórmulas de tamaño
  distintas**: en algún momento el hero real pasó a usar
  `w-full h-full object-contain` dentro de una sección `h-screen` sin
  padding (para tocar el borde del alto en landscape o del ancho en
  portrait, sin nunca distorsionarse), pero el logo del preloader seguía
  con su propia fórmula vieja (`min(90vw,1074px)` de ancho, sin límite de
  alto) — en cualquier viewport donde el alto termina siendo la
  restricción real, el preloader crecía más grande que el tamaño final de
  verdad y se veía un salto/snap al desaparecer. Las dos fórmulas tienen
  que ser **exactamente** iguales (`width:100vw; height:100vh;
  object-fit:contain;` en ambos), no solo "parecidas" — se verificó
  comparando el `getComputedStyle().width/height` de los dos elementos en
  varios tamaños de viewport hasta que coincidieron exacto.
- **`prefers-reduced-motion` con `transition:none`**: el branch de
  reduced-motion no puede esperar un `transitionend` para remover el
  overlay — la regla CSS que le pone `transition: none` en ese caso hace
  que ese evento nunca dispare. Llama `root.remove()` directo en cambio.

Mismo patrón de guarda que el punto 10 (`data-astro-rerun` +
`window.__yauguruPreloaderShown`): Layout renderiza el preloader en
**cada** página sin condición, así que una navegación soft (abrir/cerrar
un libro) trae uno nuevo en el HTML recién fetcheado — la guarda hace que
ese nuevo se borre al instante (`root.remove()`) en vez de repetir la
secuencia completa. Confirmado con Playwright que no hay ni un frame
visible de más al navegar.

### 12. Scroll lock sin salto ni línea blanca

`body:has(#book-modal), body:has(#preloader) { overflow: hidden; padding-right: var(--scrollbar-width) }`
en `global.css` — bloquea el scroll real (no solo visualmente) mientras el
modal de detalle o el preloader están activos, vía la propagación especial
de `overflow` de `body` al viewport (spec de CSS: si `html` tiene overflow
`visible` y `body` no, el UA usa el de `body` para el viewport).

`overflow:hidden` hace que el navegador saque la scrollbar real, lo que
angosta/ensancha la página según el ancho que esa scrollbar ocupaba —
visible como un salto lateral leve justo al bloquear/desbloquear. Dos
intentos antes de llegar a la solución actual:

1. `scrollbar-gutter: stable` en `html` — soluciona el salto reservando el
   gutter siempre, pero como se reserva **todo el tiempo** (no solo
   mientras está bloqueado), donde el sitio no llena 100% el ancho
   (páginas cortas, o el propio momento sin scroll) queda una franja
   blanca fija del lado derecho, encima de secciones con color de fondo —
   peor que el problema original.
2. **Solución final**: `padding-right: var(--scrollbar-width)` junto con
   el `overflow:hidden`, aplicado solo mientras está bloqueado — sin
   gutter permanente. `--scrollbar-width` se mide una sola vez por sesión
   real con un elemento sonda (`overflow:scroll` en un div de prueba,
   `offsetWidth - clientWidth`) en `Layout.astro`, cacheada en
   `window.__scrollbarWidth`, y reaplicada en cada navegación soft con el
   mismo patrón `data-astro-rerun` + `window.__algo` de los puntos 10/11
   (el `<html>` pierde estilos puestos en runtime en cada swap de
   transición).

Ojo si se prueba esto en un navegador headless/automatizado: tanto
Chromium (el bundleado de Playwright) como el Chrome real del sistema
miden `--scrollbar-width` como `0px` en modo headless — no hay forma de
verificar el valor real medido sin una ventana visible de verdad. Se
verificó igual que el *mecanismo* (padding compensa exactamente lo que
mide la variable) funciona forzando un valor de prueba de 15px a mano.

### 13. Cursor "Entrar" en el hero + flash de color al cargar

Dos agregados chicos sobre el sistema de cursor-dot existente (ver
`#cursor-dot` en `BookCatalog.astro`/`global.css`) y sobre el preloader:

- **Modo nuevo del cursor**: al pasar el mouse por `#hero-section`
  (agregado ese id específicamente para esto), el punto crece a un
  círculo fijo de 90px (no una píldora — se probó una píldora
  `width:auto` primero, pero se pidió circular) mostrando "Entrar", con
  la misma prioridad/estructura que los modos `close`/`plus`/`pencil` ya
  existentes (`isOverHero`, más abajo en la cadena de prioridad que los
  otros tres, ninguno se solapa con `hero` en la práctica). Un click ahí
  hace `document.getElementById('about-section').scrollIntoView({behavior:'smooth'})`.
  Como el preloader tapa el hero con sus propios `pointer-events` mientras
  está activo, este modo no puede dispararse antes de que la página
  termine de cargar — no hizo falta lógica extra para eso.
- **Flash de color al terminar el preloader**: `Preloader.astro` le agrega
  la clase `hero-flash` a `#hero-section` en el mismo momento en que el
  overlay empieza a desvanecerse (justo después de que el logo termina de
  crecer) — el fondo del hero transiciona de `--color-primario` plano a
  `--color-primario-hover` (el mismo tono oscuro de los tiles/detalle) y
  **se queda ahí** (no es un flash que vuelve atrás, a pesar del nombre de
  la clase — se probó que volviera y se pidió que quedara fijo, para que
  el punto del cursor, que sigue siendo el primario plano, se distinga
  más contra el fondo).

### 14. Logo rotado 90° en mobile portrait (hero + preloader)

En `#hero-section` (`BookCatalog.astro`) y `.preloader-logo` (`Preloader.astro`),
un `@media (max-width: 639px) and (orientation: portrait)` swapea el ancho/alto
del logo (`width:100vh; height:100vw`) y lo rota con `transform: rotate(90deg)`
(sumado a `scale()` en el preloader) — el wordmark es apaisado, así que sin esto
`object-contain` lo encoge a lo ancho de la pantalla y queda chico con mucho
espacio muerto arriba/abajo. Swapear el box antes de rotar hace que
`object-contain` calcule el tamaño contra una caja ya pensada para portrait, y
la rotación lo deja ocupando el 100vw×100vh real, solo que de costado.

Dos interacciones invisibles con Tailwind que rompían el swap en silencio
(ambas confirmadas con Playwright inspeccionando `getComputedStyle`, no a
simple vista — los números resultantes son creíbles a primera vista, no un
error obvio):

- **Preflight pone `max-width: 100%` en todo `<img>`** (`@layer base`). Sin
  `max-width: none` en la regla del media query, el `width: 100vh` (más grande
  que el ancho real del viewport en portrait) queda clampeado de vuelta a
  `100%` del contenedor — el swap nunca se ve, sin ningún error ni warning.
- **El contenedor es `display:flex`** (fila, `items-center justify-center`).
  Sin `flex-shrink: 0`, el algoritmo de flexbox intenta achicar el logo para
  que entre en el espacio disponible (mucho menor a `100vh` en portrait) — y
  como la altura ya es definida (`100vw`) y la imagen tiene aspect ratio
  intrínseco conocido, el **automatic minimum width** de flexbox (spec: para
  un ítem reemplazado con cross-size definido, es `cross-size × aspect-ratio`)
  termina ganándole al `width` especificado, dando un tercer número que no es
  ni el viejo ni el nuevo valor esperado (en un momento se vio `503.48px` —
  ni `100%` del contenedor ni `100vh` real, sino `390px × (2959/2292)`).

Las dos reglas (`.hero-logo` en `BookCatalog.astro` y `.preloader-logo` en
`Preloader.astro`) tienen que mantenerse en sync exacto, mismo motivo que el
punto 11 (evitar un salto visible en el hand-off preloader → hero real).

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
modos hover/cerrar/lápiz/hero-"Entrar", ver puntos 9 y 13), zona de dibujo en
la sección "about", footer fijo que aparece cuando la barra de filtros queda
sticky, tapas reales para ~561 libros (ver "Cómo agregar tapas nuevas"
abajo), un editor web (Sveltia CMS, ver sección propia) con colecciones
`about` y `genres` editables además de `books`/`editorial-collections`,
`--color-primario` random por sesión (punto 10), branding propio en vez del
default de Astro (favicon/logo del CMS), y un preloader de entrada con logo
+ pila de tapas (punto 11) — ver los puntos 10-13 de "Decisiones no obvias"
para el detalle de estos últimos, son los más recientes y los más propensos
a bugs sutiles si se los toca sin leer el porqué primero.

**`main` está pusheado y sincronizado con `origin/main`** (confirmado con
`git rev-list --count origin/main..HEAD` / `HEAD..origin/main`, ambos en 0)
al momento de escribir esto.

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
  de los dos hacía falta). El botón "Sign In with GitHub" (OAuth) que
  Sveltia muestra por defecto se sacó con `backend.auth_methods: [token]`
  en `config.yml` — sin esto tira "Not Found" al clickearlo, porque
  necesitaría ese mismo GitHub OAuth App + proxy que se descartó arriba.
  Confirmado contra el JSON schema real de Sveltia
  (`https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json`) que
  `auth_methods` es un campo válido de `GitHubBackend`, no una opción
  inventada. Cada colaborador nuevo necesita su propio PAT generado desde
  su propia cuenta de GitHub (agregada como collaborator del repo) — un
  token compartido no permite revocar acceso individual ni distingue quién
  hizo qué commit.
  El texto "Sveltia CMS" del login se cambió por "Yaugurú" con `app_title`
  (top-level en `config.yml`) — Sveltia igual deja un "Powered by Sveltia
  CMS" chico en el pie de página, no es una solución white-label completa
  (documentado así en su propia doc de customization). Después se pidió
  sacar ese texto del todo (solo el logo) — no hay config para eso (solo
  para cambiar el texto, no para ocultarlo), así que se ocultó con CSS en
  `public/admin/index.html` apuntando a `img.logo + h1` — esa adyacencia
  específica solo existe en la pantalla de login, nunca de vuelta una vez
  logueado, así que no hace falta un selector más frágil ni arriesga
  esconder un `<h1>` legítimo del editor real.
- **Tema claro por defecto**: tampoco hay opción de config para esto —
  Sveltia decide auto light/dark llamando
  `matchMedia('(prefers-color-scheme: dark)')` una sola vez al arrancar (se
  confirmó leyendo el bundle minificado de `sveltia-cms.js`, no está
  documentado). `public/admin/index.html` pisa `window.matchMedia` *antes*
  del `<script>` de Sveltia para que esa consulta puntual devuelva siempre
  `matches: false`, sin tocar ningún otro uso de `matchMedia` en la página.
  Verificado con Playwright emulando `colorScheme: 'dark'` en el navegador
  — sin el override, el tema quedaba en dark; con el override,
  `document.documentElement.dataset.theme` da `"light"` incluso así.
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
- **Colección `genres`** — igual patrón que `editorial-collections` (`name`
  + `order`, `folder: src/content/genres`), y el campo `genre` de `books`
  pasó de `widget: select` con opciones hardcodeadas a `widget: relation`
  apuntando a `genres` (igual que `collections`, pero singular, sin
  `multiple: true` — un libro tiene a lo sumo un género). Antes era un
  `z.enum()` fijo en `content.config.ts`; antes de migrar, los 561 libros
  ya usaban 8 valores distintos como género (`grep -h "^genre:"
  src/content/books/*.md | sort | uniq -c`), todos coincidiendo 1:1 con el
  enum viejo — se creó una entrada de `genres` por cada uno, y se
  actualizaron a mano los `genre:` de los 125 libros cuyo valor no era ya
  un slug ASCII-safe (`poesía` → `poesia`, `audio (cd/dvd)` → `audio-cd-dvd`;
  los otros 6 valores ya coincidían con su slug nuevo, sin tocar). El
  filtro "Género" de la grilla y el `<select>` del CMS ahora leen de esta
  colección (`genreOptions` en `books.ts`, mismo mecanismo que
  `collectionOptions`) en vez de derivar de un enum o de "lo que aparece
  en los libros actuales" — un género nuevo agregado desde el CMS aparece
  en el filtro de inmediato, aunque ningún libro lo use todavía.
- Sin preview template custom para ninguna de las dos colecciones —se
  probó uno para libros (tapa a la izquierda, texto rojo a la derecha,
  imitando la ficha real del sitio) pero se sacó porque desentonaba con el
  tema oscuro del editor de Sveltia; el preview default alcanza.
- **Logo custom**: `logo: { src: /logo-yauguru.png }` a nivel raíz de
  `config.yml` — reemplaza el logo de Sveltia por el logo de Yaugurú en la
  pantalla de login, el header del editor, y el favicon de la pestaña. Se
  probó primero `favicon.svg` (cuadrado, vectorial, se adapta a modo
  oscuro — más cercano a lo que Sveltia recomienda para este campo), pero
  resultó ser el favicon default de Astro sin personalizar, no una marca
  real de Yaugurú — se cambió a `logo-yauguru.png` (el mismo wordmark
  ancho que se usa de fondo en el hero de la home), que Sveltia escala a
  su caja sin problema aunque no sea cuadrado.
- **Idioma**: se evaluó agregar español a la UI del editor (no al
  contenido) y se descartó — Sveltia CMS todavía no tiene traducción al
  español, solo inglés y japonés (confirmado en su repo/docs a 2026-07).
- **Favicon del sitio** (no confundir con el logo del editor de arriba,
  que es un campo aparte): `public/favicon.svg` y `favicon.ico` eran el
  ícono default de Astro (el cohete), nunca personalizados — visibles en
  la pestaña del navegador y en resultados de búsqueda/bookmarks. Se
  generaron `favicon.png` (512×512) y un `favicon.ico` multi-resolución
  (16/32/48px) a partir de `logo-yauguru.png`, centrado en un canvas
  cuadrado con padding transparente arriba/abajo (sin recortar ni estirar
  el wordmark — mismo criterio que el logo del CMS). `Layout.astro` ahora
  apunta a `favicon.png`; no había ningún otro ícono de Astro visible
  (sin manifest, apple-touch-icon, ni og:image en el sitio — confirmado
  con grep antes de tocar nada).
- **Colección `about` = "file collection"** (`files:` en vez de `folder:`,
  apuntando a `src/content/about/about.md`) para el texto "Sobre nosotros"
  que antes estaba hardcodeado en `BookCatalog.astro`. Se probó primero una
  folder collection normal con `create: false`/`delete: false` para que
  fuera un singleton, pero eso la mostraba como una lista vacía sin forma de
  abrir la entrada existente — una file collection es el patrón correcto de
  Decap/Sveltia para una página única editable directamente (sin
  crear/listar/borrar entradas). Un solo campo, `body` (`widget: markdown`,
  cada párrafo separado por línea en blanco) — se probaron campos
  estructurados separados para email/instagram/youtube, pero se sacaron a
  pedido del editor: esos links van como link de markdown directo dentro
  del mismo texto (`[email](mailto:...)`, etc.), no como campos aparte. El
  wrapper en `BookCatalog.astro` tiene `[&_a]:underline` para que cualquier
  link dentro del body markdown salga con el mismo subrayado que el resto
  del sitio, sin depender de una clase por link. Cargado vía
  `src/lib/about.ts` (`getAboutData()`, usa `render()` de `astro:content`
  para el body).
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
