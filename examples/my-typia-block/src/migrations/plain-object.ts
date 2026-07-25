/**
 * Returns true for any non-null object value that is not an array.
 * @param value
 */
export function isNonArrayObject(
	value: unknown,
): value is Record< string, unknown > {
  return (
		typeof value === 'object' && value !== null && ! Array.isArray( value )
	);
}
