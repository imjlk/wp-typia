const { join } = require('path');

module.exports = {
  templatesPath: join(__dirname),
  defaultValues: {
    namespace: 'create-block',
    category: 'widgets',
    dashicon: 'admin-site-alt3',
    textdomain: 'my-typia-block',
    editorScript: 'file:./index.js',
    style: 'file:./style-index.css',
    viewScript: 'file:./view.js',
  },
  variants: {
    typia: {
      title: 'Typia Block',
      description:
        'A WordPress block with Typia validation and Interactivity API',
    },
  },
};
