import {
  test,
  expect,
  EXAMPLE_BLOCK,
  WordPressPage,
} from './fixtures/wordpress';

test.describe('WordPress Typia block smoke', () => {
  test.describe.configure({ mode: 'serial' });

  let wpPage: WordPressPage;

  test.beforeEach(async ({ page }) => {
    wpPage = new WordPressPage(page);
    await wpPage.login();
    await wpPage.createPost('Typia Block Test');
  });

  test('insert + default attributes', async () => {
    await wpPage.insertBlock();

    const block = wpPage.getBlockLocator();
    await expect(block).toBeVisible();

    const attributes = await wpPage.getBlockAttributes();
    expect(attributes).toMatchObject(EXAMPLE_BLOCK.defaultAttributes);
  });

  test('valid update + save + reopen persists attributes', async () => {
    await wpPage.insertBlock();
    await wpPage.updateSelectedBlockAttributes(EXAMPLE_BLOCK.updatedAttributes);
    await wpPage.savePost();

    const postId = await wpPage.getCurrentPostId();
    await wpPage.openPostEditor(postId);

    const attributes = await wpPage.getBlockAttributes();
    expect(attributes).toMatchObject(EXAMPLE_BLOCK.updatedAttributes);
  });

  test('helper-driven inspector controls update manifest-backed attributes', async () => {
    await wpPage.insertBlock();
    await wpPage.openBlockSettingsSidebar();

    await wpPage.page.getByRole('combobox', { name: 'Font Size' }).selectOption('xlarge');
    await wpPage.page.getByRole('combobox', { name: 'Text Color' }).selectOption('inherit');
    await wpPage.page.getByRole('combobox', { name: 'Background Color' }).selectOption('unset');
    await wpPage.page.getByRole('combobox', { name: 'Aspect Ratio' }).selectOption('1/1');
    await wpPage.page.getByRole('spinbutton', { name: 'Border Radius' }).fill('12');
    await wpPage.page.getByRole('checkbox', { name: 'Visible' }).uncheck();

    const attributes = await wpPage.getBlockAttributes();
    expect(attributes).toMatchObject({
      aspectRatio: '1/1',
      backgroundColor: 'unset',
      borderRadius: 12,
      fontSize: 'xlarge',
      isVisible: false,
      textColor: 'inherit',
    });
  });

  test('publish + frontend render', async () => {
    await wpPage.insertBlock();
    await wpPage.publishPost();

    const previewPage = await wpPage.previewPost();
    const frontendBlock = previewPage.locator(EXAMPLE_BLOCK.frontend.selector);

    await expect(frontendBlock).toBeVisible();
    await expect(frontendBlock).toContainText(/My Typia Block [–-] Frontend View/);

    await previewPage.close();
  });

  test('invalid attributes surface validation errors in the editor', async () => {
    await wpPage.insertBlock();
    await wpPage.updateSelectedBlockAttributes({ alignment: 123 as unknown as string });

    const validationNotice = wpPage.page
      .locator('.components-notice')
      .filter({ hasText: 'Validation Errors:' })
      .first();

    await expect(validationNotice).toBeVisible();
    await expect(validationNotice.getByText(/alignment:/).first()).toBeVisible();
  });
});
