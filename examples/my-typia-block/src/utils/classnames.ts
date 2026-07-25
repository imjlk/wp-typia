/**
 * Conditional classnames utility
 * @param {...any} args
 */
export function classNames(
	...args: ( string | Record< string, boolean > | undefined | null | false )[]
): string {
  const classes: string[] = [];

  for ( const arg of args ) {
    if ( ! arg ) {
      continue;
    }

    if ( typeof arg === 'string' ) {
      classes.push( arg );
    } else if ( typeof arg === 'object' ) {
      for ( const [ key, value ] of Object.entries( arg ) ) {
        if ( value ) {
          classes.push( key );
        }
      }
    }
  }

  return classes.join( ' ' );
}

/**
 * Generate block class with BEM methodology
 * @param blockName
 * @param element
 * @param modifier
 */
export function blockClass(
	blockName: string,
	element?: string,
	modifier?: string | Record< string, boolean >,
): string {
  let className = blockName;

  if ( element ) {
    className += `__${ element }`;
  }

  if ( modifier ) {
    if ( typeof modifier === 'string' ) {
      className += `--${ modifier }`;
    } else {
      for ( const [ mod, enabled ] of Object.entries( modifier ) ) {
        if ( enabled ) {
          className += `--${ mod }`;
        }
      }
    }
  }

  return className;
}
