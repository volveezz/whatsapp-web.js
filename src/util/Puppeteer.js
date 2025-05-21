/**
 * Expose a function to the page if it does not exist

 * @param {import('puppeteer').Page} page
 * @param {string} name
 * @param {Function} fn
 */
async function exposeFunctionIfAbsent(page, name, fn) {
    try {
        await page.removeExposedFunction(name);
    } catch (err) {
        //
    }
    await page.exposeFunction(name, fn);
}

module.exports = { exposeFunctionIfAbsent };
