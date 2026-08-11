const fs = require('fs');
const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

const STATIC_METADATA_FILENAMES = new Set([
	'block.json',
	'render.php',
	'typia.openapi.json',
	'typia.manifest.json',
	'typia.schema.json',
	'typia-validator.php',
	'typia-migration-registry.php',
]);
const SCRIPT_MODULE_ASSET_FILENAMES = new Set([
	'interactivity.asset.php',
	'view.asset.php',
]);

function isMetadataAsset(filename) {
	return (
		STATIC_METADATA_FILENAMES.has(filename) ||
		filename.endsWith('.schema.json') ||
		filename.endsWith('.openapi.json')
	);
}

function normalizeScriptModuleAssetSource(source) {
	return String(source).replace(
		/'dependencies'\s*=>\s*array\([^)]*\)/,
		"'dependencies' => array()"
	);
}

class MetadataAssetPlugin {
	apply(compiler) {
		compiler.hooks.thisCompilation.tap(
			'MetadataAssetPlugin',
			(compilation) => {
				compilation.hooks.processAssets.tap(
					{
						name: 'MetadataAssetPlugin',
						stage: compiler.webpack.Compilation
							.PROCESS_ASSETS_STAGE_ADDITIONS,
					},
					() => {
						for (const entry of getMetadataEntries()) {
							if (compilation.getAsset(entry.outputPath)) {
								continue;
							}

							compilation.emitAsset(
								entry.outputPath,
								new compiler.webpack.sources.RawSource(
									fs.readFileSync(entry.inputPath)
								)
							);
						}

						for (const assetName of SCRIPT_MODULE_ASSET_FILENAMES) {
							const asset = compilation.getAsset(assetName);
							if (!asset) {
								continue;
							}

							compilation.updateAsset(
								assetName,
								new compiler.webpack.sources.RawSource(
									normalizeScriptModuleAssetSource(
										asset.source.source()
									)
								)
							);
						}
					}
				);
			}
		);

		compiler.hooks.afterEmit.tap('MetadataAssetPlugin', (compilation) => {
			const outputPath = compilation.outputOptions.path;
			if (!outputPath) {
				return;
			}

			for (const assetName of SCRIPT_MODULE_ASSET_FILENAMES) {
				const assetPath = path.join(outputPath, assetName);
				if (!fs.existsSync(assetPath)) {
					continue;
				}

				fs.writeFileSync(
					assetPath,
					normalizeScriptModuleAssetSource(
						fs.readFileSync(assetPath, 'utf8')
					)
				);
			}
		});
	}
}

function getMetadataEntries() {
	const entries = [];

	for (const filename of STATIC_METADATA_FILENAMES) {
		const rootFilePath = path.resolve(process.cwd(), filename);
		if (fs.existsSync(rootFilePath)) {
			entries.push({
				inputPath: rootFilePath,
				outputPath: filename,
			});
		}
	}

	const srcDir = path.resolve(process.cwd(), 'src');
	if (!fs.existsSync(srcDir)) {
		return entries;
	}

	for (const inputPath of findMetadataFiles(srcDir)) {
		entries.push({
			inputPath,
			outputPath: path.relative(srcDir, inputPath),
		});
	}

	return entries;
}

function findMetadataFiles(directory) {
	const metadataFiles = [];

	for (const entry of fs.readdirSync(directory, {
		withFileTypes: true,
	})) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			metadataFiles.push(...findMetadataFiles(entryPath));
			continue;
		}
		if (entry.isFile() && isMetadataAsset(entry.name)) {
			metadataFiles.push(entryPath);
		}
	}

	return metadataFiles;
}

function toWebpackConfigs(config) {
	return Array.isArray(config) ? config : [config];
}

function resolveOptionalEntry(name, candidates) {
	for (const candidate of candidates) {
		const entryPath = path.resolve(process.cwd(), candidate);
		if (fs.existsSync(entryPath)) {
			return [name, entryPath];
		}
	}

	return null;
}

function isModuleConfig(config) {
	return config?.output?.module === true;
}

module.exports = async () => {
	const { default: UnpluginTypia } = await import('@ttsc/unplugin/webpack');
	const resolvedDefaultConfig =
		typeof defaultConfig === 'function'
			? await defaultConfig()
			: defaultConfig;
	const optionalModuleEntries = Object.fromEntries(
		[
			resolveOptionalEntry('interactivity', [
				'src/interactivity.ts',
				'src/interactivity.js',
			]),
			resolveOptionalEntry('view', ['src/view.ts', 'src/view.js']),
		].filter(Boolean)
	);
	const configs = toWebpackConfigs(resolvedDefaultConfig).map((config) => ({
		...config,
		entry: async () => ({
			...(typeof config.entry === 'function'
				? await config.entry()
				: config.entry || {}),
			...(isModuleConfig(config) ? optionalModuleEntries : {}),
		}),
		resolve: {
			...(config.resolve || {}),
			extensionAlias: {
				...(config.resolve?.extensionAlias || {}),
				'.js': ['.js', '.ts', '.tsx'],
			},
			alias: {
				...(config.resolve?.alias || {}),
				'@wp-typia/block-runtime/blocks': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-block-runtime/src/blocks.ts'
				),
				'@wp-typia/block-runtime/defaults': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-block-runtime/src/defaults.ts'
				),
				'@wp-typia/block-runtime/editor': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-block-runtime/src/editor.ts'
				),
				'@wp-typia/block-runtime/identifiers': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-block-runtime/src/identifiers.ts'
				),
				'@wp-typia/block-runtime/inspector': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-block-runtime/src/inspector.ts'
				),
				'@wp-typia/block-runtime/validation': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-block-runtime/src/validation.ts'
				),
				'@wp-typia/api-client/runtime-primitives': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-api-client/src/runtime-primitives.ts'
				),
				'@wp-typia/api-client/client-utils': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-api-client/src/client-utils.ts'
				),
				'@wp-typia/api-client$': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-api-client/src/index.ts'
				),
				'@wp-typia/rest': path.resolve(
					process.cwd(),
					'../../packages/wp-typia-rest/src'
				),
			},
		},
		plugins: [
			UnpluginTypia(),
			...(config.plugins || []),
			new MetadataAssetPlugin(),
		],
	}));

	return configs.length === 1 ? configs[0] : configs;
};
