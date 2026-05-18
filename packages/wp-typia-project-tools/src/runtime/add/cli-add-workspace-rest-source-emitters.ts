/**
 * Compatibility facade for REST workspace source emitters.
 *
 * Keep the public runtime import path stable while generated-resource and
 * manual-contract emitters live in focused modules.
 */
export {
	buildRestResourceApiSource,
	buildRestResourceConfigEntry,
	buildRestResourceDataSource,
	buildRestResourceTypesSource,
	buildRestResourceValidatorsSource,
} from "./cli-add-workspace-rest-generated-source-emitters.js";
export {
	buildManualRestContractApiSource,
	buildManualRestContractConfigEntry,
	buildManualRestContractTypesSource,
	buildManualRestContractValidatorsSource,
} from "./cli-add-workspace-rest-manual-source-emitters.js";
