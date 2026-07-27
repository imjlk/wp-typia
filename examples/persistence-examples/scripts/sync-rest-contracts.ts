/* eslint-disable no-console */
import path from 'node:path';

import {
  syncEndpointClient,
  syncRestOpenApi,
  syncTypeSchemas,
} from '@wp-typia/block-runtime/metadata-core';

import { BLOCKS } from './block-config';

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

  for ( const block of BLOCKS ) {
    const contracts = block.restManifest.contracts;

    for ( const [ baseName, contract ] of Object.entries( contracts ) ) {
      await syncTypeSchemas(
        {
          jsonSchemaFile: path.join(
            'src',
            'blocks',
            block.slug,
            'api-schemas',
            `${ baseName }.schema.json`,
          ),
          openApiFile: path.join(
            'src',
            'blocks',
            block.slug,
            'api-schemas',
            `${ baseName }.openapi.json`,
          ),
          sourceTypeName: contract.sourceTypeName,
          typesFile: block.apiTypesFile,
        },
        {
          check: options.check,
        },
      );
    }

    await syncRestOpenApi(
      {
        manifest: block.restManifest,
        openApiFile: block.openApiFile,
        typesFile: block.apiTypesFile,
      },
      {
        check: options.check,
      },
    );

    await syncEndpointClient(
      {
        clientFile: path.join('src', 'blocks', block.slug, 'api-client.ts'),
        manifest: block.restManifest,
        typesFile: block.apiTypesFile,
      },
      {
        check: options.check,
      },
    );
  }

  console.log(
    options.check
      ? '✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents are already up to date with the TypeScript types!'
      : '✅ REST contract schemas, portable API clients, and endpoint-aware OpenAPI documents generated from TypeScript types!',
  );
}

main().catch(( error ) => {
  console.error('❌ REST contract sync failed:', error);
  process.exit(1);
});
