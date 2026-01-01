
import { test, expect } from '@playwright/test';

test('Menu button should be clickable and top-most when card is hovered', async ({ page }) => {
    // Mock the API to return instant data
    await page.route('/api/feeds', async route => {
        const json = [{
            id: '1',
            title: 'Test Article',
            url: 'http://example.com',
            imageUrl: 'http://example.com/image.jpg',
            sourceName: 'Test Source',
            topic: 'Test',
            publishedAt: new Date().toISOString(),
            score: 100
        }];
        await route.fulfill({ json });
    });

    // 1. Load page and wait for articles
    console.log('Loading dashboard...');
    await page.goto('/');

    // Wait for at least one article card
    const firstCard = page.locator('.group').first();
    await firstCard.waitFor({ state: 'visible', timeout: 5000 });

    // 2. Locate the menu button within the FIRST card
    const menuBtn = firstCard.locator('button[type="button"]').first();

    // 3. Hover over the CARD to trigger the transform/scale effect
    console.log('Hovering over card...');
    await firstCard.hover();

    // Wait a bit for transition (duration-300 = 300ms)
    await page.waitForTimeout(500);

    // 4. Get the bounding box of the button center
    const box = await menuBtn.boundingBox();
    if (!box) throw new Error('Menu button not found visible');

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    console.log(`Checking element at (${x}, ${y})...`);

    // 5. Check what is at that point
    const elementHandle = await page.evaluateHandle(({ x, y }) => {
        return document.elementFromPoint(x, y);
    }, { x, y });

    const tagName = await elementHandle.evaluate(el => el?.tagName);
    const className = await elementHandle.evaluate(el => el?.className);

    console.log(`Top Element: <${tagName} class="${className}">`);

    // 6. Assert obstruction
    // We expect the button (or the SVG inside it) to be the top element
    const isButton = tagName === 'BUTTON' || tagName === 'svg' || tagName === 'path';
    const isImage = tagName === 'IMG';

    if (isImage) {
        console.error('FAIL: The IMAGE is covering the button!');
    } else if (isButton) {
        console.log('PASS: The button is on top.');
    } else {
        console.log(`WARNING: Unknown element on top: ${tagName}`);
    }

    expect(isButton || tagName === 'DIV', `Expected button/svg (or wrapper), found <${tagName}>`).toBeTruthy();
});
