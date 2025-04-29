/**
 * Expose a function to the page if it does not exist
 *
 * NOTE:
 * Rewrite it to 'upsertFunction' after updating Puppeteer to 20.6 or higher
 * using page.removeExposedFunction
 * https://pptr.dev/api/puppeteer.page.removeExposedFunction
 *
 * @param {import(puppeteer).Page} page
 * @param {string} name
 * @param {Function} fn
 */
const exposeFunctionIfAbsent = async (page, name, fn) => {
    if (!page || page.isClosed()) {
        console.warn(
            `WWebJS exposeFunctionIfAbsent: Page closed or invalid for '${name}'. Skipping.`
        );
        return;
    }

    let bindingExists = false;
    try {
        bindingExists = page._pageBindings && page._pageBindings.has(name);
    } catch (e) {
        console.warn(
            `WWebJS exposeFunctionIfAbsent: Error checking _pageBindings for '${name}': ${e.message}`
        );
    }

    let windowPropExists = false;
    try {
        windowPropExists = await page.evaluate((n) => {
            return typeof window !== "undefined" && window.hasOwnProperty(n);
        }, name);
    } catch (e) {
        console.warn(
            `WWebJS exposeFunctionIfAbsent: Error evaluating window.hasOwnProperty for '${name}': ${e.message}. Assuming it might exist.`
        );
        windowPropExists = true;
    }

    if (!bindingExists && !windowPropExists) {
        console.log(
            `WWebJS exposeFunctionIfAbsent: Exposing function '${name}'.`
        );
        try {
            await page.exposeFunction(name, fn);
        } catch (e) {
            console.error(
                `WWebJS exposeFunctionIfAbsent: page.exposeFunction failed for '${name}' DESPITE checks passing! Binding: ${bindingExists}, WindowProp: ${windowPropExists}. Error: ${e.message}`
            );
            const finalWindowCheck = await page
                .evaluate(
                    (n) =>
                        typeof window !== "undefined" &&
                        window.hasOwnProperty(n),
                    name
                )
                .catch(() => "error");
            console.error(
                `WWebJS exposeFunctionIfAbsent: Final window check for '${name}' after error: ${finalWindowCheck}`
            );
            throw e;
        }
    } else {
        console.warn(
            `WWebJS exposeFunctionIfAbsent: Skipping exposeFunction for '${name}'. Binding exists: ${bindingExists}, Window prop exists: ${windowPropExists}`
        );
        if (!bindingExists && windowPropExists) {
            console.warn(
                `WWebJS exposeFunctionIfAbsent: Attempting extra cleanup for '${name}' as window prop exists but binding doesn't.`
            );
            try {
                await page.evaluate((n) => {
                    delete window[n];
                }, name);
                if (page._client)
                    await page._client
                        .send("Runtime.removeBinding", { name })
                        .catch(() => {});
            } catch (e) {
                console.warn(
                    `WWebJS exposeFunctionIfAbsent: Extra cleanup failed for '${name}': ${e.message}`
                );
            }
        }
    }
};

module.exports = { exposeFunctionIfAbsent };
