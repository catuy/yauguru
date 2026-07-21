// Mirrors the real book-detail layout from BookCatalog.astro: cover on the
// left in a light gray box, an info list on the right in the site's red
// (#de2a42), rows separated by thin red dividers. Written without
// JSX/a build step — `h`, `createClass` and `CMS` are exposed as globals by
// the sveltia-cms.js bundle loaded before this script.

var RED = '#de2a42';

var GENRE_LABELS = {
  'poesía': 'Poesía',
  novela: 'Novela',
  cuentos: 'Cuentos',
  ensayo: 'Ensayo',
  teatro: 'Teatro',
  'audio (cd/dvd)': 'Audio (CD/DVD)',
  historieta: 'Historieta',
  otro: 'Otro',
};

// Sveltia's entry data can come back as a plain array or an Immutable-style
// List depending on version — handle both instead of assuming one.
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.toJS === 'function') return value.toJS();
  if (typeof value.toArray === 'function') return value.toArray();
  return [value];
}

function infoRow(label, value) {
  if (!value) return null;
  return h(
    'div',
    { style: { padding: '12px 0', borderBottom: '1px solid ' + RED } },
    h(
      'div',
      { style: { fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: RED } },
      label
    ),
    h(
      'div',
      {
        style: {
          marginTop: '6px',
          fontSize: '18px',
          lineHeight: 1.6,
          color: RED,
          whiteSpace: 'pre-line',
        },
      },
      value
    )
  );
}

var BooksPreview = createClass({
  render: function () {
    var entry = this.props.entry;
    var getAsset = this.props.getAsset;

    var title = entry.getIn(['data', 'title']) || '';
    var collectionSlugs = toArray(entry.getIn(['data', 'collections']));
    var year = entry.getIn(['data', 'year']);
    var authors = toArray(entry.getIn(['data', 'authors']));
    var genre = entry.getIn(['data', 'genre']);
    var notes = entry.getIn(['data', 'notes']);
    var coverImage = entry.getIn(['data', 'coverImage']);

    var imageAsset = coverImage ? getAsset(coverImage) : null;
    var imageUrl = imageAsset ? String(imageAsset) : null;

    return h(
      'div',
      { style: { display: 'flex', gap: '24px', fontFamily: 'sans-serif' } },
      h(
        'div',
        {
          style: {
            flex: '0 0 220px',
            height: '320px',
            background: '#F9F9F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        imageUrl
          ? h('img', {
              src: imageUrl,
              style: {
                maxWidth: '100%',
                maxHeight: '100%',
                boxShadow: '2px 3px 6px rgba(0,0,0,0.22), 9px 12px 22px -10px rgba(0,0,0,0.35)',
              },
            })
          : h(
              'div',
              {
                style: {
                  padding: '20px',
                  color: RED,
                  fontSize: '14px',
                  textAlign: 'center',
                },
              },
              title
            )
      ),
      h(
        'div',
        { style: { flex: 1 } },
        infoRow('Título', title),
        infoRow('Colección', collectionSlugs.join(', ')),
        infoRow('Año', year ? String(year) : ''),
        infoRow('Autor(es)', authors.join(', ')),
        infoRow('Género', GENRE_LABELS[genre] || genre),
        infoRow('Notas', notes)
      )
    );
  },
});

CMS.registerPreviewTemplate('books', BooksPreview);

// editorial-collections has no custom preview — it's just name/order, a
// dynamic listing rendered by the site itself, not a standalone page with
// its own layout worth previewing.
