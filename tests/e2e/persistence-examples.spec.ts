import {
  test,
  expect,
  PERSISTENCE_COUNTER_BLOCK,
  PERSISTENCE_LIKE_BUTTON_BLOCK,
  WordPressPage,
} from './fixtures/wordpress';
import { requestWordPressRest } from './fixtures/rest';

interface CounterContext {
  postId: number;
  resourceKey: string;
}

interface CounterBootstrapContext {
  canWrite: boolean;
  publicWriteExpiresAt: number;
  publicWriteToken?: string;
}

interface LikeContext {
  postId: number;
  resourceKey: string;
  restNonce?: string;
}

function createRequestId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function getCounterContext(previewPage: Awaited<ReturnType<WordPressPage['previewPost']>>): Promise<CounterContext> {
  return previewPage.evaluate(() => {
    const interactiveRoot = document.querySelector('[data-wp-interactive="persistenceExamplesCounter"]');
    if (!(interactiveRoot instanceof HTMLElement)) {
      throw new Error('Unable to locate the counter interactive root.');
    }

    const rawContext = interactiveRoot.getAttribute('data-wp-context');
    if (!rawContext) {
      throw new Error('Missing counter block context.');
    }

    const context = JSON.parse(rawContext) as {
      postId?: unknown;
      resourceKey?: unknown;
    };

    if (typeof context.postId !== 'number' || context.postId <= 0) {
      throw new Error('Missing counter post id.');
    }
    if (typeof context.resourceKey !== 'string' || context.resourceKey.length === 0) {
      throw new Error('Missing counter resource key.');
    }
    return {
      postId: context.postId,
      resourceKey: context.resourceKey,
    };
  });
}

async function readCounterBootstrap(
  previewPage: Awaited<ReturnType<WordPressPage['previewPost']>>,
  context: CounterContext,
) {
  return requestWordPressRest(previewPage, {
    routePath: '/persistence-examples/v1/counter/bootstrap',
    params: {
      postId: String(context.postId),
      resourceKey: context.resourceKey,
    },
    headers: {
      Accept: 'application/json',
    },
  });
}

async function getLikeContext(previewPage: Awaited<ReturnType<WordPressPage['previewPost']>>): Promise<LikeContext> {
  return previewPage.evaluate(() => {
    const interactiveRoot = document.querySelector('[data-wp-interactive="persistenceExamplesLikeButton"]');
    if (!(interactiveRoot instanceof HTMLElement)) {
      throw new Error('Unable to locate the like-button interactive root.');
    }

    const rawContext = interactiveRoot.getAttribute('data-wp-context');
    if (!rawContext) {
      throw new Error('Missing like-button block context.');
    }

    const context = JSON.parse(rawContext) as {
      postId?: unknown;
      resourceKey?: unknown;
      restNonce?: unknown;
    };

    if (typeof context.postId !== 'number' || context.postId <= 0) {
      throw new Error('Missing like-button post id.');
    }
    if (typeof context.resourceKey !== 'string' || context.resourceKey.length === 0) {
      throw new Error('Missing like-button resource key.');
    }

    return {
      postId: context.postId,
      resourceKey: context.resourceKey,
      restNonce: typeof context.restNonce === 'string' ? context.restNonce : undefined,
    };
  });
}

async function readCounter(
  previewPage: Awaited<ReturnType<WordPressPage['previewPost']>>,
  context: CounterContext,
) {
  return requestWordPressRest(previewPage, {
    routePath: '/persistence-examples/v1/counter',
    params: {
      postId: String(context.postId),
      resourceKey: context.resourceKey,
    },
    headers: {
      Accept: 'application/json',
    },
  });
}

async function writeCounter(
  previewPage: Awaited<ReturnType<WordPressPage['previewPost']>>,
  body: Record<string, unknown>,
) {
  return requestWordPressRest(previewPage, {
    routePath: '/persistence-examples/v1/counter',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body,
  });
}

async function toggleLikeDirect(
  previewPage: Awaited<ReturnType<WordPressPage['previewPost']>>,
  context: LikeContext,
  withNonce: boolean,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (withNonce && typeof context.restNonce === 'string') {
    headers['X-WP-Nonce'] = context.restNonce;
  }

  return requestWordPressRest(previewPage, {
    routePath: '/persistence-examples/v1/likes',
    method: 'POST',
    headers,
    body: {
      postId: context.postId,
      resourceKey: context.resourceKey,
    },
  });
}

test.describe('Persistence examples', () => {
  test.describe.configure({ mode: 'serial' });

  let wpPage: WordPressPage;

  test.beforeEach(async ({ page }) => {
    wpPage = new WordPressPage(page);
    await wpPage.login();
  });

  test('public counter uses signed tokens and rejects direct untokened writes', async () => {
    test.setTimeout(30_000);

    await wpPage.createPost('Persistence Counter Example');
    await wpPage.insertBlock(PERSISTENCE_COUNTER_BLOCK);
    await wpPage.publishPost();

    const previewPage = await wpPage.previewPost();
    const persistButton = previewPage.getByRole('button', { name: 'Persist Count' });
    const counterValue = previewPage.locator('.persistence-counter-frontend__count');
    const counterContext = await getCounterContext(previewPage);

    await previewPage.waitForFunction(
      () => document.documentElement.dataset.persistenceCounterHydrated === 'true',
      undefined,
      { timeout: 10_000 },
    );
    await expect(persistButton).toBeVisible();
    await expect.poll(async () => persistButton.isEnabled(), { timeout: 10_000 }).toBe(true);
    await expect(counterValue).toHaveText('0');

    await expect
      .poll(async () => {
        const result = await readCounterBootstrap(previewPage, counterContext);
        const body = JSON.parse(result.body) as {
          publicWriteToken?: string;
        };
        return typeof body.publicWriteToken === 'string' && body.publicWriteToken.length > 0;
      })
      .toBe(true);

    const counterBootstrap = JSON.parse(
      (await readCounterBootstrap(previewPage, counterContext)).body,
    ) as CounterBootstrapContext;
    if (
      typeof counterBootstrap.publicWriteToken !== 'string' ||
      counterBootstrap.publicWriteToken.length === 0
    ) {
      throw new Error('Missing counter public write token from bootstrap response.');
    }
    if (
      typeof counterBootstrap.publicWriteExpiresAt !== 'number' ||
      counterBootstrap.publicWriteExpiresAt <= 0
    ) {
      throw new Error('Missing counter bootstrap expiry.');
    }

    await persistButton.click();
    await expect(counterValue).toHaveText('1', { timeout: 10_000 });
    await expect
      .poll(async () => {
        const result = await readCounter(previewPage, counterContext);
        return JSON.parse(result.body).count as number;
      })
      .toBe(1);

    const replayRequestId = createRequestId();
    const firstReplayAttempt = await writeCounter(previewPage, {
      delta: 1,
      postId: counterContext.postId,
      publicWriteRequestId: replayRequestId,
      publicWriteToken: counterBootstrap.publicWriteToken,
      resourceKey: counterContext.resourceKey,
    });
    expect(firstReplayAttempt.status).toBe(200);

    const secondReplayAttempt = await writeCounter(previewPage, {
      delta: 1,
      postId: counterContext.postId,
      publicWriteRequestId: replayRequestId,
      publicWriteToken: counterBootstrap.publicWriteToken,
      resourceKey: counterContext.resourceKey,
    });
    expect(secondReplayAttempt.status).toBe(409);

    const missingToken = await writeCounter(previewPage, {
      delta: 1,
      postId: counterContext.postId,
      publicWriteRequestId: createRequestId(),
      resourceKey: counterContext.resourceKey,
    });
    expect(missingToken.status).toBe(403);

    const missingRequestId = await writeCounter(previewPage, {
      delta: 1,
      postId: counterContext.postId,
      publicWriteToken: counterBootstrap.publicWriteToken,
      resourceKey: counterContext.resourceKey,
    });
    expect(missingRequestId.status).toBe(403);

    const tamperedToken = await writeCounter(previewPage, {
      delta: 1,
      postId: counterContext.postId,
      publicWriteRequestId: createRequestId(),
      publicWriteToken: `${counterBootstrap.publicWriteToken}x`,
      resourceKey: counterContext.resourceKey,
    });
    expect(tamperedToken.status).toBe(403);

    const waitForExpiryMs = Math.max(
      counterBootstrap.publicWriteExpiresAt * 1000 - Date.now() + 1_500,
      0,
    );
    await previewPage.waitForTimeout(waitForExpiryMs);
    const expiredToken = await writeCounter(previewPage, {
      delta: 1,
      postId: counterContext.postId,
      publicWriteRequestId: createRequestId(),
      publicWriteToken: counterBootstrap.publicWriteToken,
      resourceKey: counterContext.resourceKey,
    });
    expect(expiredToken.status).toBe(403);

    await previewPage.reload({ waitUntil: 'domcontentloaded' });
    await previewPage.waitForFunction(
      () => document.documentElement.dataset.persistenceCounterHydrated === 'true',
      undefined,
      { timeout: 10_000 },
    );
    await expect(previewPage.locator('.persistence-counter-frontend__count')).toHaveText('2', {
      timeout: 10_000,
    });

    await previewPage.close();
  });

  test('authenticated like-button blocks logged-out writes and supports logged-in toggles', async ({ browser }) => {
    await wpPage.createPost('Persistence Like Button Example');
    await wpPage.insertBlock(PERSISTENCE_LIKE_BUTTON_BLOCK);
    await wpPage.publishPost();

    const loggedOutPreview = await wpPage.previewPost({ loggedIn: false, browser });
    const loggedOutButton = loggedOutPreview.getByRole('button', { name: 'Like this' });
    await loggedOutPreview.waitForFunction(
      () => document.documentElement.dataset.persistenceLikeButtonHydrated === 'true',
      undefined,
      { timeout: 10_000 },
    );
    await expect(loggedOutButton).toBeDisabled();

    const loggedOutContext = await getLikeContext(loggedOutPreview);
    const loggedOutPost = await toggleLikeDirect(loggedOutPreview, loggedOutContext, false);
    expect([401, 403]).toContain(loggedOutPost.status);
    await loggedOutPreview.close();

    const previewPage = await wpPage.previewPost();
    const likeButton = previewPage.getByRole('button', { name: 'Like this' });
    const likeCount = previewPage.locator('.persistence-like-button-frontend__count');
    const likeContext = await getLikeContext(previewPage);

    await previewPage.waitForFunction(
      () => document.documentElement.dataset.persistenceLikeButtonHydrated === 'true',
      undefined,
      { timeout: 10_000 },
    );
    await expect(likeButton).toBeVisible();
    await expect(likeCount).toHaveText('0');

    const editorRestNonce = await wpPage.page.evaluate(() => {
      const wpApiSettings = (window as typeof window & {
        wpApiSettings?: { nonce?: unknown };
      }).wpApiSettings;

      return typeof wpApiSettings?.nonce === 'string' ? wpApiSettings.nonce : '';
    });
    if (editorRestNonce.length === 0) {
      throw new Error('Missing editor REST nonce for authenticated like-button test.');
    }

    const likePost = await toggleLikeDirect(
      wpPage.page,
      {
        ...likeContext,
        restNonce: editorRestNonce,
      },
      true,
    );
    expect(likePost.status).toBe(200);
    await previewPage.reload({ waitUntil: 'domcontentloaded' });
    await previewPage.waitForFunction(
      () => document.documentElement.dataset.persistenceLikeButtonHydrated === 'true',
      undefined,
      { timeout: 10_000 },
    );
    await expect(previewPage.locator('.persistence-like-button-frontend__count')).toHaveText('1');

    const unlikePost = await toggleLikeDirect(
      wpPage.page,
      {
        ...likeContext,
        restNonce: editorRestNonce,
      },
      true,
    );
    expect(unlikePost.status).toBe(200);

    await previewPage.reload({ waitUntil: 'domcontentloaded' });
    await previewPage.waitForFunction(
      () => document.documentElement.dataset.persistenceLikeButtonHydrated === 'true',
      undefined,
      { timeout: 10_000 },
    );
    await expect(previewPage.getByRole('button', { name: 'Like this' })).toBeVisible();
    await expect(previewPage.locator('.persistence-like-button-frontend__count')).toHaveText('0');

    await previewPage.close();
  });
});
