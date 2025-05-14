/**
 * Expose a function to the page if it does not exist.
 * Handles the common case where exposeFunction fails because the window property already exists.
 *
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 * @param {string} name - The name of the function to expose on the window object.
 * @param {Function} fn - The function to expose.
 */
async function exposeFunctionIfAbsent(page, name, fn) {
    page._exposedBindings = page._exposedBindings || new Set();
    if (page._exposedBindings.has(name)) return;

    await page.removeExposedFunction(name).catch(() => {});

    await page.exposeFunction(name, fn);
    page._exposedBindings.add(name);
}

module.exports = { exposeFunctionIfAbsent };
