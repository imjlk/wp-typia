import { type RestResourceMethodId } from './cli-add-shared.js';
import { quotePhpString } from '../shared/php-utils.js';

export interface RestResourcePhpFunctionNames {
  canWriteFunctionName: string;
  createHandlerName: string;
  deleteHandlerName: string;
  listHandlerName: string;
  readHandlerName: string;
  updateHandlerName: string;
}

/**
 * Build the `register_rest_route` calls for generated REST resource PHP files.
 */
export function buildRestResourceRouteRegistrations(
	restResourceSlug: string,
	methods: RestResourceMethodId[],
	functions: RestResourcePhpFunctionNames,
	options: {
		controllerVariableName?: string;
		permissionCallback?: string;
		routePattern: string;
	},
): string {
  const collectionRoutes: string[] = [];
  const itemRoutes: string[] = [];
  const readPermissionCallback = options.permissionCallback
    ? quotePhpString(options.permissionCallback)
    : quotePhpString('__return_true');
  const writePermissionCallback = options.permissionCallback
    ? quotePhpString(options.permissionCallback)
    : options.controllerVariableName
      ? `array( ${options.controllerVariableName}, 'can_manage_rest_resource' )`
      : quotePhpString(functions.canWriteFunctionName);
  const buildRouteCallback = (functionName: string, methodName: string) =>
		options.controllerVariableName
      ? `array( ${options.controllerVariableName}, '${methodName}' )`
      : quotePhpString(functionName);

  if (methods.includes('list')) {
    collectionRoutes.push(`\t\tarray(
\t\t\t'methods'             => WP_REST_Server::READABLE,
\t\t\t'callback'            => ${buildRouteCallback(functions.listHandlerName, 'list_items')},
\t\t\t'permission_callback' => ${readPermissionCallback},
\t\t)`);
  }
  if (methods.includes('create')) {
    collectionRoutes.push(`\t\tarray(
\t\t\t'methods'             => WP_REST_Server::CREATABLE,
\t\t\t'callback'            => ${buildRouteCallback(functions.createHandlerName, 'create_item')},
\t\t\t'permission_callback' => ${writePermissionCallback},
\t\t)`);
  }
  if (methods.includes('read')) {
    itemRoutes.push(`\t\tarray(
\t\t\t'methods'             => WP_REST_Server::READABLE,
\t\t\t'callback'            => ${buildRouteCallback(functions.readHandlerName, 'read_item')},
\t\t\t'permission_callback' => ${readPermissionCallback},
\t\t)`);
  }
  if (methods.includes('update')) {
    itemRoutes.push(`\t\tarray(
\t\t\t'methods'             => WP_REST_Server::EDITABLE,
\t\t\t'callback'            => ${buildRouteCallback(functions.updateHandlerName, 'update_item')},
\t\t\t'permission_callback' => ${writePermissionCallback},
\t\t)`);
  }
  if (methods.includes('delete')) {
    itemRoutes.push(`\t\tarray(
\t\t\t'methods'             => WP_REST_Server::DELETABLE,
\t\t\t'callback'            => ${buildRouteCallback(functions.deleteHandlerName, 'delete_item')},
\t\t\t'permission_callback' => ${writePermissionCallback},
\t\t)`);
  }

  const registrations: string[] = [];
  if (collectionRoutes.length > 0) {
    registrations.push(`\tregister_rest_route(
\t\t$namespace,
\t\t'/${restResourceSlug}',
\t\tarray(
${collectionRoutes.join(',\n')}
\t\t)
\t);`);
  }
  if (itemRoutes.length > 0) {
    registrations.push(`\tregister_rest_route(
\t\t$namespace,
\t\t${quotePhpString(options.routePattern)},
\t\tarray(
${itemRoutes.join(',\n')}
\t\t)
\t);`);
  }

  return registrations.join('\n\n');
}

function normalizeGlobalPhpClassName(classReference: string): string | undefined {
  const normalized = classReference.startsWith('\\')
    ? classReference.slice(1)
    : classReference;

  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(normalized) ? normalized : undefined;
}

/**
 * Normalize a configured PHP class name into a global `::class` reference.
 */
export function toPhpClassConstantReference(classReference: string): string {
  const normalized = classReference.startsWith('\\')
    ? classReference
    : `\\${classReference}`;
  return `${normalized}::class`;
}

/**
 * Build an optional controller shim class for generated REST resource handlers.
 */
export function buildRestResourceControllerClassSource(options: {
  controllerClass: string;
  controllerExtends?: string;
  functions: RestResourcePhpFunctionNames;
}): string {
  const controllerClassName = normalizeGlobalPhpClassName(
    options.controllerClass,
  );
  if (!controllerClassName) {
    return '';
  }

  const extendsClause = options.controllerExtends
    ? ` extends ${options.controllerExtends.startsWith('\\') ? options.controllerExtends : `\\${options.controllerExtends}`}`
    : '';

  return `
if ( ! class_exists( ${quotePhpString(controllerClassName)} ) ) {
\tclass ${controllerClassName}${extendsClause} {
\t\tpublic function can_manage_rest_resource() {
\t\t\treturn ${options.functions.canWriteFunctionName}();
\t\t}

\t\tpublic function list_items( WP_REST_Request $request ) {
\t\t\treturn ${options.functions.listHandlerName}( $request );
\t\t}

\t\tpublic function read_item( WP_REST_Request $request ) {
\t\t\treturn ${options.functions.readHandlerName}( $request );
\t\t}

\t\tpublic function create_item( WP_REST_Request $request ) {
\t\t\treturn ${options.functions.createHandlerName}( $request );
\t\t}

\t\tpublic function update_item( WP_REST_Request $request ) {
\t\t\treturn ${options.functions.updateHandlerName}( $request );
\t\t}

\t\tpublic function delete_item( WP_REST_Request $request ) {
\t\t\treturn ${options.functions.deleteHandlerName}( $request );
\t\t}
\t}
}
`;
}

/**
 * Build the controller instantiation block used inside REST route registration.
 */
export function buildRestResourceControllerBootstrapSource(
	controllerClass: string | undefined,
): string {
  if (!controllerClass) {
    return '';
  }

  return `\t\t$controller_class = ${toPhpClassConstantReference(controllerClass)};
\t\tif ( ! class_exists( $controller_class ) ) {
\t\t\treturn;
\t\t}
\t\t$controller = new $controller_class();

`;
}
