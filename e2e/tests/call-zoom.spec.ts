import { expect, test } from './fixtures';
import { openCallers, openConversation } from './helpers';

test('pinch zooms around the fingers, drag pans, and reset restores the view', async ({ context }) => {
  const [page] = await openCallers(context, [{ user: 'alice', name: 'Alice' }]);
  await openConversation(page!, 'c1');
  await page!.getByTestId('chat-start-call').click();
  await expect(page!.getByTestId('call-stage')).toBeVisible();
  await page!.setViewportSize({ width: 390, height: 844 });
  const video = page!.locator('.call-video-zoom');
  const box = (await video.boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const cdp = await context.newCDPSession(page!);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x: x - 40, y, id: 1 }, { x: x + 40, y, id: 2 }]);
  await touch('touchMove', [{ x: x - 80, y, id: 1 }, { x: x + 80, y, id: 2 }]);
  await expect.poll(async () => Number(await video.getAttribute('data-scale'))).toBeGreaterThan(1.5);
  await touch('touchEnd', []);
  await touch('touchStart', [{ x, y, id: 3 }]);
  await touch('touchMove', [{ x: x + 40, y: y + 30, id: 3 }]);
  await touch('touchEnd', []);
  await expect.poll(async () => Number(await video.getAttribute('data-offset-x'))).toBeGreaterThan(20);
  await page!.getByTestId('call-stage-zoom-reset').click();
  await expect(video).toHaveAttribute('data-scale', '1');
  await expect(video).toHaveAttribute('data-offset-x', '0');
  await expect(video).toHaveAttribute('data-offset-y', '0');
});
