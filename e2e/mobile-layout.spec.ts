import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Only intercepted browser responses use these fixtures. Production policy stays null.
async function useFixturePolicy(page: Page) {
  await page.route('**/src/policy.ts', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export const policy = {
        questions: { decision: 'e2e-only', version: 'fixture', maximumScore: null,
          questions: Array.from({length: 16}, (_, i) => ({ id: 'fixture-' + i,
            category: '레이아웃 테스트', text: '긴 문항도 줄바꿈되어 편안하게 읽을 수 있는지 확인하는 테스트 문항 ' + (i + 1),
            weight: i % 2 ? -20n : 30n })) },
        inputs: { decision: 'e2e-only', maximumNicknameLength: 20, maximumAmount: 99999999n,
          normalizeNickname: s => s.trim().normalize('NFC'),
          countCharacters: s => [...new Intl.Segmenter('ko', {granularity:'grapheme'}).segment(s)].length },
        restart: { decision: 'e2e-only', preserveAmount: true }
      };
      export const pendingPolicies = [];
    `,
  }));
}

async function assertLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const problems = await page.locator('button, summary, .mode-card, .question, input:not([type="radio"]):not([type="checkbox"])').evaluateAll((nodes) => {
    return nodes.flatMap((node) => {
      const element = node as HTMLElement;
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return [];
      const label = element.textContent?.trim().slice(0, 30) || element.id;
      const issues = [];
      if (box.width < 44 || box.height < 44) issues.push(`${label}: small target ${box.width}x${box.height}`);
      if (box.left < -1 || box.right > innerWidth + 1) issues.push(`${label}: outside viewport`);
      if (!(element instanceof HTMLInputElement) && element.scrollWidth > element.clientWidth + 1) issues.push(`${label}: clipped text`);
      return issues;
    });
  });
  expect(problems).toEqual([]);
  const tinyText = await page.locator('main *').evaluateAll((nodes) => nodes.flatMap((node) => {
    if (!node.getBoundingClientRect().width || ![...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) return [];
    return parseFloat(getComputedStyle(node).fontSize) <= 11 ? [node.textContent?.slice(0, 30)] : [];
  }));
  expect(tinyText).toEqual([]);
}

async function setUp(page: Page, count = 2, mode: 'solo' | 'split' = 'solo') {
  await page.getByRole('button', { name: mode === 'solo' ? '한명뽑기' : 'N빵하기', exact: true }).click();
  for (let index = 2; index < count; index++) {
    await page.getByRole('button', { name: '참가자 추가', exact: true }).click();
  }
  for (let index = 1; index <= count; index++) {
    await page.getByLabel(`참가자 ${index} 닉네임`, { exact: true }).fill(`${index}가나다라마바사아자차카타파하가나다라`);
  }
}

for (const viewport of [
  { width: 320, height: 568 }, { width: 360, height: 640 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 568, height: 320 }, { width: 768, height: 360 },
]) {
  for (const fontSize of [100, 200]) {
    test(`${viewport.width}x${viewport.height}, text ${fontSize}%: setup to result and confirmation`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await useFixturePolicy(page);
      await page.goto('/');
      await page.evaluate((size) => { document.documentElement.style.fontSize = `${size}%`; }, fontSize);
      await assertLayout(page);
      if (fontSize === 100) {
        const cards = await page.locator('.mode-card').evaluateAll((nodes) => nodes.map((node) => {
          const { width, height, top } = node.getBoundingClientRect();
          return { width, height, top };
        }));
        for (const card of cards) expect(Math.abs(card.width - card.height)).toBeLessThan(1);
        expect(cards[0]!.top).toBe(cards[1]!.top);
      }
      if (viewport.width === 390 && fontSize === 100) await page.screenshot({ path: info.outputPath('mode.png'), fullPage: true });
      await setUp(page);
      await assertLayout(page);
      await page.getByRole('button', { name: '업보 청문회 시작', exact: true }).click();
      await assertLayout(page);
      for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: '내 질문 시작', exact: true }).click();
        await assertLayout(page);
        if (viewport.width === 390 && fontSize === 100 && i === 0) await page.screenshot({ path: info.outputPath('questions.png'), fullPage: true });
        await page.getByRole('checkbox').first().check();
        await page.getByRole('button', { name: '화면 가리기', exact: true }).first().click();
        await expect(page.getByRole('checkbox')).toHaveCount(0);
        await page.getByRole('button', { name: '내 질문 시작', exact: true }).click();
        await page.getByRole('button', { name: '응답 완료', exact: true }).click();
      }
      await assertLayout(page);
      await page.getByRole('button', { name: '룰렛 확인', exact: true }).click();
      await assertLayout(page);
      const wheelLabels = await page.locator('.wheel-number').evaluateAll((nodes) => nodes.every((node) => {
        const label = node.getBoundingClientRect();
        const wheel = node.parentElement!.getBoundingClientRect();
        return label.left >= wheel.left && label.right <= wheel.right && label.top >= wheel.top && label.bottom <= wheel.bottom;
      }));
      expect(wheelLabels).toBe(true);
      if (viewport.width === 390 && fontSize === 100) await page.screenshot({ path: info.outputPath('roulette.png'), fullPage: true });
      await page.getByRole('button', { name: '룰렛 돌리기', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('오늘의 정산 결과');
      await assertLayout(page);
      await page.getByRole('button', { name: '같은 참가자로 다시 진행', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await assertLayout(page);
      await page.getByRole('button', { name: '현재 진행 유지', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }
}

test('12 participants and keyboard-sized viewport keep the last input and actions reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await useFixturePolicy(page);
  await page.goto('/');
  await setUp(page, 12);
  await assertLayout(page);
  await expect(page.getByRole('button', { name: '참가자 추가', exact: true })).toBeDisabled();
  // A viewport resize checks reflow, not a real OS keyboard.
  await page.setViewportSize({ width: 320, height: 280 });
  const lastInput = page.getByLabel('참가자 12 닉네임', { exact: true });
  await lastInput.focus();
  await lastInput.scrollIntoViewIfNeeded();
  await expect(lastInput).toBeInViewport();
  await assertLayout(page);
  const next = page.getByRole('button', { name: '업보 청문회 시작', exact: true });
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeInViewport();
  await next.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('휴대폰을 전달해 주세요');
});

test('asymmetric safe areas protect content and the scrollable confirmation dialog', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 360 });
  await useFixturePolicy(page);
  await page.goto('/');
  await page.evaluate(() => {
    for (const [edge, value] of Object.entries({ top: 44, right: 22, bottom: 34, left: 44 })) {
      document.documentElement.style.setProperty(`--safe-area-${edge}`, `${value}px`);
    }
  });
  const padding = await page.locator('.app-shell').evaluate((el) => {
    const css = getComputedStyle(el);
    return [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft].map(parseFloat);
  });
  expect(padding).toEqual([44, 24, 34, 44]);
  await setUp(page);
  await page.getByRole('button', { name: '업보 청문회 시작', exact: true }).click();
  await page.getByRole('button', { name: '참가자 설정 변경', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(44);
  expect(box!.y).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(768 - 22);
  expect(box!.y + box!.height).toBeLessThanOrEqual(360 - 34);
  await page.getByRole('button', { name: '응답을 초기화하고 설정 변경', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('함께할 사람을 알려 주세요');
});

test('split amount and result reflow at 200% text with a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await useFixturePolicy(page);
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await setUp(page, 2, 'split');
  await page.getByRole('button', { name: '총액 입력', exact: true }).click();
  await page.getByLabel('총 결제 금액 (원)').fill('99999999');
  await assertLayout(page);
  await page.getByRole('button', { name: '업보 청문회 시작', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '내 질문 시작', exact: true }).click();
    await page.getByRole('button', { name: '응답 완료', exact: true }).click();
  }
  await page.getByRole('button', { name: '정산 준비 상태 보기', exact: true }).click();
  await assertLayout(page);
  await page.getByRole('button', { name: '같은 참가자로 다시 진행', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('N빵 총액은 유지해요.');
  await assertLayout(page);
  await page.getByRole('button', { name: '응답을 초기화하고 다시 진행', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('휴대폰을 전달해 주세요');
});

test('compact defaults and both theme palettes remain readable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontSize)).toBe('15px');
  expect(await page.locator('h1').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(30);
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await assertLayout(page);
    const contrast = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const luminance = (token: string) => {
        const color = css.getPropertyValue(token).trim().replace('#', '');
        const hex = color.length === 3 ? [...color].map((value) => value + value).join('') : color;
        const channels = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
        return channels.reduce((sum, value, index) => sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!, 0);
      };
      const pairs = ['--background', '--surface', '--control', '--primary-soft']
        .flatMap((bg) => ['--text', '--muted', '--error'].map((fg) => [fg, bg]));
      pairs.push(['--on-primary', '--primary'], ['--primary', '--background'], ['--wheel-label-text', '--wheel-label']);
      return pairs.map(([fg, bg]) => {
        const values = [luminance(fg!), luminance(bg!)].sort((a, b) => a - b);
        return { fg, bg, ratio: (values[1]! + 0.05) / (values[0]! + 0.05) };
      });
    });
    expect(contrast.filter(({ ratio }) => ratio < 4.5)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${theme}-compact.png`), fullPage: true });
  }
});
