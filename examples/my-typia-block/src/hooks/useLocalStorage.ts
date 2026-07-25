/* eslint-disable no-console */
import { useState } from 'react';

/**
 * Hook for localStorage with type safety
 * @param key
 * @param initialValue
 */
export function useLocalStorage< T >(
	key: string,
	initialValue: T,
): [ T, ( value: T | ( ( val: T ) => T ) ) => void ] {
  const [ storedValue, setStoredValue ] = useState< T >(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch ( error ) {
      console.error(`Error reading localStorage key "${ key }":`, error);
      return initialValue;
    }
  });

  const setValue = ( value: T | ( ( val: T ) => T ) ) => {
    try {
      const valueToStore =
				value instanceof Function ? value( storedValue ) : value;
      setStoredValue( valueToStore );
      window.localStorage.setItem( key, JSON.stringify( valueToStore ) );
    } catch ( error ) {
      console.error(`Error setting localStorage key "${ key }":`, error);
    }
  };

  return [ storedValue, setValue ];
}
