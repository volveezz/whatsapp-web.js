!(function () {
    var n,
        e = 0,
        t = document.getElementsByClassName('prettyprint');
    t &&
        t[0] &&
        ((n = (n = (t = t[0].getElementsByTagName('code')[0]).innerHTML.split('\n')).map(function (n) {
            return '<span id="source-line-' + ++e + '" class="line"></span>' + n;
        })),
        (t.innerHTML = n.join('\n')));
})();
