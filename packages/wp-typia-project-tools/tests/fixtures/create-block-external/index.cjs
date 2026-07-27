module.exports = {
	blockTemplatesPath: 'block-templates',
	assetsPath: 'assets',
	folderName: 'seed-src',
	defaultValues: {
		supportsMultiple: false,
		variantLabel: 'standard',
	},
	variants: {
		standard: {
			variantLabel: 'standard',
		},
		hero: {
			supportsMultiple: true,
			variantLabel: 'hero',
		},
		workspace: {
			folderName: '.',
			pluginTemplatesPath: 'plugin-templates',
			variantLabel: 'workspace',
		},
	},
	transformer( view ) {
		return {
			transformedLabel: `${ view.variantLabel }-transformed`,
		};
	},
};
