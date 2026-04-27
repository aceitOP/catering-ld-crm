'use strict';

let browserPromise = null;

function pdfEngineUnavailable(error) {
  const err = new Error(
    'Server-side PDF engine není dostupný. Nainstalujte backend dependency "playwright" a Chromium browser.'
  );
  err.status = 503;
  err.cause = error;
  return err;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      let chromium;
      try {
        ({ chromium } = require('playwright'));
      } catch (error) {
        throw pdfEngineUnavailable(error);
      }

      return chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    })();
  }
  return browserPromise;
}

function isPdfRequested(req) {
  return String(req.query?.format || '').toLowerCase() === 'pdf'
    || String(req.headers.accept || '').includes('application/pdf');
}

async function renderPdfFromHtml(html, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, {
      waitUntil: options.waitUntil || 'networkidle',
      timeout: options.timeout || 30000,
    });
    await page.emulateMedia({ media: 'print' });
    return await page.pdf({
      format: options.format || 'A4',
      landscape: Boolean(options.landscape),
      printBackground: options.printBackground !== false,
      preferCSSPageSize: options.preferCSSPageSize !== false,
      margin: options.margin || { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function sendPdfResponse(res, html, filename, options = {}) {
  const pdf = await renderPdfFromHtml(html, options);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${String(filename || 'document.pdf').replace(/"/g, '')}"`);
  res.send(pdf);
}

module.exports = {
  isPdfRequested,
  renderPdfFromHtml,
  sendPdfResponse,
};
