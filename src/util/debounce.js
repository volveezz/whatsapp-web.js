function debounce(func, wait) {
    let timeoutId = null;
    let resultPromise = null;

    return async function (...args) {
        const context = this;

        if (timeoutId === null) {
            resultPromise = func.apply(context, args);

            timeoutId = setTimeout(() => {
                timeoutId = null;
                resultPromise = null;
            }, wait);

            return resultPromise;
        } else {
            return resultPromise;
        }
    };
}

module.exports = { debounce };
