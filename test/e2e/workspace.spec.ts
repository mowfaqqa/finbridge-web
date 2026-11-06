import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('onboarding supports keyboard focus and WCAG checks at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 840 });
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ status: 401, json: { code: 'SESSION_REQUIRED' } }));
  await page.route('**/api/v1/auth/options', (route) => route.fulfill({
    json: { localSignIn: true, managedSignIn: false, invitationsEnabled: true },
  }));
  await page.goto('/onboarding');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('seeded SME roles use live reports, audit, and evidence', async ({ page, browser, baseURL }) => {
  const slug = process.env.FINBRIDGE_E2E_WORKSPACE;
  const pack = process.env.FINBRIDGE_E2E_PACK;
  test.skip(!slug || !pack || !process.env.FINBRIDGE_E2E_ORIGIN, 'Set the local fixture identifiers for the live test');
  const root = `/w/${slug}`;

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Business display name')).toBeVisible();
  await page.goto(`${root}/overview`);
  for (const [label, amount] of [['Cash in', '₦85,000.00'], ['Cash out', '₦25,000.00'], ['Net movement', '₦60,000.00']]) {
    await expect(page.getByText(label, { exact: true }).locator('..').getByText(amount, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Show data table' }).click();
  await expect(page.getByRole('table', { name: 'Monthly statement movements in NGN' })).toBeVisible();
  const reportAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(reportAxe.violations).toEqual([]);
  await page.getByRole('link', { name: 'Audit history' }).click();
  await expect(page.getByRole('heading', { name: 'Audit history' })).toBeVisible();
  await expect(page.getByText('Evidence ready', { exact: true })).toBeVisible();

  const operator = await browser.newPage({ baseURL, viewport: { width: 320, height: 840 } });
  try {
    await operator.goto('/onboarding');
    await operator.getByLabel('Local identity').selectOption('operator');
    await operator.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(operator.getByLabel('Business display name')).toBeVisible();
    await operator.goto(`${root}/readiness?pack=${pack}`);
    await expect(operator.getByRole('link', { name: 'Download PDF' })).toBeVisible();
    const menu = operator.getByRole('button', { name: 'Workspace menu' });
    await menu.click();
    const dialog = operator.getByRole('dialog', { name: 'Workspace menu' });
    await expect(dialog.getByRole('link', { name: 'Audit history' })).toHaveCount(0);
    await operator.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    expect(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally {
    await operator.close();
  }
});
