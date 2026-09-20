import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin-a@testbiz.local';
const ADMIN_PASSWORD = 'AdminTest123';
const OPERATOR_EMAIL = 'operator-a@testbiz.local';
const OPERATOR_PASSWORD = 'OperatorTest123';

test.describe('auth smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.context().clearCookies();
  });

  test('redirects unauthenticated /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test('valid admin login redirects to dashboard and loads the nav', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    // Regression guard: the nav must actually render its links and the user
    // footer after a client-side router.push — not an empty list or a stuck
    // skeleton. Previously the server-supplied initialUser was never refreshed
    // on client navigation, so the nav stayed blank.
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /payroll/i })).toBeVisible();
    await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('operator does not see Settings nav item', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(OPERATOR_EMAIL);
    await page.getByLabel('Password').fill(OPERATOR_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const settingsLink = page.getByRole('link', { name: /settings/i });
    await expect(settingsLink).not.toBeVisible();
  });
});
