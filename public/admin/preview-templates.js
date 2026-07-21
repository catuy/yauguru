// Puts the cover image at the very top of the entry preview pane (by
// default Sveltia/Decap render fields in the order they're defined in
// config.yml, and coverImage sits in the middle of that list). Written
// without JSX/a build step — `h`, `createClass` and `CMS` are exposed as
// globals by the sveltia-cms.js bundle loaded before this script.

function coverFirstPreview(fieldOrder) {
  return createClass({
    render: function () {
      var widgetFor = this.props.widgetFor;
      return h(
        'div',
        { className: 'cover-first-preview' },
        h('div', { style: { marginBottom: '24px' } }, widgetFor('coverImage')),
        fieldOrder
          .filter(function (name) {
            return name !== 'coverImage';
          })
          .map(function (name) {
            return h('div', { key: name, style: { marginBottom: '16px' } }, widgetFor(name));
          })
      );
    },
  });
}

CMS.registerPreviewTemplate(
  'books',
  coverFirstPreview([
    'coverImage',
    'title',
    'collections',
    'series',
    'year',
    'authors',
    'genre',
    'translators',
    'illustrators',
    'coEdition',
    'awards',
    'purchaseLink',
    'featured',
    'body',
  ])
);

CMS.registerPreviewTemplate(
  'collections',
  coverFirstPreview(['coverImage', 'name', 'order', 'description', 'body'])
);
