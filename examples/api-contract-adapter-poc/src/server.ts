import { startCounterAdapterServer } from './counter-adapter';

const server = await startCounterAdapterServer();
let isShuttingDown = false;

console.log(
  `REST contract adapter PoC listening on ${server.url}${server.routeTable[0]?.path ?? ''}`,
);

async function shutdown(): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  try {
    await server.close();
    process.exit(0);
  } catch (error) {
    console.error(
      'Failed to shut down the REST contract adapter PoC cleanly.',
      error,
    );
    process.exit(1);
  }
}

for (const signal of [ 'SIGINT', 'SIGTERM' ] as const) {
  process.once(signal, () => {
    void shutdown();
  });
}
