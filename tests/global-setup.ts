import { chromium, FullConfig } from '@playwright/test';
import wpEnvUtils from '../scripts/wp-env-utils.cjs';

const EXAMPLE_PLUGIN_SLUGS = [
  'my-typia-block',
  'persistence-examples',
  'compound-patterns',
] as const;
const { TEST_WP_ENV_CONFIG, runWpCli } = wpEnvUtils;

async function waitForAdminReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => {
    return (
      window.location.pathname.startsWith('/wp-admin') ||
      Boolean(document.querySelector('#wpadminbar')) ||
      document.body.classList.contains('wp-admin')
    );
  }, { timeout: 60_000 });
}

async function waitForWordPressLogin(
	page: import('@playwright/test').Page,
	baseURL: string,
): Promise<'ready' | 'install'> {
  const startedAt = Date.now();
  const timeoutMs = 60_000;

  while (Date.now() - startedAt < timeoutMs) {
    await page.goto(`${baseURL}/wp-login.php`, {
      waitUntil: 'domcontentloaded',
    });

    const currentUrl = page.url();
    const pageTitle = await page.title();
    const hasLoginForm = await page.locator('#loginform').isVisible().catch(
      () => false,
    );
    const hasAdminBar = await page.locator('#wpadminbar').isVisible().catch(
      () => false,
    );

    if (hasLoginForm || hasAdminBar) {
      return 'ready';
    }

    const looksLikeInstall =
			currentUrl.includes('/wp-admin/install.php') ||
			(pageTitle.includes('WordPress') && pageTitle.includes('Installation'));
    if (looksLikeInstall) {
      return 'install';
    }

    await page.waitForTimeout(2_000);
  }

  throw new Error(
    'WordPress test environment did not finish booting before timeout.',
  );
}

function ensureWordPressInstalled(baseURL: string) {
  try {
    runWpCli(['core', 'is-installed'], { configPath: TEST_WP_ENV_CONFIG });
    return;
  } catch {
    runWpCli(
      [
        'core',
        'install',
        `--url=${baseURL}`,
        '--title=wp-typia-boilerplate',
        '--admin_user=admin',
        '--admin_password=password',
        '--admin_email=admin@example.com',
        '--skip-email',
      ],
      { configPath: TEST_WP_ENV_CONFIG },
    );
  }
}

function ensureExamplePluginsActive() {
	// wp-env cache can restore a DB where example plugins are mounted but inactive.
  for (const pluginSlug of EXAMPLE_PLUGIN_SLUGS) {
    try {
      runWpCli(['plugin', 'is-active', pluginSlug], {
        configPath: TEST_WP_ENV_CONFIG,
      });
    } catch {
      runWpCli(['plugin', 'activate', pluginSlug], {
        configPath: TEST_WP_ENV_CONFIG,
      });
    }
  }
}

async function globalSetup(config: FullConfig) {
  console.log('🚀 Setting up WordPress test environment...');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const project = config.projects?.[0];
  const baseURL = project?.use?.baseURL;
  if (!baseURL) {
    throw new Error('Playwright config missing projects or baseURL');
  }

  try {
    const bootstrapState = await waitForWordPressLogin(page, baseURL);
    if (bootstrapState === 'install') {
      ensureWordPressInstalled(baseURL);
      await waitForWordPressLogin(page, baseURL);
    }
    ensureExamplePluginsActive();

    // Login to WordPress
    await page.goto(`${baseURL}/wp-login.php`, {
      waitUntil: 'domcontentloaded',
    });
    await page.fill('#user_login', 'admin');
    await page.fill('#user_pass', 'password');
    await Promise.allSettled([
      page.waitForURL((url) => {
        return url.pathname.startsWith('/wp-admin') || url.pathname.startsWith('/wp-login.php');
      }, { timeout: 60_000 }),
      page.click('#wp-submit'),
    ]);

    const loginErrors = await page.locator('#login_error').allTextContents();
    if (loginErrors.length > 0) {
      throw new Error(`WordPress login failed: ${loginErrors.join(' ')}`);
    }

    await page.goto(`${baseURL}/wp-admin/`, { waitUntil: 'domcontentloaded' });

    // Wait for login to complete
    await waitForAdminReady(page);
    console.log('✅ WordPress environment ready');

  } catch (error) {
    console.error('❌ Failed to setup WordPress environment:', error);
    console.log(
      'Please ensure wp-env is running: bun run examples:wp-env:start:test',
    );
    process.exit(1);
  }

  await browser.close();
}

export default globalSetup;
