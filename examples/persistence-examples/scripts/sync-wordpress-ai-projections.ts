/* eslint-disable no-console */
import { syncCounterWordPressAiArtifacts } from './wordpress-ai-projections';

function parseCliOptions( argv: string[] ) {
  const options = {
    check: false,
  };

  for ( const argument of argv ) {
    if ( argument === '--check' ) {
      options.check = true;
      continue;
    }

    throw new Error( `Unknown sync-ai flag: ${ argument }` );
  }

  return options;
}

async function main() {
  const options = parseCliOptions( process.argv.slice( 2 ) );
  await syncCounterWordPressAiArtifacts({
    check: options.check,
  });
  console.log(
    options.check
      ? '✅ WordPress AI projection artifacts are already up to date with the persistence counter contracts!'
      : '✅ WordPress AI projection artifacts generated from the persistence counter contracts!',
  );
}

main().catch(( error ) => {
  console.error('❌ WordPress AI projection sync failed:', error);
  process.exit(1);
});
