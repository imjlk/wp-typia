const path = require('node:path');

// Resolve the contributor source directly so this cache warm-up can run before
// workspace packages are built. The generated project imports the same rules.
module.exports = {
  plugins: {
    wordpress: {
      source: path.resolve(
        __dirname,
        '../../../packages/ttsc-lint-plugin-wp/rules',
      ),
    },
  },
};
