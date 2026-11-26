import { expect, test } from '@playwright/test'

test.describe('GDI-VS unauthenticated entry', () => {
  test('renders the sign-in form with labelled required controls', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Integrity you can inspect.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Organisation slug')).toHaveAttribute('required', '')
    await expect(page.getByLabel('Email address')).toHaveAttribute('type', 'email')
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password')
    await expect(page.getByRole('button', { name: 'Sign in securely' })).toBeVisible()
  })

  test('provides a working skip link to the sign-in form', async ({ page }) => {
    await page.goto('/')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeVisible()
    await skip.focus()
    await expect(skip).toBeFocused()
    await skip.press('Enter')
    await expect(page.locator('#login-form')).toBeFocused()
  })

  test('switches the sign-in interface to Hindi', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Language').selectOption('hi-IN')
    await expect(page.getByRole('heading', { name: 'साइन इन' })).toBeVisible()
    await expect(page.getByLabel('ईमेल पता')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi-IN')
  })

  test('does not submit an empty sign-in form', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in securely' }).click()
    await expect(page.getByLabel('Organisation slug')).toBeFocused()
    await expect(page).toHaveURL(/\/$/)
  })
})


test('shows an accessible error when the API rejects credentials', async ({ page }) => {
  await page.route('**/api/v1/auth/login', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Invalid credentials' }),
  }))
  await page.goto('/')
  await page.getByLabel('Organisation slug').fill('example-org')
  await page.getByLabel('Email address').fill('person@example.org')
  await page.getByLabel('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign in securely' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('persists the selected locale after a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Language').selectOption('hi-IN')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'साइन इन' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi-IN')
})

test('renders a safe unavailable state for an unknown public verification token', async ({ page }) => {
  await page.route('**/api/v1/public-verification/unknown-token', route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Verification reference not found' }),
  }))
  await page.goto('/verify/unknown-token')
  await expect(page.getByRole('heading', { name: 'Document verification' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unable to retrieve this record' })).toBeVisible()
  await expect(page.getByText('Verification reference not found')).toBeVisible()
})
