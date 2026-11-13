import { expect, test } from '@playwright/test';

test('browser back preserves the N빵 amount draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'N빵하기', exact: true }).click();
  await page.getByLabel('참가자 1 닉네임', { exact: true }).fill('가');
  await page.getByLabel('참가자 2 닉네임', { exact: true }).fill('나');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '+1만원', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('함께할 사람을 알려 주세요');
  await expect(page.getByLabel('참가자 1 닉네임', { exact: true })).toHaveValue('가');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.locator('#amount')).toHaveText('10,000원');
});

test('mobile checklist shows five shared questions and clears the previous answer', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: '한명뽑기', exact: true }).click();
  await expect(page.getByRole('button', { name: '참가자 한 명 줄이기' })).toBeDisabled();
  const firstName = page.getByLabel('참가자 1 닉네임', { exact: true });
  await firstName.fill('나');
  await page.getByLabel('참가자 2 닉네임', { exact: true }).fill('나');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(firstName).toHaveAttribute('aria-invalid', 'true');
  await firstName.fill('가');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '내 질문 시작', exact: true }).click();
  const checkboxes = page.getByRole('checkbox');
  await expect(checkboxes).toHaveCount(5);
  const questions = await page.locator('.question').allTextContents();
  expect(questions[0]).toContain('오늘 약속 시간보다 미리 도착했다');
  expect(questions[1]).toContain('오늘 약속 계획이나 예약을 맡았다');
  expect(new Set(questions).size).toBe(5);
  await expect(page.getByRole('group', { name: '최근 3개월' }).getByRole('checkbox')).toHaveCount(3);
  await checkboxes.first().check();
  await expect(page.locator('.score')).toHaveText('현재 점수 85점');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '응답 완료' }).click();
  await expect(checkboxes).toHaveCount(0);
  await page.getByRole('button', { name: '내 질문 시작', exact: true }).click();
  expect(await page.locator('.question').allTextContents()).toEqual(questions);
  await expect(page.locator('.score')).toHaveText('현재 점수 100점');
  await expect(checkboxes.first()).not.toBeChecked();
  await page.getByRole('button', { name: '응답 완료' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('모두 차례를 마쳤어요');
});
