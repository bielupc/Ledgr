import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const outDir = '/tmp/claude-1000/-home-biel-Desktop-Ledgr/25d05c12-bceb-4b45-858a-ede435460aba/scratchpad';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
    ],
  });

  const page = await browser.newPage();
  page.setViewport({ width: 1440, height: 900 });

  try {
    // Inject style to freeze animations for cleaner screenshots
    await page.evaluateOnNewDocument(() => {
      const style = document.createElement('style');
      style.textContent = '* { animation: none !important; transition: none !important; }';
      document.head.appendChild(style);
    });

    // Dashboard
    console.log('Taking Dashboard screenshot...');
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(outDir, 'dashboard.png') });

    // Categories
    console.log('Taking Categories screenshot...');
    await page.goto('http://localhost:5173/categories', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(outDir, 'categories.png') });

    // Budgets
    console.log('Taking Budgets screenshot...');
    await page.goto('http://localhost:5173/budgets', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(outDir, 'budgets.png') });

    // Recurring
    console.log('Taking Recurring screenshot...');
    await page.goto('http://localhost:5173/recurring', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(outDir, 'recurring.png') });

    // Accounts
    console.log('Taking Accounts screenshot...');
    await page.goto('http://localhost:5173/accounts', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(outDir, 'accounts.png') });

    console.log('✓ Screenshots saved to scratchpad/');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
