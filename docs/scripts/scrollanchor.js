!(function () {
    function o(n) {
        var o,
            t,
            e = document.getElementById(n.replace(/^#/, ''));
        e &&
            ((t = e.getBoundingClientRect()),
            (o = t.top + window.pageYOffset),
            setTimeout(function () {
                window.scrollTo(0, o - 50);
            }, 5));
    }
    window.addEventListener('load', function () {
        var n = window.location.hash;
        (n && '#' !== n && o(n),
            window.addEventListener('hashchange', function () {
                o(window.location.hash);
            }));
    });
})();
