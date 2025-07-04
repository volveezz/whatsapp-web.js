var DecorationsT,
    JobT,
    SourceSpansT,
    HACK_TO_FIX_JS_INCLUDE_PL,
    PR,
    prettyPrintOne,
    prettyPrint,
    IN_GLOBAL_SCOPE = !1;
((window.PR_SHOULD_USE_CONTINUATION = !0),
    (function () {
        var T = window,
            e = ['break,continue,do,else,for,if,return,while'],
            n = [
                [
                    e,
                    'auto,case,char,const,default,double,enum,extern,float,goto,inline,int,long,register,restrict,short,signed,sizeof,static,struct,switch,typedef,union,unsigned,void,volatile',
                ],
                'catch,class,delete,false,import,new,operator,private,protected,public,this,throw,true,try,typeof',
            ],
            t = [
                n,
                'alignas,alignof,align_union,asm,axiom,bool,concept,concept_map,const_cast,constexpr,decltype,delegate,dynamic_cast,explicit,export,friend,generic,late_check,mutable,namespace,noexcept,noreturn,nullptr,property,reinterpret_cast,static_assert,static_cast,template,typeid,typename,using,virtual,where',
            ],
            r = [
                n,
                'abstract,assert,boolean,byte,extends,finally,final,implements,import,instanceof,interface,null,native,package,strictfp,super,synchronized,throws,transient',
            ],
            a = [
                n,
                'abstract,add,alias,as,ascending,async,await,base,bool,by,byte,checked,decimal,delegate,descending,dynamic,event,finally,fixed,foreach,from,get,global,group,implicit,in,interface,internal,into,is,join,let,lock,null,object,out,override,orderby,params,partial,readonly,ref,remove,sbyte,sealed,select,set,stackalloc,string,select,uint,ulong,unchecked,unsafe,ushort,value,var,virtual,where,yield',
            ],
            s = [
                n,
                'abstract,async,await,constructor,debugger,enum,eval,export,function,get,implements,instanceof,interface,let,null,set,undefined,var,with,yield,Infinity,NaN',
            ],
            l =
                'caller,delete,die,do,dump,elsif,eval,exit,foreach,for,goto,if,import,last,local,my,next,no,our,print,package,redo,require,sub,undef,unless,until,use,wantarray,while,BEGIN,END',
            i = [
                e,
                'and,as,assert,class,def,del,elif,except,exec,finally,from,global,import,in,is,lambda,nonlocal,not,or,pass,print,raise,try,with,yield,False,True,None',
            ],
            o = [
                e,
                'alias,and,begin,case,class,def,defined,elsif,end,ensure,false,in,module,next,nil,not,or,redo,rescue,retry,self,super,then,true,undef,unless,until,when,yield,BEGIN,END',
            ],
            u = [e, 'case,done,elif,esac,eval,fi,function,in,local,set,then,until'],
            c =
                /^(DIR|FILE|array|vector|(de|priority_)?queue|(forward_)?list|stack|(const_)?(reverse_)?iterator|(unordered_)?(multi)?(set|map)|bitset|u?(int|float)\d*)\b/,
            d = 'str',
            p = 'com',
            f = 'typ',
            g = 'lit',
            h = 'pun',
            P = 'pln',
            E = 'src',
            m = 'atv';
        function L(e, n, t, r, a) {
            if (t) {
                var s = {
                    sourceNode: e,
                    pre: 1,
                    langExtension: null,
                    numberLines: null,
                    sourceCode: t,
                    spans: null,
                    basePos: n,
                    decorations: null,
                };
                (r(s), a.push.apply(a, s.decorations));
            }
        }
        var v = /\S/;
        function k(e) {
            for (var n = void 0, t = e.firstChild; t; t = t.nextSibling) {
                var r = t.nodeType;
                n = 1 === r ? (n ? e : t) : 3 === r && v.test(t.nodeValue) ? e : n;
            }
            return n === e ? void 0 : n;
        }
        function y(c, w) {
            var S,
                C = {};
            !(function () {
                for (var e = c.concat(w), n = [], t = {}, r = 0, a = e.length; r < a; ++r) {
                    var s = e[r],
                        l = s[3];
                    if (l) for (var i = l.length; 0 <= --i; ) C[l.charAt(i)] = s;
                    var o = s[1],
                        u = '' + o;
                    t.hasOwnProperty(u) || (n.push(o), (t[u] = null));
                }
                (n.push(/[\0-\uffff]/),
                    (S = (function (e) {
                        for (var u = 0, c = !1, n = !1, t = 0, r = e.length; t < r; ++t)
                            if ((i = e[t]).ignoreCase) n = !0;
                            else if (/[a-z]/i.test(i.source.replace(/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}|\\[^ux]/gi, ''))) {
                                n = !(c = !0);
                                break;
                            }
                        var a = { b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };
                        function f(e) {
                            var n = e.charCodeAt(0);
                            if (92 !== n) return n;
                            var t = e.charAt(1);
                            return (
                                (n = a[t]) ||
                                ('0' <= t && t <= '7'
                                    ? parseInt(e.substring(1), 8)
                                    : 'u' === t || 'x' === t
                                      ? parseInt(e.substring(2), 16)
                                      : e.charCodeAt(1))
                            );
                        }
                        function g(e) {
                            if (e < 32) return (e < 16 ? '\\x0' : '\\x') + e.toString(16);
                            var n = String.fromCharCode(e);
                            return '\\' === n || '-' === n || ']' === n || '^' === n ? '\\' + n : n;
                        }
                        function d(e) {
                            var n = e
                                    .substring(1, e.length - 1)
                                    .match(
                                        new RegExp(
                                            '\\\\u[0-9A-Fa-f]{4}|\\\\x[0-9A-Fa-f]{2}|\\\\[0-3][0-7]{0,2}|\\\\[0-7]{1,2}|\\\\[\\s\\S]|-|[^-\\\\]',
                                            'g'
                                        )
                                    ),
                                t = [],
                                r = '^' === n[0],
                                a = ['['];
                            r && a.push('^');
                            for (var s = r ? 1 : 0, l = n.length; s < l; ++s) {
                                var i = n[s];
                                if (/\\[bdsw]/i.test(i)) a.push(i);
                                else {
                                    var o,
                                        u = f(i);
                                    (s + 2 < l && '-' === n[s + 1] ? ((o = f(n[s + 2])), (s += 2)) : (o = u),
                                        t.push([u, o]),
                                        o < 65 ||
                                            122 < u ||
                                            (o < 65 || 90 < u || t.push([32 | Math.max(65, u), 32 | Math.min(o, 90)]),
                                            o < 97 || 122 < u || t.push([-33 & Math.max(97, u), -33 & Math.min(o, 122)])));
                                }
                            }
                            t.sort(function (e, n) {
                                return e[0] - n[0] || n[1] - e[1];
                            });
                            var c = [],
                                d = [];
                            for (s = 0; s < t.length; ++s) (p = t[s])[0] <= d[1] + 1 ? (d[1] = Math.max(d[1], p[1])) : c.push((d = p));
                            for (s = 0; s < c.length; ++s) {
                                var p = c[s];
                                (a.push(g(p[0])), p[1] > p[0] && (p[1] + 1 > p[0] && a.push('-'), a.push(g(p[1]))));
                            }
                            return (a.push(']'), a.join(''));
                        }
                        function s(e) {
                            for (
                                var n = e.source.match(
                                        new RegExp(
                                            '(?:\\[(?:[^\\x5C\\x5D]|\\\\[\\s\\S])*\\]|\\\\u[A-Fa-f0-9]{4}|\\\\x[A-Fa-f0-9]{2}|\\\\[0-9]+|\\\\[^ux0-9]|\\(\\?[:!=]|[\\(\\)\\^]|[^\\x5B\\x5C\\(\\)\\^]+)',
                                            'g'
                                        )
                                    ),
                                    t = n.length,
                                    r = [],
                                    a = 0,
                                    s = 0;
                                a < t;
                                ++a
                            )
                                '(' === (i = n[a])
                                    ? ++s
                                    : '\\' === i.charAt(0) && (l = +i.substring(1)) && (l <= s ? (r[l] = -1) : (n[a] = g(l)));
                            for (a = 1; a < r.length; ++a) -1 === r[a] && (r[a] = ++u);
                            for (s = a = 0; a < t; ++a)
                                if ('(' === (i = n[a])) r[++s] || (n[a] = '(?:');
                                else if ('\\' === i.charAt(0)) {
                                    var l;
                                    (l = +i.substring(1)) && l <= s && (n[a] = '\\' + r[l]);
                                }
                            for (a = 0; a < t; ++a) '^' === n[a] && '^' !== n[a + 1] && (n[a] = '');
                            if (e.ignoreCase && c)
                                for (a = 0; a < t; ++a) {
                                    var i,
                                        o = (i = n[a]).charAt(0);
                                    2 <= i.length && '[' === o
                                        ? (n[a] = d(i))
                                        : '\\' !== o &&
                                          (n[a] = i.replace(/[a-zA-Z]/g, function (e) {
                                              var n = e.charCodeAt(0);
                                              return '[' + String.fromCharCode(-33 & n, 32 | n) + ']';
                                          }));
                                }
                            return n.join('');
                        }
                        var l = [];
                        for (t = 0, r = e.length; t < r; ++t) {
                            var i;
                            if ((i = e[t]).global || i.multiline) throw new Error('' + i);
                            l.push('(?:' + s(i) + ')');
                        }
                        return new RegExp(l.join('|'), n ? 'gi' : 'g');
                    })(n)));
            })();
            var N = w.length,
                _ = function (e) {
                    for (
                        var n = e.sourceCode,
                            t = e.basePos,
                            r = e.sourceNode,
                            a = [t, P],
                            s = 0,
                            l = n.match(S) || [],
                            i = {},
                            o = 0,
                            u = l.length;
                        o < u;
                        ++o
                    ) {
                        var c,
                            d = l[o],
                            p = i[d],
                            f = void 0;
                        if ('string' == typeof p) c = !1;
                        else {
                            var g = C[d.charAt(0)];
                            if (g) ((f = d.match(g[1])), (p = g[0]));
                            else {
                                for (var h = 0; h < N; ++h)
                                    if (((g = w[h]), (f = d.match(g[1])))) {
                                        p = g[0];
                                        break;
                                    }
                                f || (p = P);
                            }
                            (!(c = 5 <= p.length && 'lang-' === p.substring(0, 5)) || (f && 'string' == typeof f[1]) || ((c = !1), (p = E)),
                                c || (i[d] = p));
                        }
                        var m = s;
                        if (((s += d.length), c)) {
                            var v = f[1],
                                y = d.indexOf(v),
                                b = y + v.length;
                            f[2] && (y = (b = d.length - f[2].length) - v.length);
                            var x = p.substring(5);
                            (L(r, t + m, d.substring(0, y), _, a), L(r, t + m + y, v, A(x, v), a), L(r, t + m + b, d.substring(b), _, a));
                        } else a.push(t + m, p);
                    }
                    e.decorations = a;
                };
            return _;
        }
        function b(e) {
            var n = [],
                t = [];
            (e.tripleQuotedStrings
                ? n.push([
                      d,
                      /^(?:\'\'\'(?:[^\'\\]|\\[\s\S]|\'{1,2}(?=[^\']))*(?:\'\'\'|$)|\"\"\"(?:[^\"\\]|\\[\s\S]|\"{1,2}(?=[^\"]))*(?:\"\"\"|$)|\'(?:[^\\\']|\\[\s\S])*(?:\'|$)|\"(?:[^\\\"]|\\[\s\S])*(?:\"|$))/,
                      null,
                      '\'"',
                  ])
                : e.multiLineStrings
                  ? n.push([
                        d,
                        /^(?:\'(?:[^\\\']|\\[\s\S])*(?:\'|$)|\"(?:[^\\\"]|\\[\s\S])*(?:\"|$)|\`(?:[^\\\`]|\\[\s\S])*(?:\`|$))/,
                        null,
                        '\'"`',
                    ])
                  : n.push([d, /^(?:\'(?:[^\\\'\r\n]|\\.)*(?:\'|$)|\"(?:[^\\\"\r\n]|\\.)*(?:\"|$))/, null, '"\'']),
                e.verbatimStrings && t.push([d, /^@\"(?:[^\"]|\"\")*(?:\"|$)/, null]));
            var r = e.hashComments;
            (r &&
                (e.cStyleComments
                    ? (1 < r
                          ? n.push([p, /^#(?:##(?:[^#]|#(?!##))*(?:###|$)|.*)/, null, '#'])
                          : n.push([
                                p,
                                /^#(?:(?:define|e(?:l|nd)if|else|error|ifn?def|include|line|pragma|undef|warning)\b|[^\r\n]*)/,
                                null,
                                '#',
                            ]),
                      t.push([d, /^<(?:(?:(?:\.\.\/)*|\/?)(?:[\w-]+(?:\/[\w-]+)+)?[\w-]+\.h(?:h|pp|\+\+)?|[a-z]\w*)>/, null]))
                    : n.push([p, /^#[^\r\n]*/, null, '#'])),
                e.cStyleComments && (t.push([p, /^\/\/[^\r\n]*/, null]), t.push([p, /^\/\*[\s\S]*?(?:\*\/|$)/, null])));
            var a = e.regexLiterals;
            if (a) {
                var s = 1 < a ? '' : '\n\r',
                    l = s ? '.' : '[\\S\\s]',
                    i =
                        '/(?=[^/*' +
                        s +
                        '])(?:[^/\\x5B\\x5C' +
                        s +
                        ']|\\x5C' +
                        l +
                        '|\\x5B(?:[^\\x5C\\x5D' +
                        s +
                        ']|\\x5C' +
                        l +
                        ')*(?:\\x5D|$))+/';
                t.push([
                    'lang-regex',
                    RegExp(
                        '^(?:^^\\.?|[+-]|[!=]=?=?|\\#|%=?|&&?=?|\\(|\\*=?|[+\\-]=|->|\\/=?|::?|<<?=?|>>?>?=?|,|;|\\?|@|\\[|~|{|\\^\\^?=?|\\|\\|?=?|break|case|continue|delete|do|else|finally|instanceof|return|throw|try|typeof)\\s*(' +
                            i +
                            ')'
                    ),
                ]);
            }
            var o = e.types;
            o && t.push([f, o]);
            var u = ('' + e.keywords).replace(/^ | $/g, '');
            (u.length && t.push(['kwd', new RegExp('^(?:' + u.replace(/[\s,]+/g, '|') + ')\\b'), null]),
                n.push([P, /^\s+/, null, ' \r\n\t ']));
            var c = '^.[^\\s\\w.$@\'"`/\\\\]*';
            return (
                e.regexLiterals && (c += '(?!s*/)'),
                t.push(
                    [g, /^@[a-z_$][a-z_$@0-9]*/i, null],
                    [f, /^(?:[@_]?[A-Z]+[a-z][A-Za-z_$@0-9]*|\w+_t\b)/, null],
                    [P, /^[a-z_$][a-z_$@0-9]*/i, null],
                    [
                        g,
                        new RegExp('^(?:0x[a-f0-9]+|(?:\\d(?:_\\d+)*\\d*(?:\\.\\d*)?|\\.\\d\\+)(?:e[+\\-]?\\d+)?)[a-z]*', 'i'),
                        null,
                        '0123456789',
                    ],
                    [P, /^\\[\s\S]?/, null],
                    [h, new RegExp(c), null]
                ),
                y(n, t)
            );
        }
        var x = b({ keywords: [t, a, r, s, l, i, o, u], hashComments: !0, cStyleComments: !0, multiLineStrings: !0, regexLiterals: !0 });
        function R(e, n, i) {
            for (var o = /(?:^|\s)nocode(?:\s|$)/, u = /\r\n?|\n/, c = e.ownerDocument, t = c.createElement('li'); e.firstChild; )
                t.appendChild(e.firstChild);
            var r = [t];
            function d(e) {
                var n = e.nodeType;
                if (1 != n || o.test(e.className)) {
                    if ((3 == n || 4 == n) && i) {
                        var t = e.nodeValue,
                            r = t.match(u);
                        if (r) {
                            var a = t.substring(0, r.index);
                            e.nodeValue = a;
                            var s = t.substring(r.index + r[0].length);
                            if (s) e.parentNode.insertBefore(c.createTextNode(s), e.nextSibling);
                            (p(e), a || e.parentNode.removeChild(e));
                        }
                    }
                } else if ('br' === e.nodeName) (p(e), e.parentNode && e.parentNode.removeChild(e));
                else for (var l = e.firstChild; l; l = l.nextSibling) d(l);
            }
            function p(e) {
                for (; !e.nextSibling; ) if (!(e = e.parentNode)) return;
                for (
                    var n,
                        t = (function e(n, t) {
                            var r = t ? n.cloneNode(!1) : n,
                                a = n.parentNode;
                            if (a) {
                                var s = e(a, 1),
                                    l = n.nextSibling;
                                s.appendChild(r);
                                for (var i = l; i; i = l) ((l = i.nextSibling), s.appendChild(i));
                            }
                            return r;
                        })(e.nextSibling, 0);
                    (n = t.parentNode) && 1 === n.nodeType;

                )
                    t = n;
                r.push(t);
            }
            for (var a = 0; a < r.length; ++a) d(r[a]);
            n === (0 | n) && r[0].setAttribute('value', n);
            var s = c.createElement('ol');
            s.className = 'linenums';
            for (var l = Math.max(0, (n - 1) | 0) || 0, f = ((a = 0), r.length); a < f; ++a)
                (((t = r[a]).className = 'L' + ((a + l) % 10)), t.firstChild || t.appendChild(c.createTextNode(' ')), s.appendChild(t));
            e.appendChild(s);
        }
        var w = {};
        function S(e, n) {
            for (var t = n.length; 0 <= --t; ) {
                var r = n[t];
                w.hasOwnProperty(r) ? T.console && console.warn('cannot override language handler %s', r) : (w[r] = e);
            }
        }
        function A(e, n) {
            return ((e && w.hasOwnProperty(e)) || (e = /^\s*</.test(n) ? 'default-markup' : 'default-code'), w[e]);
        }
        function $(e) {
            var n = e.langExtension;
            try {
                var t = (function (e, l) {
                        var i = /(?:^|\s)nocode(?:\s|$)/,
                            o = [],
                            u = 0,
                            c = [],
                            d = 0;
                        return (
                            (function e(n) {
                                var t = n.nodeType;
                                if (1 == t) {
                                    if (i.test(n.className)) return;
                                    for (var r = n.firstChild; r; r = r.nextSibling) e(r);
                                    var a = n.nodeName.toLowerCase();
                                    ('br' !== a && 'li' !== a) || ((o[d] = '\n'), (c[d << 1] = u++), (c[(d++ << 1) | 1] = n));
                                } else if (3 == t || 4 == t) {
                                    var s = n.nodeValue;
                                    s.length &&
                                        ((s = l ? s.replace(/\r\n?/g, '\n') : s.replace(/[ \t\r\n]+/g, ' ')),
                                        (o[d] = s),
                                        (c[d << 1] = u),
                                        (u += s.length),
                                        (c[(d++ << 1) | 1] = n));
                                }
                            })(e),
                            { sourceCode: o.join('').replace(/\n$/, ''), spans: c }
                        );
                    })(e.sourceNode, e.pre),
                    r = t.sourceCode;
                ((e.sourceCode = r),
                    (e.spans = t.spans),
                    (e.basePos = 0),
                    A(n, r)(e),
                    (function (e) {
                        var n = /\bMSIE\s(\d+)/.exec(navigator.userAgent);
                        n = n && +n[1] <= 8;
                        var t,
                            r,
                            a = /\n/g,
                            s = e.sourceCode,
                            l = s.length,
                            i = 0,
                            o = e.spans,
                            u = o.length,
                            c = 0,
                            d = e.decorations,
                            p = d.length,
                            f = 0;
                        for (d[p] = l, r = t = 0; r < p; ) d[r] !== d[r + 2] ? ((d[t++] = d[r++]), (d[t++] = d[r++])) : (r += 2);
                        for (p = t, r = t = 0; r < p; ) {
                            for (var g = d[r], h = d[r + 1], m = r + 2; m + 2 <= p && d[m + 1] === h; ) m += 2;
                            ((d[t++] = g), (d[t++] = h), (r = m));
                        }
                        p = d.length = t;
                        var v = e.sourceNode,
                            y = '';
                        v && ((y = v.style.display), (v.style.display = 'none'));
                        try {
                            for (; c < u; ) {
                                o[c];
                                var b,
                                    x = o[c + 2] || l,
                                    w = d[f + 2] || l,
                                    S = ((m = Math.min(x, w)), o[c + 1]);
                                if (1 !== S.nodeType && (b = s.substring(i, m))) {
                                    (n && (b = b.replace(a, '\r')), (S.nodeValue = b));
                                    var C = S.ownerDocument,
                                        N = C.createElement('span');
                                    N.className = d[f + 1];
                                    var _ = S.parentNode;
                                    (_.replaceChild(N, S),
                                        N.appendChild(S),
                                        i < x && ((o[c + 1] = S = C.createTextNode(s.substring(m, x))), _.insertBefore(S, N.nextSibling)));
                                }
                                (x <= (i = m) && (c += 2), w <= i && (f += 2));
                            }
                        } finally {
                            v && (v.style.display = y);
                        }
                    })(e));
            } catch (e) {
                T.console && console.log((e && e.stack) || e);
            }
        }
        function C(e, n, t) {
            var r = t || !1,
                a = n || null,
                s = document.createElement('div');
            return (
                (s.innerHTML = '<pre>' + e + '</pre>'),
                (s = s.firstChild),
                r && R(s, r, !0),
                $({
                    langExtension: a,
                    numberLines: r,
                    sourceNode: s,
                    pre: 1,
                    sourceCode: null,
                    basePos: null,
                    spans: null,
                    decorations: null,
                }),
                s.innerHTML
            );
        }
        function N(y, e) {
            var n = e || document.body,
                b = n.ownerDocument || document;
            function t(e) {
                return n.getElementsByTagName(e);
            }
            for (var r = [t('pre'), t('code'), t('xmp')], x = [], a = 0; a < r.length; ++a)
                for (var s = 0, l = r[a].length; s < l; ++s) x.push(r[a][s]);
            r = null;
            var w = Date;
            w.now ||
                (w = {
                    now: function () {
                        return +new Date();
                    },
                });
            var S = 0,
                C = /\blang(?:uage)?-([\w.]+)(?!\S)/,
                N = /\bprettyprint\b/,
                _ = /\bprettyprinted\b/,
                P = /pre|xmp/i,
                E = /^code$/i,
                L = /^(?:pre|code|xmp)$/i,
                A = {};
            !(function e() {
                for (var n = T.PR_SHOULD_USE_CONTINUATION ? w.now() + 250 : 1 / 0; S < x.length && w.now() < n; S++) {
                    for (var t = x[S], r = A, a = t; (a = a.previousSibling); ) {
                        var s = a.nodeType,
                            l = (7 === s || 8 === s) && a.nodeValue;
                        if (l ? !/^\??prettify\b/.test(l) : 3 !== s || /\S/.test(a.nodeValue)) break;
                        if (l) {
                            ((r = {}),
                                l.replace(/\b(\w+)=([\w:.%+-]+)/g, function (e, n, t) {
                                    r[n] = t;
                                }));
                            break;
                        }
                    }
                    var i = t.className;
                    if ((r !== A || N.test(i)) && !_.test(i)) {
                        for (var o = !1, u = t.parentNode; u; u = u.parentNode) {
                            var c = u.tagName;
                            if (L.test(c) && u.className && N.test(u.className)) {
                                o = !0;
                                break;
                            }
                        }
                        if (!o) {
                            t.className += ' prettyprinted';
                            var d,
                                p,
                                f = r.lang;
                            if (
                                (f || (!(f = i.match(C)) && (d = k(t)) && E.test(d.tagName) && (f = d.className.match(C)), f && (f = f[1])),
                                P.test(t.tagName))
                            )
                                p = 1;
                            else {
                                var g = t.currentStyle,
                                    h = b.defaultView,
                                    m = g
                                        ? g.whiteSpace
                                        : h && h.getComputedStyle
                                          ? h.getComputedStyle(t, null).getPropertyValue('white-space')
                                          : 0;
                                p = m && 'pre' === m.substring(0, 3);
                            }
                            var v = r.linenums;
                            ((v = 'true' === v || +v) ||
                                (v = !!(v = i.match(/\blinenums\b(?::(\d+))?/)) && (!v[1] || !v[1].length || +v[1])),
                                v && R(t, v, p),
                                $({
                                    langExtension: f,
                                    sourceNode: t,
                                    numberLines: v,
                                    pre: p,
                                    sourceCode: null,
                                    basePos: null,
                                    spans: null,
                                    decorations: null,
                                }));
                        }
                    }
                }
                S < x.length ? T.setTimeout(e, 250) : 'function' == typeof y && y();
            })();
        }
        (S(x, ['default-code']),
            S(
                y(
                    [],
                    [
                        [P, /^[^<?]+/],
                        ['dec', /^<!\w[^>]*(?:>|$)/],
                        [p, /^<\!--[\s\S]*?(?:-\->|$)/],
                        ['lang-', /^<\?([\s\S]+?)(?:\?>|$)/],
                        ['lang-', /^<%([\s\S]+?)(?:%>|$)/],
                        [h, /^(?:<[%?]|[%?]>)/],
                        ['lang-', /^<xmp\b[^>]*>([\s\S]+?)<\/xmp\b[^>]*>/i],
                        ['lang-js', /^<script\b[^>]*>([\s\S]*?)(<\/script\b[^>]*>)/i],
                        ['lang-css', /^<style\b[^>]*>([\s\S]*?)(<\/style\b[^>]*>)/i],
                        ['lang-in.tag', /^(<\/?[a-z][^<>]*>)/i],
                    ]
                ),
                ['default-markup', 'htm', 'html', 'mxml', 'xhtml', 'xml', 'xsl']
            ),
            S(
                y(
                    [
                        [P, /^[\s]+/, null, ' \t\r\n'],
                        [m, /^(?:\"[^\"]*\"?|\'[^\']*\'?)/, null, '"\''],
                    ],
                    [
                        ['tag', /^^<\/?[a-z](?:[\w.:-]*\w)?|\/?>$/i],
                        ['atn', /^(?!style[\s=]|on)[a-z](?:[\w:-]*\w)?/i],
                        ['lang-uq.val', /^=\s*([^>\'\"\s]*(?:[^>\'\"\s\/]|\/(?=\s)))/],
                        [h, /^[=<>\/]+/],
                        ['lang-js', /^on\w+\s*=\s*\"([^\"]+)\"/i],
                        ['lang-js', /^on\w+\s*=\s*\'([^\']+)\'/i],
                        ['lang-js', /^on\w+\s*=\s*([^\"\'>\s]+)/i],
                        ['lang-css', /^style\s*=\s*\"([^\"]+)\"/i],
                        ['lang-css', /^style\s*=\s*\'([^\']+)\'/i],
                        ['lang-css', /^style\s*=\s*([^\"\'>\s]+)/i],
                    ]
                ),
                ['in.tag']
            ),
            S(y([], [[m, /^[\s\S]+/]]), ['uq.val']),
            S(b({ keywords: t, hashComments: !0, cStyleComments: !0, types: c }), ['c', 'cc', 'cpp', 'cxx', 'cyc', 'm']),
            S(b({ keywords: 'null,true,false' }), ['json']),
            S(b({ keywords: a, hashComments: !0, cStyleComments: !0, verbatimStrings: !0, types: c }), ['cs']),
            S(b({ keywords: r, cStyleComments: !0 }), ['java']),
            S(b({ keywords: u, hashComments: !0, multiLineStrings: !0 }), ['bash', 'bsh', 'csh', 'sh']),
            S(b({ keywords: i, hashComments: !0, multiLineStrings: !0, tripleQuotedStrings: !0 }), ['cv', 'py', 'python']),
            S(b({ keywords: l, hashComments: !0, multiLineStrings: !0, regexLiterals: 2 }), ['perl', 'pl', 'pm']),
            S(b({ keywords: o, hashComments: !0, multiLineStrings: !0, regexLiterals: !0 }), ['rb', 'ruby']),
            S(b({ keywords: s, cStyleComments: !0, regexLiterals: !0 }), ['javascript', 'js', 'ts', 'typescript']),
            S(
                b({
                    keywords:
                        'all,and,by,catch,class,else,extends,false,finally,for,if,in,is,isnt,loop,new,no,not,null,of,off,on,or,return,super,then,throw,true,try,unless,until,when,while,yes',
                    hashComments: 3,
                    cStyleComments: !0,
                    multilineStrings: !0,
                    tripleQuotedStrings: !0,
                    regexLiterals: !0,
                }),
                ['coffee']
            ),
            S(y([], [[d, /^[\s\S]+/]]), ['regex']));
        var _ = (T.PR = {
                createSimpleLexer: y,
                registerLangHandler: S,
                sourceDecorator: b,
                PR_ATTRIB_NAME: 'atn',
                PR_ATTRIB_VALUE: m,
                PR_COMMENT: p,
                PR_DECLARATION: 'dec',
                PR_KEYWORD: 'kwd',
                PR_LITERAL: g,
                PR_NOCODE: 'nocode',
                PR_PLAIN: P,
                PR_PUNCTUATION: h,
                PR_SOURCE: E,
                PR_STRING: d,
                PR_TAG: 'tag',
                PR_TYPE: f,
                prettyPrintOne: IN_GLOBAL_SCOPE ? (T.prettyPrintOne = C) : (prettyPrintOne = C),
                prettyPrint: (prettyPrint = IN_GLOBAL_SCOPE ? (T.prettyPrint = N) : (prettyPrint = N)),
            }),
            O = T.define;
        'function' == typeof O &&
            O.amd &&
            O('google-code-prettify', [], function () {
                return _;
            });
    })());
