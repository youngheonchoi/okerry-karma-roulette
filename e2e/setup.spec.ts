import { expect, test } from '@playwright/test';

test('browser and in-app back preserve drafts, and mode selection allows exit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button')).toHaveCount(2);
  await expect(page.locator('.mode-card')).toHaveText(['한명뽑기', 'N빵하기']);
  await expect(page.locator('footer')).toHaveCount(0);
  await page.getByRole('button', { name: 'N빵하기', exact: true }).click();
  await page.getByLabel('참가자 1 닉네임', { exact: true }).fill('가');
  await page.getByLabel('참가자 2 닉네임', { exact: true }).fill('나');
  await page.getByRole('button', { name: '총액 입력', exact: true }).click();
  await page.getByLabel('총 결제 금액 (원)').fill('12345');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('함께할 사람을 알려 주세요');
  await expect(page.getByLabel('참가자 1 닉네임', { exact: true })).toHaveValue('가');
  await page.getByRole('button', { name: '총액 입력', exact: true }).click();
  await expect(page.getByLabel('총 결제 금액 (원)')).toHaveValue('12345');
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('오늘 계산 업보로 정해볼까요?');
  await expect.poll(() => page.evaluate(() => history.state?.['karma-roulette-navigation'])).toBeUndefined();
});

test('minimum deletion, duplicate errors and policy gates hold on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: 'N빵하기', exact: true }).click();
  await expect(page.getByRole('button', { name: /삭제/ }).first()).toBeDisabled();
  await page.getByRole('button', { name: '참가자 추가', exact: true }).click();
  const names = [1, 2, 3].map((i) => page.getByLabel(`참가자 ${i} 닉네임`, { exact: true }));
  await expect(names[2]!).toBeFocused();
  await names[0]!.fill('중복');
  await names[1]!.fill('중복');
  await page.getByRole('button', { name: '총액 입력', exact: true }).click();
  await expect(names[0]!).toHaveAttribute('aria-invalid', 'true');
  await expect(names[0]!).toBeFocused();
  await names[0]!.fill('다른 이름');
  await expect(names[1]!).toHaveAttribute('aria-invalid', 'false');
  await expect(names[2]!).toHaveAttribute('aria-invalid', 'true');
  await names[2]!.fill('마지막');
  await page.getByRole('button', { name: '총액 입력', exact: true }).click();
  await expect(page.getByRole('button', { name: '업보 청문회 시작', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('오늘 계산 업보로 정해볼까요?');
});
