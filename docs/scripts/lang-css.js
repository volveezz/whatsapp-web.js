(PR.registerLangHandler(
    PR.createSimpleLexer(
        [[PR.PR_PLAIN, /^[ \t\r\n\f]+/, null, ' \t\r\n\f']],
        [
            [PR.PR_STRING, /^\"(?:[^\n\r\f\\\"]|\\(?:\r\n?|\n|\f)|\\[\s\S])*\"/, null],
            [PR.PR_STRING, /^\'(?:[^\n\r\f\\\']|\\(?:\r\n?|\n|\f)|\\[\s\S])*\'/, null],
            ['lang-css-str', /^url\(([^\)\"\']+)\)/i],
            [PR.PR_KEYWORD, /^(?:url|rgb|\!important|@import|@page|@media|@charset|inherit)(?=[^\-\w]|$)/i, null],
            ['lang-css-kw', /^(-?(?:[_a-z]|(?:\\[0-9a-f]+ ?))(?:[_a-z0-9\-]|\\(?:\\[0-9a-f]+ ?))*)\s*:/i],
            [PR.PR_COMMENT, /^\/\*[^*]*\*+(?:[^\/*][^*]*\*+)*\//],
            [PR.PR_COMMENT, /^(?:<!--|-->)/],
            [PR.PR_LITERAL, /^(?:\d+|\d*\.\d+)(?:%|[a-z]+)?/i],
            [PR.PR_LITERAL, /^#(?:[0-9a-f]{3}){1,2}\b/i],
            [PR.PR_PLAIN, /^-?(?:[_a-z]|(?:\\[\da-f]+ ?))(?:[_a-z\d\-]|\\(?:\\[\da-f]+ ?))*/i],
            [PR.PR_PUNCTUATION, /^[^\s\w\'\"]+/],
        ]
    ),
    ['css']
),
    PR.registerLangHandler(
        PR.createSimpleLexer([], [[PR.PR_KEYWORD, /^-?(?:[_a-z]|(?:\\[\da-f]+ ?))(?:[_a-z\d\-]|\\(?:\\[\da-f]+ ?))*/i]]),
        ['css-kw']
    ),
    PR.registerLangHandler(PR.createSimpleLexer([], [[PR.PR_STRING, /^[^\)\"\']+/]]), ['css-str']));
