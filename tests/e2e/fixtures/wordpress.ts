import {
  test as base,
  expect,
  Page,
  FrameLocator,
  Browser,
} from '@playwright/test';

const WORDPRESS_EDITOR_READY_TIMEOUT_MS = 20_000;
const WORDPRESS_BLOCK_REGISTRATION_TIMEOUT_MS = 20_000;
const WORDPRESS_NAVIGATION_TIMEOUT_MS = 20_000;

interface InsertableBlock {
  name: string;
  title: string;
}

export const REFERENCE_BLOCK = {
  name: 'create-block/my-typia-block',
  title: 'My Typia Block',
  editorText: 'My Typia Block - Editor View',
  defaultAttributes: {
    content: '',
    alignment: 'left',
    isVisible: true,
    version: 1,
  },
  updatedAttributes: {
    content: 'Persisted content',
    alignment: 'center',
    isVisible: false,
  },
  frontend: {
    selector: '.my-typia-block-frontend',
    text: 'My Typia Block - Frontend View',
  },
} as const;

export const PERSISTENCE_COUNTER_BLOCK = {
  name: 'create-block/persistence-counter',
  title: 'Persistence Counter',
} as const;

export const PERSISTENCE_LIKE_BUTTON_BLOCK = {
  name: 'create-block/persistence-like-button',
  title: 'Persistence Like Button',
} as const;

export const COMPOUND_PATTERNS_BLOCK = {
  name: 'create-block/compound-patterns',
  title: 'Compound Patterns',
} as const;

export const COMPOUND_PATTERNS_ITEM_BLOCK = {
  name: 'create-block/compound-patterns-item',
  title: 'Compound Patterns Item',
} as const;

export const EXAMPLE_BLOCK = REFERENCE_BLOCK;

export const test = base;

export class WordPressPage {
  constructor(public page: Page) {}

  getEditorCanvas(): FrameLocator {
    return this.page.frameLocator('iframe').first();
  }

  getBlockLocator(blockType: string = EXAMPLE_BLOCK.name) {
    if (blockType === EXAMPLE_BLOCK.name) {
      return this.getEditorCanvas().getByText(EXAMPLE_BLOCK.editorText);
    }

    return this.getEditorCanvas().locator(`[data-type="${blockType}"]`);
  }

  async login(username = 'admin', password = 'password') {
    await this.page.goto(
      '/wp-login.php?redirect_to=%2Fwp-admin%2Fpost-new.php',
      {
        timeout: WORDPRESS_NAVIGATION_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      },
    );

    if (this.page.url().includes('/wp-login.php')) {
      await this.page.fill('#user_login', username);
      await this.page.fill('#user_pass', password);
      await Promise.allSettled([
        this.page.waitForURL((url) => {
          return url.pathname.startsWith('/wp-admin') || url.pathname.startsWith('/wp-login.php');
        }, { timeout: 60_000 }),
        this.page.click('#wp-submit'),
      ]);

      const loginErrors = await this.page.locator('#login_error').allTextContents();
      if (loginErrors.length > 0) {
        throw new Error(`WordPress login failed: ${loginErrors.join(' ')}`);
      }
    }
  }

  async createPost(title = 'Typia Block Test') {
    if (!this.page.url().includes('/wp-admin/post-new.php')) {
      await this.page.goto('/wp-admin/post-new.php', {
        timeout: WORDPRESS_NAVIGATION_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
    }
    await this.waitForEditorReady();

    const titleInput = this.getEditorCanvas().getByRole('textbox', {
      name: 'Add title',
    });
    await titleInput.fill(title);
  }

  async openPostEditor(postId: number) {
    await this.page.goto(`/wp-admin/post.php?post=${postId}&action=edit`, {
      timeout: WORDPRESS_NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await this.waitForEditorReady(WORDPRESS_EDITOR_READY_TIMEOUT_MS);
  }

  async insertBlock(block: InsertableBlock = EXAMPLE_BLOCK) {
    const blockTypeReady = await this.waitForBlockTypeRegistered(block.name);
    if (!blockTypeReady) {
      await this.page.reload({
        timeout: WORDPRESS_NAVIGATION_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      await this.waitForEditorReady(WORDPRESS_EDITOR_READY_TIMEOUT_MS);
    }

    const blockTypeReadyAfterReload =
      blockTypeReady ||
      (await this.waitForBlockTypeRegistered(
        block.name,
        WORDPRESS_BLOCK_REGISTRATION_TIMEOUT_MS,
      ));
    if (!blockTypeReadyAfterReload) {
      throw new Error(
        `Timed out waiting for block type "${block.name}" to register.`,
      );
    }

    await this.dismissWelcomeGuideIfPresent();

    let inserted = false;
    try {
      const inserterButton = this.page
        .getByRole('button', { name: /Block Inserter|Toggle block inserter/i })
        .first();

      await inserterButton.click({ timeout: 5_000 });

      const searchInputCandidates = [
        this.page.getByRole('searchbox').first(),
        this.page.getByRole('textbox', { name: /Search/i }).first(),
        this.page.getByPlaceholder(/Search/i).first(),
      ];

      let searchInput = null;
      for (const candidate of searchInputCandidates) {
        if (await candidate.isVisible().catch(() => false)) {
          searchInput = candidate;
          break;
        }
      }

      if (!searchInput) {
        throw new Error('Block inserter search input is not visible');
      }

      await searchInput.fill(block.title);
      await this.page.getByRole('option', { name: block.title }).first().click({
        timeout: 5_000,
      });

      await this.waitForBlockInEditor(block.name, 5_000);
      inserted = true;
    } catch {
      await this.insertBlockViaStore(block.name);
    }

    if (!inserted) {
      await this.waitForBlockInEditor(block.name);
    }
    await this.selectLatestBlock(block.name);
    await expect(this.getBlockLocator(block.name).first()).toBeVisible();
  }

  async openBlockSettingsSidebar() {
    const closeInserterButton = this.page.getByRole('button', {
      name: /Close Block Inserter/i,
    });
    if (await closeInserterButton.isVisible().catch(() => false)) {
      await closeInserterButton.click();
    }

    const isSidebarOpen = await this.page.evaluate(() => {
      const wp = (window as any).wp;
      return wp?.data?.select('core/edit-post')?.isEditorSidebarOpened?.() === true;
    });

    if (isSidebarOpen) {
      return;
    }

    const settingsButton = this.page.getByRole('button', {
      name: /^Settings$/i,
    });
    await settingsButton.click();

    await this.page.waitForFunction(() => {
      const wp = (window as any).wp;
      return wp?.data?.select('core/edit-post')?.isEditorSidebarOpened?.() === true;
    });
  }

  async updateSelectedBlockAttributes(attributes: Record<string, unknown>) {
    await this.page.evaluate((nextAttributes) => {
      const wp = (window as any).wp;
      const selectedBlock = wp?.data?.select('core/block-editor')?.getSelectedBlock?.();
      const dispatch = wp?.data?.dispatch('core/block-editor');

      if (!selectedBlock?.clientId || !dispatch?.updateBlockAttributes) {
        throw new Error('Unable to update selected block attributes');
      }

      dispatch.updateBlockAttributes(selectedBlock.clientId, nextAttributes);
    }, attributes);

    await this.waitForBlockAttributes(attributes);
  }

  async savePost() {
    await this.page.evaluate(async () => {
      const wp = (window as any).wp;
      const editor = wp?.data?.dispatch('core/editor');
      if (!editor?.savePost) {
        throw new Error('WordPress editor save action is unavailable');
      }

      await editor.savePost();
    });
    await this.waitForEditorIdle();
  }

  async publishPost() {
    await this.waitForExampleBlockPersistenceKey();

    await this.page.evaluate(async () => {
      const wp = (window as any).wp;
      const dispatch = wp?.data?.dispatch('core/editor');
      if (!dispatch?.editPost || !dispatch?.savePost) {
        throw new Error('WordPress editor publish actions are unavailable');
      }

      dispatch.editPost({ status: 'publish' });
      await dispatch.savePost();
    });
    await this.waitForEditorIdle();

    await this.page.waitForFunction(() => {
      const wp = (window as any).wp;
      return wp?.data?.select('core/editor')?.getEditedPostAttribute('status') === 'publish';
    });
  }

  async previewPost(
    {
      loggedIn = true,
      browser,
    }: {
      loggedIn?: boolean;
      browser?: Browser;
    } = {},
  ): Promise<Page> {
    const previewUrl = await this.page.evaluate(() => {
      const wp = (window as any).wp;
      const postId = wp?.data?.select('core/editor')?.getCurrentPostId?.();
      if (!postId) {
        throw new Error('Current post id is unavailable');
      }

      const previewUrl = new URL('/', window.location.origin);
      previewUrl.searchParams.set('p', String(postId));
      return previewUrl.toString();
    });

    if (!loggedIn) {
      const targetBrowser = browser ?? this.page.context().browser();
      if (!targetBrowser) {
        throw new Error(
          'A browser instance is required to open a logged-out preview.',
        );
      }

      const isolatedContext = await targetBrowser.newContext();
      const previewPage = await isolatedContext.newPage();
      previewPage.once('close', () => {
        void isolatedContext.close().catch(() => {});
      });
      await previewPage.goto(previewUrl, {
        timeout: WORDPRESS_NAVIGATION_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      return previewPage;
    }

    const previewPage = await this.page.context().newPage();
    await previewPage.goto(previewUrl, {
      timeout: WORDPRESS_NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    return previewPage;
  }

  async getBlockAttributes(blockType: string = EXAMPLE_BLOCK.name): Promise<Record<string, unknown> | null> {
    return this.page.evaluate((type) => {
      const wp = (window as any).wp;
      if (!wp?.data) {
        return null;
      }

      const blocks = wp.data.select('core/block-editor').getBlocks();
      const block = blocks.find((candidate: any) => candidate.name === type);
      return block ? block.attributes : null;
    }, blockType);
  }

  async getCurrentPostId(): Promise<number> {
    return this.page.evaluate(() => {
      const wp = (window as any).wp;
      const postId = wp?.data?.select('core/editor')?.getCurrentPostId?.();
      if (!postId) {
        throw new Error('Current post id is unavailable');
      }

      return postId as number;
    });
  }

  private async waitForEditorReady(timeout = WORDPRESS_EDITOR_READY_TIMEOUT_MS) {
    const waitForTitleInput = async () => {
      await this.getEditorCanvas().getByRole('textbox', { name: 'Add title' }).waitFor(
        {
          state: 'visible',
          timeout,
        },
      );
    };

    await this.dismissWelcomeGuideIfPresent();

    try {
      await waitForTitleInput();
    } catch {
      await this.page.reload({
        timeout: WORDPRESS_NAVIGATION_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      await this.dismissWelcomeGuideIfPresent();
      await waitForTitleInput();
    }
  }

  private async dismissWelcomeGuideIfPresent() {
    const welcomeGuideDialog = this.page.getByRole('dialog').filter({
      has: this.page.getByRole('button', { name: 'Close' }),
    }).first();

    if (await welcomeGuideDialog.isVisible().catch(() => false)) {
      await welcomeGuideDialog
        .getByRole('button', { name: 'Close' })
        .click({ force: true })
        .catch(() => {});
      await welcomeGuideDialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(
        () => {},
      );
    }
  }

  private async insertBlockViaStore(blockType: string) {
    await this.page.evaluate((name) => {
      const wp = (window as any).wp;
      const createBlock = wp?.blocks?.createBlock;
      const dispatch = wp?.data?.dispatch('core/block-editor');

      if (!createBlock || !dispatch?.insertBlocks || !dispatch?.selectBlock) {
        throw new Error('WordPress block editor insertion APIs are unavailable');
      }

      const block = createBlock(name);
      dispatch.insertBlocks(block);
      dispatch.selectBlock(block.clientId);
    }, blockType);
  }

  private async selectLatestBlock(blockType: string) {
    await this.page.evaluate((type) => {
      const wp = (window as any).wp;
      const select = wp?.data?.select('core/block-editor');
      const dispatch = wp?.data?.dispatch('core/block-editor');
      const blocks = select?.getBlocks?.() ?? [];
      const matchingBlocks = blocks.filter((block: any) => block.name === type);
      const latestBlock = matchingBlocks[matchingBlocks.length - 1];

      if (!latestBlock?.clientId || !dispatch?.selectBlock) {
        throw new Error(`Unable to select latest "${type}" block`);
      }

      dispatch.selectBlock(latestBlock.clientId);
    }, blockType);
  }

  private async waitForBlockAttributes(
    expectedAttributes: Record<string, unknown>,
    blockType: string = EXAMPLE_BLOCK.name,
  ) {
    await this.page.waitForFunction(
      ([type, expected]) => {
        const wp = (window as any).wp;
        const block = wp?.data
          ?.select('core/block-editor')
          ?.getBlocks?.()
          ?.find((candidate: any) => candidate.name === type);

        if (!block?.attributes) {
          return false;
        }

        return Object.entries(expected as Record<string, unknown>).every(
          ([key, value]) => block.attributes[key] === value,
        );
      },
      [blockType, expectedAttributes],
    );
  }

  private async waitForEditorIdle() {
    await this.page.waitForFunction(() => {
      const wp = (window as any).wp;
      const editor = wp?.data?.select('core/editor');
      return Boolean(editor) && !editor.isSavingPost?.() && !editor.isAutosavingPost?.();
    });
  }

  private async waitForExampleBlockPersistenceKey(timeout = 30_000) {
    await this.page.waitForFunction(
      (blockType) => {
        const wp = (window as any).wp;
        const blocks = wp?.data?.select('core/block-editor')?.getBlocks?.() ?? [];
        const exampleBlock = blocks.find(
          (candidate: any) => candidate.name === blockType,
        );

        if (!exampleBlock) {
          return true;
        }

        const id = exampleBlock.attributes?.id;
        return typeof id === 'undefined' || (typeof id === 'string' && id.length > 0);
      },
      EXAMPLE_BLOCK.name,
      { timeout },
    );
  }

  private async waitForBlockTypeRegistered(
    blockType: string,
    timeout = WORDPRESS_BLOCK_REGISTRATION_TIMEOUT_MS,
  ) {
    try {
      await this.page.waitForFunction(
        (type) => {
          const wp = (window as any).wp;
          return Boolean(wp?.blocks?.getBlockType?.(type));
        },
        blockType,
        { timeout },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async waitForBlockInEditor(
    blockType: string,
    timeout = WORDPRESS_BLOCK_REGISTRATION_TIMEOUT_MS,
  ) {
    await this.page.waitForFunction((type) => {
      const wp = (window as any).wp;
      const blocks = wp?.data?.select('core/block-editor')?.getBlocks?.() ?? [];
      return blocks.some((block: any) => block.name === type);
    }, blockType, { timeout });
  }
}

export { expect };
