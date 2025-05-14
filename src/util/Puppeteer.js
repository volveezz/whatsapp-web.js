/**
 * Expose a function to the page if it does not exist.
 * Handles the common case where exposeFunction fails because the window property already exists.
 *
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 * @param {string} name - The name of the function to expose on the window object.
 * @param {Function} fn - The function to expose.
 */
+async function exposeFunctionIfAbsent(page, name, fn) {
    // Puppeteer bindings survive every navigation, so cache what we already exposed
    page._exposedBindings = page._exposedBindings || new Set();
    if (page._exposedBindings.has(name)) return; // already done for this Page

    // Also check the browser context in case the binding was created elsewhere
    const exists = await page
        .evaluate((n) => typeof window[n] === "function", name)
        .catch(() => false); // page still loading: assume “not”
    if (exists) {
        // nothing to do – let it live
        page._exposedBindings.add(name);
        return;
    }

    try {
        await page.exposeFunction(name, fn); // first time → success
        page._exposedBindings.add(name);
    } catch (err) {
        // race: somebody else exposed it
        if (!/already exists/i.test(err.message)) throw err;
        page._exposedBindings.add(name);
    }
};

module.exports = { exposeFunctionIfAbsent };
