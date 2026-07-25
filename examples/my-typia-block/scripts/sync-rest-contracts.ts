/* eslint-disable no-console */
import { syncTypeSchemas } from '@wp-typia/block-runtime/metadata-core';

const CONTRACTS = [
  {
    baseName: 'counter-query',
    sourceTypeName: 'MyTypiaBlockCounterQuery',
  },
  {
    baseName: 'increment-request',
    sourceTypeName: 'MyTypiaBlockIncrementRequest',
  },
  {
    baseName: 'counter-response',
    sourceTypeName: 'MyTypiaBlockCounterResponse',
  },
] as const;

function parseCliOptions( argv: string[] ) {
  const options = {
    check: false,
  };

  for ( const argument of argv ) {
    if ( argument === '--check' ) {
      options.check = true;
      continue;
    }

    throw new Error( `Unknown sync-rest flag: ${ argument }` );
  }

  return options;
}

async function main() {
  const options = parseCliOptions( process.argv.slice( 2 ) );

  for ( const contract of CONTRACTS ) {
    await syncTypeSchemas(
      {
        jsonSchemaFile: `src/api-schemas/${ contract.baseName }.schema.json`,
        openApiFile: `src/api-schemas/${ contract.baseName }.openapi.json`,
        sourceTypeName: contract.sourceTypeName,
        typesFile: 'src/api-types.ts',
      },
      {
        check: options.check,
      },
    );
  }

  console.log(
    options.check
      ? '✅ REST contract schemas are already up to date with the TypeScript types!'
      : '✅ REST contract schemas generated from TypeScript types!',
  );
}

main().catch(( error ) => {
  console.error('❌ REST contract sync failed:', error);
  process.exit(1);
});
