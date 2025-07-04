!(function (o) {
    var n = {};
    function r(e) {
        if (n[e]) return n[e].exports;
        var t = (n[e] = { i: e, l: !1, exports: {} });
        return (o[e].call(t.exports, t, t.exports, r), (t.l = !0), t.exports);
    }
    ((r.m = o),
        (r.c = n),
        (r.d = function (e, t, o) {
            r.o(e, t) || Object.defineProperty(e, t, { enumerable: !0, get: o });
        }),
        (r.r = function (e) {
            ('undefined' != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e, Symbol.toStringTag, { value: 'Module' }),
                Object.defineProperty(e, '__esModule', { value: !0 }));
        }),
        (r.t = function (t, e) {
            if ((1 & e && (t = r(t)), 8 & e)) return t;
            if (4 & e && 'object' == typeof t && t && t.__esModule) return t;
            var o = Object.create(null);
            if ((r.r(o), Object.defineProperty(o, 'default', { enumerable: !0, value: t }), 2 & e && 'string' != typeof t))
                for (var n in t)
                    r.d(
                        o,
                        n,
                        function (e) {
                            return t[e];
                        }.bind(null, n)
                    );
            return o;
        }),
        (r.n = function (e) {
            var t =
                e && e.__esModule
                    ? function () {
                          return e.default;
                      }
                    : function () {
                          return e;
                      };
            return (r.d(t, 'a', t), t);
        }),
        (r.o = function (e, t) {
            return Object.prototype.hasOwnProperty.call(e, t);
        }),
        (r.p = ''),
        r((r.s = 16)));
})([
    function (e, t, o) {
        'use strict';
        var r, n;
        ((t.__esModule = !0),
            ((n = r = t.Position || (t.Position = {}))[(n.Before = 1)] = 'Before'),
            (n[(n.After = 2)] = 'After'),
            (n[(n.Inside = 3)] = 'Inside'),
            (n[(n.None = 4)] = 'None'));
        var i = { before: r.Before, after: r.After, inside: r.Inside, none: r.None };
        ((t.getPositionName = function (e) {
            for (var t in i) if (i.hasOwnProperty(t) && i[t] === e) return t;
            return '';
        }),
            (t.getPosition = function (e) {
                return i[e];
            }));
        var s = (function () {
            function n(e, t, o) {
                (void 0 === t && (t = !1),
                    void 0 === o && (o = n),
                    (this.name = ''),
                    this.setData(e),
                    (this.children = []),
                    (this.parent = null),
                    t && ((this.idMapping = {}), ((this.tree = this).nodeClass = o)));
            }
            return (
                (n.prototype.setData = function (e) {
                    function t(e) {
                        null != e && (o.name = e);
                    }
                    var o = this;
                    if (e)
                        if ('object' != typeof e) t(e);
                        else
                            for (var n in e)
                                if (e.hasOwnProperty(n)) {
                                    var r = e[n];
                                    'label' === n ? t(r) : 'children' !== n && (this[n] = r);
                                }
                }),
                (n.prototype.loadFromData = function (e) {
                    this.removeChildren();
                    for (var t = 0, o = e; t < o.length; t++) {
                        var n = o[t],
                            r = new this.tree.nodeClass(n);
                        (this.addChild(r), 'object' == typeof n && n.children && r.loadFromData(n.children));
                    }
                }),
                (n.prototype.addChild = function (e) {
                    (this.children.push(e), e._setParent(this));
                }),
                (n.prototype.addChildAtPosition = function (e, t) {
                    (this.children.splice(t, 0, e), e._setParent(this));
                }),
                (n.prototype.removeChild = function (e) {
                    (e.removeChildren(), this._removeChild(e));
                }),
                (n.prototype.getChildIndex = function (e) {
                    return jQuery.inArray(e, this.children);
                }),
                (n.prototype.hasChildren = function () {
                    return 0 !== this.children.length;
                }),
                (n.prototype.isFolder = function () {
                    return this.hasChildren() || this.load_on_demand;
                }),
                (n.prototype.iterate = function (i) {
                    var s = function (e, t) {
                        if (e.children)
                            for (var o = 0, n = e.children; o < n.length; o++) {
                                var r = n[o];
                                i(r, t) && r.hasChildren() && s(r, t + 1);
                            }
                    };
                    s(this, 0);
                }),
                (n.prototype.moveNode = function (e, t, o) {
                    e.parent &&
                        !e.isParentOf(t) &&
                        (e.parent._removeChild(e),
                        o === r.After
                            ? t.parent && t.parent.addChildAtPosition(e, t.parent.getChildIndex(t) + 1)
                            : o === r.Before
                              ? t.parent && t.parent.addChildAtPosition(e, t.parent.getChildIndex(t))
                              : o === r.Inside && t.addChildAtPosition(e, 0));
                }),
                (n.prototype.getData = function (e) {
                    return (
                        void 0 === e && (e = !1),
                        (function r(e) {
                            return e.map(function (e) {
                                var t = {};
                                for (var o in e)
                                    if (
                                        -1 === ['parent', 'children', 'element', 'tree'].indexOf(o) &&
                                        Object.prototype.hasOwnProperty.call(e, o)
                                    ) {
                                        var n = e[o];
                                        t[o] = n;
                                    }
                                return (e.hasChildren() && (t.children = r(e.children)), t);
                            });
                        })(e ? [this] : this.children)
                    );
                }),
                (n.prototype.getNodeByName = function (t) {
                    return this.getNodeByCallback(function (e) {
                        return e.name === t;
                    });
                }),
                (n.prototype.getNodeByCallback = function (t) {
                    var o = null;
                    return (
                        this.iterate(function (e) {
                            return !t(e) || ((o = e), !1);
                        }),
                        o
                    );
                }),
                (n.prototype.addAfter = function (e) {
                    if (this.parent) {
                        var t = new this.tree.nodeClass(e),
                            o = this.parent.getChildIndex(this);
                        return (
                            this.parent.addChildAtPosition(t, o + 1),
                            'object' == typeof e && e.children && e.children.length && t.loadFromData(e.children),
                            t
                        );
                    }
                    return null;
                }),
                (n.prototype.addBefore = function (e) {
                    if (this.parent) {
                        var t = new this.tree.nodeClass(e),
                            o = this.parent.getChildIndex(this);
                        return (
                            this.parent.addChildAtPosition(t, o),
                            'object' == typeof e && e.children && e.children.length && t.loadFromData(e.children),
                            t
                        );
                    }
                    return null;
                }),
                (n.prototype.addParent = function (e) {
                    if (this.parent) {
                        var t = new this.tree.nodeClass(e);
                        t._setParent(this.tree);
                        for (var o = this.parent, n = 0, r = o.children; n < r.length; n++) {
                            var i = r[n];
                            t.addChild(i);
                        }
                        return ((o.children = []), o.addChild(t), t);
                    }
                    return null;
                }),
                (n.prototype.remove = function () {
                    this.parent && (this.parent.removeChild(this), (this.parent = null));
                }),
                (n.prototype.append = function (e) {
                    var t = new this.tree.nodeClass(e);
                    return (this.addChild(t), 'object' == typeof e && e.children && e.children.length && t.loadFromData(e.children), t);
                }),
                (n.prototype.prepend = function (e) {
                    var t = new this.tree.nodeClass(e);
                    return (
                        this.addChildAtPosition(t, 0),
                        'object' == typeof e && e.children && e.children.length && t.loadFromData(e.children),
                        t
                    );
                }),
                (n.prototype.isParentOf = function (e) {
                    for (var t = e.parent; t; ) {
                        if (t === this) return !0;
                        t = t.parent;
                    }
                    return !1;
                }),
                (n.prototype.getLevel = function () {
                    for (var e = 0, t = this; t.parent; ) ((e += 1), (t = t.parent));
                    return e;
                }),
                (n.prototype.getNodeById = function (e) {
                    return this.idMapping[e];
                }),
                (n.prototype.addNodeToIndex = function (e) {
                    null != e.id && (this.idMapping[e.id] = e);
                }),
                (n.prototype.removeNodeFromIndex = function (e) {
                    null != e.id && delete this.idMapping[e.id];
                }),
                (n.prototype.removeChildren = function () {
                    var t = this;
                    (this.iterate(function (e) {
                        return (t.tree.removeNodeFromIndex(e), !0);
                    }),
                        (this.children = []));
                }),
                (n.prototype.getPreviousSibling = function () {
                    if (this.parent) {
                        var e = this.parent.getChildIndex(this) - 1;
                        return 0 <= e ? this.parent.children[e] : null;
                    }
                    return null;
                }),
                (n.prototype.getNextSibling = function () {
                    if (this.parent) {
                        var e = this.parent.getChildIndex(this) + 1;
                        return e < this.parent.children.length ? this.parent.children[e] : null;
                    }
                    return null;
                }),
                (n.prototype.getNodesByProperty = function (t, o) {
                    return this.filter(function (e) {
                        return e[t] === o;
                    });
                }),
                (n.prototype.filter = function (t) {
                    var o = [];
                    return (
                        this.iterate(function (e) {
                            return (t(e) && o.push(e), !0);
                        }),
                        o
                    );
                }),
                (n.prototype.getNextNode = function (e) {
                    return (
                        void 0 === e && (e = !0),
                        e && this.hasChildren() && this.is_open
                            ? this.children[0]
                            : this.parent
                              ? this.getNextSibling() || this.parent.getNextNode(!1)
                              : null
                    );
                }),
                (n.prototype.getPreviousNode = function () {
                    if (this.parent) {
                        var e = this.getPreviousSibling();
                        return e ? (e.hasChildren() && e.is_open ? e.getLastChild() : e) : this.getParent();
                    }
                    return null;
                }),
                (n.prototype.getParent = function () {
                    return this.parent && this.parent.parent ? this.parent : null;
                }),
                (n.prototype.getLastChild = function () {
                    if (this.hasChildren()) {
                        var e = this.children[this.children.length - 1];
                        return e.hasChildren() && e.is_open ? e.getLastChild() : e;
                    }
                    return null;
                }),
                (n.prototype.initFromData = function (e) {
                    var t,
                        i = this;
                    ((t = e),
                        i.setData(t),
                        t.children &&
                            (function (e) {
                                for (var t = 0, o = e; t < o.length; t++) {
                                    var n = o[t],
                                        r = new i.tree.nodeClass('');
                                    (r.initFromData(n), i.addChild(r));
                                }
                            })(t.children));
                }),
                (n.prototype._setParent = function (e) {
                    ((this.parent = e), (this.tree = e.tree), this.tree.addNodeToIndex(this));
                }),
                (n.prototype._removeChild = function (e) {
                    (this.children.splice(this.getChildIndex(e), 1), this.tree.removeNodeFromIndex(e));
                }),
                n
            );
        })();
        t.Node = s;
    },
    function (e, t, o) {
        'use strict';
        ((t.__esModule = !0),
            (t.isInt = function (e) {
                return 'number' == typeof e && e % 1 == 0;
            }),
            (t.isFunction = function (e) {
                return 'function' == typeof e;
            }),
            (t.htmlEscape = function (e) {
                return ('' + e)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;');
            }),
            (t.getBoolString = function (e) {
                return e ? 'true' : 'false';
            }));
    },
    function (e, t) {
        e.exports = jQuery;
    },
    function (e, t, o) {
        'use strict';
        t.__esModule = !0;
        var n = (function () {
            function u(e, t) {
                this.$el = jQuery(e);
                var o = this.constructor.defaults;
                this.options = jQuery.extend({}, o, t);
            }
            return (
                (u.register = function (a, e) {
                    function d() {
                        return 'simple_widget_' + e;
                    }
                    function l(e, t) {
                        var o = jQuery.data(e, t);
                        return o && o instanceof u ? o : null;
                    }
                    jQuery.fn[e] = function (e) {
                        for (var t = [], o = 1; o < arguments.length; o++) t[o - 1] = arguments[o];
                        if (void 0 === e || 'object' == typeof e)
                            return (function (e, t) {
                                for (var o = d(), n = 0, r = e.get(); n < r.length; n++) {
                                    var i = r[n];
                                    if (!l(i, o)) {
                                        var s = new a(i, t);
                                        (jQuery.data(i, o) || jQuery.data(i, o, s), s._init());
                                    }
                                }
                                return e;
                            })(this, e);
                        if ('string' == typeof e && '_' !== e[0]) {
                            var n = e;
                            return 'destroy' === n
                                ? (function (e) {
                                      for (var t = d(), o = 0, n = e.get(); o < n.length; o++) {
                                          var r = n[o],
                                              i = l(r, t);
                                          (i && i.destroy(), jQuery.removeData(r, t));
                                      }
                                  })(this)
                                : 'get_widget_class' === n
                                  ? a
                                  : (function (e, t, o) {
                                        for (var n = null, r = 0, i = e.get(); r < i.length; r++) {
                                            var s = i[r],
                                                a = jQuery.data(s, d());
                                            if (a && a instanceof u) {
                                                var l = a[t];
                                                l && 'function' == typeof l && (n = l.apply(a, o));
                                            }
                                        }
                                        return n;
                                    })(this, n, t);
                        }
                    };
                }),
                (u.prototype.destroy = function () {
                    this._deinit();
                }),
                (u.prototype._init = function () {}),
                (u.prototype._deinit = function () {}),
                (u.defaults = {}),
                u
            );
        })();
        t.default = n;
    },
    function (e, t, o) {
        'use strict';
        var n,
            r =
                (this && this.__extends) ||
                ((n = function (e, t) {
                    return (n =
                        Object.setPrototypeOf ||
                        ({ __proto__: [] } instanceof Array &&
                            function (e, t) {
                                e.__proto__ = t;
                            }) ||
                        function (e, t) {
                            for (var o in t) t.hasOwnProperty(o) && (e[o] = t[o]);
                        })(e, t);
                }),
                function (e, t) {
                    function o() {
                        this.constructor = e;
                    }
                    (n(e, t), (e.prototype = null === t ? Object.create(t) : ((o.prototype = t.prototype), new o())));
                }),
            l =
                (this && this.__assign) ||
                function () {
                    return (l =
                        Object.assign ||
                        function (e) {
                            for (var t, o = 1, n = arguments.length; o < n; o++)
                                for (var r in (t = arguments[o])) Object.prototype.hasOwnProperty.call(t, r) && (e[r] = t[r]);
                            return e;
                        }).apply(this, arguments);
                };
        t.__esModule = !0;
        var i = o(5),
            s = o(2),
            a = o(6),
            d = o(7),
            u = o(8),
            h = o(9),
            p = o(10),
            c = o(11),
            f = o(12),
            g = o(13),
            m = o(3),
            v = o(0),
            y = o(1),
            _ = o(14),
            N = 'Node parameter is empty',
            S = (function (e) {
                function t() {
                    var n = (null !== e && e.apply(this, arguments)) || this;
                    return (
                        (n._handleClick = function (e) {
                            var t = n._getClickTarget(e.target);
                            if (t)
                                if ('button' === t.type) (n.toggle(t.node, n.options.slide), e.preventDefault(), e.stopPropagation());
                                else if ('label' === t.type) {
                                    var o = t.node;
                                    n._triggerEvent('tree.click', { node: o, click_event: e }).isDefaultPrevented() || n._selectNode(o);
                                }
                        }),
                        (n._handleDblclick = function (e) {
                            var t = n._getClickTarget(e.target);
                            t && 'label' === t.type && n._triggerEvent('tree.dblclick', { node: t.node, click_event: e });
                        }),
                        (n._handleContextmenu = function (e) {
                            var t = s(e.target).closest('ul.jqtree-tree .jqtree-element');
                            if (t.length) {
                                var o = n._getNode(t);
                                if (o)
                                    return (
                                        e.preventDefault(),
                                        e.stopPropagation(),
                                        n._triggerEvent('tree.contextmenu', { node: o, click_event: e }),
                                        !1
                                    );
                            }
                            return null;
                        }),
                        n
                    );
                }
                return (
                    r(t, e),
                    (t.prototype.toggle = function (e, t) {
                        if (!e) throw Error(N);
                        var o = null == t ? this.options.slide : t;
                        return (e.is_open ? this.closeNode(e, o) : this.openNode(e, o), this.element);
                    }),
                    (t.prototype.getTree = function () {
                        return this.tree;
                    }),
                    (t.prototype.selectNode = function (e, t) {
                        return (this._selectNode(e, t), this.element);
                    }),
                    (t.prototype.getSelectedNode = function () {
                        return !!this.selectNodeHandler && this.selectNodeHandler.getSelectedNode();
                    }),
                    (t.prototype.toJson = function () {
                        return JSON.stringify(this.tree.getData());
                    }),
                    (t.prototype.loadData = function (e, t) {
                        return (this._loadData(e, t), this.element);
                    }),
                    (t.prototype.loadDataFromUrl = function (e, t, o) {
                        return ('string' == typeof e ? this._loadDataFromUrl(e, t, o) : this._loadDataFromUrl(null, e, t), this.element);
                    }),
                    (t.prototype.reload = function (e) {
                        return (this._loadDataFromUrl(null, null, e), this.element);
                    }),
                    (t.prototype.getNodeById = function (e) {
                        return this.tree.getNodeById(e);
                    }),
                    (t.prototype.getNodeByName = function (e) {
                        return this.tree.getNodeByName(e);
                    }),
                    (t.prototype.getNodesByProperty = function (e, t) {
                        return this.tree.getNodesByProperty(e, t);
                    }),
                    (t.prototype.getNodeByHtmlElement = function (e) {
                        return this._getNode(s(e));
                    }),
                    (t.prototype.getNodeByCallback = function (e) {
                        return this.tree.getNodeByCallback(e);
                    }),
                    (t.prototype.openNode = function (e, t, o) {
                        var n = this;
                        if (!e) throw Error(N);
                        var r,
                            i,
                            s = (y.isFunction(t) ? ((r = t), (i = null)) : ((i = t), (r = o)), null == i && (i = n.options.slide), [i, r]),
                            a = s[0],
                            l = s[1];
                        return (this._openNode(e, a, l), this.element);
                    }),
                    (t.prototype.closeNode = function (e, t) {
                        if (!e) throw Error(N);
                        var o = null == t ? this.options.slide : t;
                        return (
                            e.isFolder() && (new _.FolderElement(e, this).close(o, this.options.animationSpeed), this._saveState()),
                            this.element
                        );
                    }),
                    (t.prototype.isDragging = function () {
                        return !!this.dndHandler && this.dndHandler.isDragging;
                    }),
                    (t.prototype.refreshHitAreas = function () {
                        return (this.dndHandler && this.dndHandler.refresh(), this.element);
                    }),
                    (t.prototype.addNodeAfter = function (e, t) {
                        var o = t.addAfter(e);
                        return (o && this._refreshElements(t.parent), o);
                    }),
                    (t.prototype.addNodeBefore = function (e, t) {
                        if (!t) throw Error('Parameter is empty: existingNode');
                        var o = t.addBefore(e);
                        return (o && this._refreshElements(t.parent), o);
                    }),
                    (t.prototype.addParentNode = function (e, t) {
                        if (!t) throw Error('Parameter is empty: existingNode');
                        var o = t.addParent(e);
                        return (o && this._refreshElements(o.parent), o);
                    }),
                    (t.prototype.removeNode = function (e) {
                        if (!e) throw Error(N);
                        var t = e;
                        return (
                            t.parent &&
                                this.selectNodeHandler &&
                                (this.selectNodeHandler.removeFromSelection(t, !0), t.remove(), this._refreshElements(t.parent)),
                            this.element
                        );
                    }),
                    (t.prototype.appendNode = function (e, t) {
                        var o = t || this.tree,
                            n = o.append(e);
                        return (this._refreshElements(o), n);
                    }),
                    (t.prototype.prependNode = function (e, t) {
                        var o = t || this.tree,
                            n = o.prepend(e);
                        return (this._refreshElements(o), n);
                    }),
                    (t.prototype.updateNode = function (e, t) {
                        if (!e) throw Error(N);
                        var o = t.id && t.id !== e.id;
                        return (
                            o && this.tree.removeNodeFromIndex(e),
                            e.setData(t),
                            o && this.tree.addNodeToIndex(e),
                            'object' == typeof t && t.children && (e.removeChildren(), t.children.length && e.loadFromData(t.children)),
                            this._refreshElements(e),
                            this._selectCurrentNode(),
                            this.element
                        );
                    }),
                    (t.prototype.moveNode = function (e, t, o) {
                        if (!e) throw Error(N);
                        if (!t) throw Error('Parameter is empty: targetNode');
                        var n = v.getPosition(o);
                        return (this.tree.moveNode(e, t, n), this._refreshElements(null), this.element);
                    }),
                    (t.prototype.getStateFromStorage = function () {
                        if (this.saveStateHandler) return this.saveStateHandler.getStateFromStorage();
                    }),
                    (t.prototype.addToSelection = function (e, t) {
                        if (!e) throw Error(N);
                        var o = e;
                        return (
                            this.selectNodeHandler &&
                                (this.selectNodeHandler.addToSelection(o),
                                this._getNodeElementForNode(o).select(void 0 === t || t),
                                this._saveState()),
                            this.element
                        );
                    }),
                    (t.prototype.getSelectedNodes = function () {
                        return this.selectNodeHandler ? this.selectNodeHandler.getSelectedNodes() : [];
                    }),
                    (t.prototype.isNodeSelected = function (e) {
                        if (!e) throw Error(N);
                        return !!this.selectNodeHandler && this.selectNodeHandler.isNodeSelected(e);
                    }),
                    (t.prototype.removeFromSelection = function (e) {
                        if (!e) throw Error(N);
                        return (
                            this.selectNodeHandler &&
                                (this.selectNodeHandler.removeFromSelection(e),
                                this._getNodeElementForNode(e).deselect(),
                                this._saveState()),
                            this.element
                        );
                    }),
                    (t.prototype.scrollToNode = function (e) {
                        if (!e) throw Error(N);
                        if (this.scrollHandler) {
                            var t = s(e.element).offset(),
                                o = t ? t.top : 0,
                                n = this.$el.offset(),
                                r = o - (n ? n.top : 0);
                            this.scrollHandler.scrollToY(r);
                        }
                        return this.element;
                    }),
                    (t.prototype.getState = function () {
                        if (this.saveStateHandler) return this.saveStateHandler.getState();
                    }),
                    (t.prototype.setState = function (e) {
                        return (
                            this.saveStateHandler && (this.saveStateHandler.setInitialState(e), this._refreshElements(null)),
                            this.element
                        );
                    }),
                    (t.prototype.setOption = function (e, t) {
                        return ((this.options[e] = t), this.element);
                    }),
                    (t.prototype.moveDown = function () {
                        return (this.keyHandler && this.keyHandler.moveDown(), this.element);
                    }),
                    (t.prototype.moveUp = function () {
                        return (this.keyHandler && this.keyHandler.moveUp(), this.element);
                    }),
                    (t.prototype.getVersion = function () {
                        return i.default;
                    }),
                    (t.prototype.testGenerateHitAreas = function (e) {
                        return this.dndHandler
                            ? ((this.dndHandler.currentItem = this._getNodeElementForNode(e)),
                              this.dndHandler.generateHitAreas(),
                              this.dndHandler.hitAreas)
                            : [];
                    }),
                    (t.prototype._triggerEvent = function (e, t) {
                        var o = s.Event(e);
                        return (s.extend(o, t), this.element.trigger(o), o);
                    }),
                    (t.prototype._openNode = function (e, t, o) {
                        var n = this;
                        void 0 === t && (t = !0);
                        function r(e, t, o) {
                            new _.FolderElement(e, n).open(o, t, n.options.animationSpeed);
                        }
                        if (e.isFolder())
                            if (e.load_on_demand) this._loadFolderOnDemand(e, t, o);
                            else {
                                for (var i = e.parent; i; ) (i.parent && r(i, !1, null), (i = i.parent));
                                (r(e, t, o), this._saveState());
                            }
                    }),
                    (t.prototype._refreshElements = function (e) {
                        (this.renderer.render(e), this._triggerEvent('tree.refresh'));
                    }),
                    (t.prototype._getNodeElementForNode = function (e) {
                        return e.isFolder() ? new _.FolderElement(e, this) : new _.NodeElement(e, this);
                    }),
                    (t.prototype._getNodeElement = function (e) {
                        var t = this._getNode(e);
                        return t ? this._getNodeElementForNode(t) : null;
                    }),
                    (t.prototype._containsElement = function (e) {
                        var t = this._getNode(s(e));
                        return null != t && t.tree === this.tree;
                    }),
                    (t.prototype._getScrollLeft = function () {
                        return (this.scrollHandler && this.scrollHandler.getScrollLeft()) || 0;
                    }),
                    (t.prototype._init = function () {
                        (e.prototype._init.call(this),
                            (this.element = this.$el),
                            (this.mouseDelay = 300),
                            (this.isInitialized = !1),
                            (this.options.rtl = this._getRtlOption()),
                            null === this.options.closedIcon && (this.options.closedIcon = this._getDefaultClosedIcon()),
                            (this.renderer = new d.default(this)),
                            (this.dataLoader = new u.default(this)),
                            null != c.default ? (this.saveStateHandler = new c.default(this)) : (this.options.saveState = !1),
                            null != g.default && (this.selectNodeHandler = new g.default(this)),
                            null != a.DragAndDropHandler
                                ? (this.dndHandler = new a.DragAndDropHandler(this))
                                : (this.options.dragAndDrop = !1),
                            null != f.default && (this.scrollHandler = new f.default(this)),
                            null != h.default && null != g.default && (this.keyHandler = new h.default(this)),
                            this._initData(),
                            this.element.click(this._handleClick),
                            this.element.dblclick(this._handleDblclick),
                            this.options.useContextMenu && this.element.on('contextmenu', this._handleContextmenu));
                    }),
                    (t.prototype._deinit = function () {
                        (this.element.empty(),
                            this.element.off(),
                            this.keyHandler && this.keyHandler.deinit(),
                            (this.tree = new v.Node({}, !0)),
                            e.prototype._deinit.call(this));
                    }),
                    (t.prototype._mouseCapture = function (e) {
                        return !(!this.options.dragAndDrop || !this.dndHandler) && this.dndHandler.mouseCapture(e);
                    }),
                    (t.prototype._mouseStart = function (e) {
                        return !(!this.options.dragAndDrop || !this.dndHandler) && this.dndHandler.mouseStart(e);
                    }),
                    (t.prototype._mouseDrag = function (e) {
                        if (this.options.dragAndDrop && this.dndHandler) {
                            var t = this.dndHandler.mouseDrag(e);
                            return (this.scrollHandler && this.scrollHandler.checkScrolling(), t);
                        }
                        return !1;
                    }),
                    (t.prototype._mouseStop = function (e) {
                        return !(!this.options.dragAndDrop || !this.dndHandler) && this.dndHandler.mouseStop(e);
                    }),
                    (t.prototype._initData = function () {
                        this.options.data
                            ? this._loadData(this.options.data, null)
                            : this._getDataUrlInfo(null)
                              ? this._loadDataFromUrl(null, null, null)
                              : this._loadData([], null);
                    }),
                    (t.prototype._getDataUrlInfo = function (n) {
                        function e(e) {
                            if (n && n.id) {
                                var t = { node: n.id };
                                e.data = t;
                            } else {
                                var o = r._getNodeIdToBeSelected();
                                o && ((t = { selected_node: o }), (e.data = t));
                            }
                        }
                        var t,
                            r = this,
                            o = this.options.dataUrl || this.element.data('url');
                        return 'function' == typeof o
                            ? o(n)
                            : 'string' == typeof o
                              ? (e((t = { url: o })), t)
                              : ('object' == typeof o && e(o), o);
                    }),
                    (t.prototype._getNodeIdToBeSelected = function () {
                        return this.options.saveState && this.saveStateHandler ? this.saveStateHandler.getNodeIdToBeSelected() : null;
                    }),
                    (t.prototype._initTree = function (e) {
                        function t() {
                            o.isInitialized || ((o.isInitialized = !0), o._triggerEvent('tree.init'));
                        }
                        var o = this;
                        ((this.tree = new this.options.nodeClass(null, !0, this.options.nodeClass)),
                            this.selectNodeHandler && this.selectNodeHandler.clear(),
                            this.tree.loadFromData(e));
                        var n = this._setInitialState();
                        (this._refreshElements(null), n ? this._setInitialStateOnDemand(t) : t());
                    }),
                    (t.prototype._setInitialState = function () {
                        var t = this,
                            e = (function () {
                                if (t.options.saveState && t.saveStateHandler) {
                                    var e = t.saveStateHandler.getStateFromStorage();
                                    return e ? [!0, t.saveStateHandler.setInitialState(e)] : [!1, !1];
                                }
                                return [!1, !1];
                            })(),
                            o = e[0],
                            n = e[1];
                        return (
                            o ||
                                (n = (function () {
                                    if (!1 === t.options.autoOpen) return !1;
                                    var o = t._getAutoOpenMaxLevel(),
                                        n = !1;
                                    return (
                                        t.tree.iterate(function (e, t) {
                                            return e.load_on_demand ? !(n = !0) : !!e.hasChildren() && ((e.is_open = !0), t !== o);
                                        }),
                                        n
                                    );
                                })()),
                            n
                        );
                    }),
                    (t.prototype._setInitialStateOnDemand = function (t) {
                        var n,
                            r,
                            i,
                            s = this;
                        (function () {
                            if (s.options.saveState && s.saveStateHandler) {
                                var e = s.saveStateHandler.getStateFromStorage();
                                return !!e && (s.saveStateHandler.setInitialStateOnDemand(e, t), !0);
                            }
                            return !1;
                        })() ||
                            ((n = s._getAutoOpenMaxLevel()),
                            (r = 0),
                            (i = function () {
                                (s.tree.iterate(function (e, t) {
                                    return e.load_on_demand
                                        ? (e.is_loading ||
                                              ((o = e),
                                              (r += 1),
                                              s._openNode(o, !1, function () {
                                                  ((r -= 1), i());
                                              })),
                                          !1)
                                        : (s._openNode(e, !1, null), t !== n);
                                    var o;
                                }),
                                    0 === r && t());
                            })());
                    }),
                    (t.prototype._getAutoOpenMaxLevel = function () {
                        return !0 === this.options.autoOpen ? -1 : parseInt(this.options.autoOpen, 10);
                    }),
                    (t.prototype._getClickTarget = function (e) {
                        var t = s(e),
                            o = t.closest('.jqtree-toggler');
                        if (o.length) {
                            if ((n = this._getNode(o))) return { type: 'button', node: n };
                        } else {
                            var n,
                                r = t.closest('.jqtree-element');
                            if (r.length && (n = this._getNode(r))) return { type: 'label', node: n };
                        }
                        return null;
                    }),
                    (t.prototype._getNode = function (e) {
                        var t = e.closest('li.jqtree_common');
                        return 0 === t.length ? null : t.data('node');
                    }),
                    (t.prototype._saveState = function () {
                        this.options.saveState && this.saveStateHandler && this.saveStateHandler.saveState();
                    }),
                    (t.prototype._selectCurrentNode = function () {
                        var e = this.getSelectedNode();
                        if (e) {
                            var t = this._getNodeElementForNode(e);
                            t && t.select(!0);
                        }
                    }),
                    (t.prototype._deselectCurrentNode = function () {
                        var e = this.getSelectedNode();
                        e && this.removeFromSelection(e);
                    }),
                    (t.prototype._getDefaultClosedIcon = function () {
                        return this.options.rtl ? '&#x25c0;' : '&#x25ba;';
                    }),
                    (t.prototype._getRtlOption = function () {
                        if (null != this.options.rtl) return this.options.rtl;
                        var e = this.element.data('rtl');
                        return null != e && !1 !== e;
                    }),
                    (t.prototype._selectNode = function (e, t) {
                        var o = this;
                        if (this.selectNodeHandler) {
                            var n = l({}, { mustSetFocus: !0, mustToggle: !0 }, t || {}),
                                r = function () {
                                    o.options.saveState && o.saveStateHandler && o.saveStateHandler.saveState();
                                };
                            if (!e) return (this._deselectCurrentNode(), void r());
                            if (o.options.onCanSelectNode ? o.options.selectable && o.options.onCanSelectNode(e) : o.options.selectable) {
                                var i,
                                    s = e;
                                if (this.selectNodeHandler.isNodeSelected(s))
                                    n.mustToggle &&
                                        (this._deselectCurrentNode(), this._triggerEvent('tree.select', { node: null, previous_node: s }));
                                else {
                                    var a = this.getSelectedNode();
                                    (this._deselectCurrentNode(),
                                        this.addToSelection(s, n.mustSetFocus),
                                        this._triggerEvent('tree.select', { node: s, deselected_node: a }),
                                        (i = e.parent) && i.parent && !i.is_open && o.openNode(i, !1));
                                }
                                r();
                            }
                        }
                    }),
                    (t.prototype._loadData = function (e, t) {
                        e &&
                            (this._triggerEvent('tree.load_data', { tree_data: e }),
                            t ? (this._deselectNodes(t), this._loadSubtree(e, t)) : this._initTree(e),
                            this.isDragging() && this.dndHandler && this.dndHandler.refresh());
                    }),
                    (t.prototype._deselectNodes = function (e) {
                        if (this.selectNodeHandler)
                            for (var t = 0, o = this.selectNodeHandler.getSelectedNodesUnder(e); t < o.length; t++) {
                                var n = o[t];
                                this.selectNodeHandler.removeFromSelection(n);
                            }
                    }),
                    (t.prototype._loadSubtree = function (e, t) {
                        (t.loadFromData(e), (t.load_on_demand = !1), (t.is_loading = !1), this._refreshElements(t));
                    }),
                    (t.prototype._loadDataFromUrl = function (e, t, o) {
                        var n = e || this._getDataUrlInfo(t);
                        this.dataLoader.loadFromUrl(n, t, o);
                    }),
                    (t.prototype._loadFolderOnDemand = function (e, t, o) {
                        var n = this;
                        (void 0 === t && (t = !0),
                            (e.is_loading = !0),
                            this._loadDataFromUrl(null, e, function () {
                                n._openNode(e, t, o);
                            }));
                    }),
                    (t.defaults = {
                        animationSpeed: 'fast',
                        autoOpen: !1,
                        saveState: !1,
                        dragAndDrop: !1,
                        selectable: !0,
                        useContextMenu: !0,
                        onCanSelectNode: null,
                        onSetStateFromStorage: null,
                        onGetStateFromStorage: null,
                        onCreateLi: null,
                        onIsMoveHandle: null,
                        onCanMove: null,
                        onCanMoveTo: null,
                        onLoadFailed: null,
                        autoEscape: !0,
                        dataUrl: null,
                        closedIcon: null,
                        openedIcon: '&#x25bc;',
                        slide: !0,
                        nodeClass: v.Node,
                        dataFilter: null,
                        keyboardSupport: !0,
                        openFolderDelay: 500,
                        rtl: !1,
                        onDragMove: null,
                        onDragStop: null,
                        buttonLeft: !0,
                        onLoading: null,
                        tabIndex: 0,
                    }),
                    t
                );
            })(p.default);
        m.default.register(S, 'tree');
    },
    function (e, t, o) {
        'use strict';
        ((t.__esModule = !0), (t.default = '1.4.11'));
    },
    function (e, t, o) {
        'use strict';
        var n,
            i =
                (this && this.__extends) ||
                ((n = function (e, t) {
                    return (n =
                        Object.setPrototypeOf ||
                        ({ __proto__: [] } instanceof Array &&
                            function (e, t) {
                                e.__proto__ = t;
                            }) ||
                        function (e, t) {
                            for (var o in t) t.hasOwnProperty(o) && (e[o] = t[o]);
                        })(e, t);
                }),
                function (e, t) {
                    function o() {
                        this.constructor = e;
                    }
                    (n(e, t), (e.prototype = null === t ? Object.create(t) : ((o.prototype = t.prototype), new o())));
                });
        t.__esModule = !0;
        var l = o(2),
            a = o(0),
            s = o(1),
            r = (function () {
                function e(e) {
                    ((this.treeWidget = e),
                        (this.hoveredArea = null),
                        (this.hitAreas = []),
                        (this.isDragging = !1),
                        (this.currentItem = null),
                        (this.positionInfo = null));
                }
                return (
                    (e.prototype.mouseCapture = function (e) {
                        var t = l(e.target);
                        if (!this.mustCaptureElement(t)) return null;
                        if (this.treeWidget.options.onIsMoveHandle && !this.treeWidget.options.onIsMoveHandle(t)) return null;
                        var o = this.treeWidget._getNodeElement(t);
                        return (
                            o && this.treeWidget.options.onCanMove && (this.treeWidget.options.onCanMove(o.node) || (o = null)),
                            (this.currentItem = o),
                            null != this.currentItem
                        );
                    }),
                    (e.prototype.generateHitAreas = function () {
                        if (this.currentItem) {
                            var e = new d(this.treeWidget.tree, this.currentItem.node, this.getTreeDimensions().bottom);
                            this.hitAreas = e.generate();
                        } else this.hitAreas = [];
                    }),
                    (e.prototype.mouseStart = function (e) {
                        if (this.currentItem && void 0 !== e.pageX && void 0 !== e.pageY) {
                            this.refresh();
                            var t = l(e.target).offset(),
                                o = t ? t.left : 0,
                                n = t ? t.top : 0,
                                r = this.currentItem.node,
                                i = this.treeWidget.options.autoEscape ? s.htmlEscape(r.name) : r.name;
                            return (
                                (this.dragElement = new u(i, e.pageX - o, e.pageY - n, this.treeWidget.element)),
                                (this.isDragging = !0),
                                (this.positionInfo = e),
                                this.currentItem.$element.addClass('jqtree-moving'),
                                !0
                            );
                        }
                        return !1;
                    }),
                    (e.prototype.mouseDrag = function (e) {
                        if (this.currentItem && this.dragElement && void 0 !== e.pageX && void 0 !== e.pageY) {
                            (this.dragElement.move(e.pageX, e.pageY), (this.positionInfo = e));
                            var t = this.findHoveredArea(e.pageX, e.pageY);
                            return (
                                this.canMoveToArea(t) && t
                                    ? (t.node.isFolder() || this.stopOpenFolderTimer(),
                                      this.hoveredArea !== t &&
                                          ((this.hoveredArea = t),
                                          this.mustOpenFolderTimer(t) ? this.startOpenFolderTimer(t.node) : this.stopOpenFolderTimer(),
                                          this.updateDropHint()))
                                    : (this.removeHover(), this.removeDropHint(), this.stopOpenFolderTimer()),
                                t ||
                                    (this.treeWidget.options.onDragMove &&
                                        this.treeWidget.options.onDragMove(this.currentItem.node, e.originalEvent)),
                                !0
                            );
                        }
                        return !1;
                    }),
                    (e.prototype.mouseStop = function (e) {
                        (this.moveItem(e), this.clear(), this.removeHover(), this.removeDropHint(), this.removeHitAreas());
                        var t = this.currentItem;
                        return (
                            this.currentItem && (this.currentItem.$element.removeClass('jqtree-moving'), (this.currentItem = null)),
                            (this.isDragging = !1),
                            (this.positionInfo = null),
                            !this.hoveredArea &&
                                t &&
                                this.treeWidget.options.onDragStop &&
                                this.treeWidget.options.onDragStop(t.node, e.originalEvent),
                            !1
                        );
                    }),
                    (e.prototype.refresh = function () {
                        (this.removeHitAreas(),
                            this.currentItem &&
                                (this.generateHitAreas(),
                                (this.currentItem = this.treeWidget._getNodeElementForNode(this.currentItem.node)),
                                this.isDragging && this.currentItem.$element.addClass('jqtree-moving')));
                    }),
                    (e.prototype.mustCaptureElement = function (e) {
                        return !e.is('input,select,textarea');
                    }),
                    (e.prototype.canMoveToArea = function (e) {
                        if (e && this.currentItem) {
                            if (this.treeWidget.options.onCanMoveTo) {
                                var t = a.getPositionName(e.position);
                                return this.treeWidget.options.onCanMoveTo(this.currentItem.node, e.node, t);
                            }
                            return !0;
                        }
                        return !1;
                    }),
                    (e.prototype.removeHitAreas = function () {
                        this.hitAreas = [];
                    }),
                    (e.prototype.clear = function () {
                        this.dragElement && (this.dragElement.remove(), (this.dragElement = null));
                    }),
                    (e.prototype.removeDropHint = function () {
                        this.previousGhost && this.previousGhost.remove();
                    }),
                    (e.prototype.removeHover = function () {
                        this.hoveredArea = null;
                    }),
                    (e.prototype.findHoveredArea = function (e, t) {
                        var o = this.getTreeDimensions();
                        if (e < o.left || t < o.top || e > o.right || t > o.bottom) return null;
                        for (var n = 0, r = this.hitAreas.length; n < r; ) {
                            var i = (n + r) >> 1,
                                s = this.hitAreas[i];
                            if (t < s.top) r = i;
                            else {
                                if (!(t > s.bottom)) return s;
                                n = 1 + i;
                            }
                        }
                        return null;
                    }),
                    (e.prototype.mustOpenFolderTimer = function (e) {
                        var t = e.node;
                        return t.isFolder() && !t.is_open && e.position === a.Position.Inside;
                    }),
                    (e.prototype.updateDropHint = function () {
                        if (this.hoveredArea) {
                            this.removeDropHint();
                            var e = this.treeWidget._getNodeElementForNode(this.hoveredArea.node);
                            this.previousGhost = e.addDropHint(this.hoveredArea.position);
                        }
                    }),
                    (e.prototype.startOpenFolderTimer = function (e) {
                        var t = this;
                        (this.stopOpenFolderTimer(),
                            (this.openFolderTimer = window.setTimeout(function () {
                                t.treeWidget._openNode(e, t.treeWidget.options.slide, function () {
                                    (t.refresh(), t.updateDropHint());
                                });
                            }, this.treeWidget.options.openFolderDelay)));
                    }),
                    (e.prototype.stopOpenFolderTimer = function () {
                        this.openFolderTimer && (clearTimeout(this.openFolderTimer), (this.openFolderTimer = null));
                    }),
                    (e.prototype.moveItem = function (e) {
                        var t = this;
                        if (
                            this.currentItem &&
                            this.hoveredArea &&
                            this.hoveredArea.position !== a.Position.None &&
                            this.canMoveToArea(this.hoveredArea)
                        ) {
                            var o = this.currentItem.node,
                                n = this.hoveredArea.node,
                                r = this.hoveredArea.position,
                                i = o.parent;
                            r === a.Position.Inside && (this.hoveredArea.node.is_open = !0);
                            var s = function () {
                                (t.treeWidget.tree.moveNode(o, n, r), t.treeWidget.element.empty(), t.treeWidget._refreshElements(null));
                            };
                            this.treeWidget
                                ._triggerEvent('tree.move', {
                                    move_info: {
                                        moved_node: o,
                                        target_node: n,
                                        position: a.getPositionName(r),
                                        previous_parent: i,
                                        do_move: s,
                                        original_event: e.originalEvent,
                                    },
                                })
                                .isDefaultPrevented() || s();
                        }
                    }),
                    (e.prototype.getTreeDimensions = function () {
                        var e = this.treeWidget.element.offset();
                        if (e) {
                            var t = this.treeWidget.element,
                                o = t.width() || 0,
                                n = t.height() || 0,
                                r = e.left + this.treeWidget._getScrollLeft();
                            return { left: r, top: e.top, right: r + o, bottom: e.top + n + 16 };
                        }
                        return { left: 0, top: 0, right: 0, bottom: 0 };
                    }),
                    e
                );
            })();
        t.DragAndDropHandler = r;
        var d = (function (r) {
            function e(e, t, o) {
                var n = r.call(this, e) || this;
                return ((n.currentNode = t), (n.treeBottom = o), n);
            }
            return (
                i(e, r),
                (e.prototype.generate = function () {
                    return ((this.positions = []), (this.lastTop = 0), this.iterate(), this.generateHitAreas(this.positions));
                }),
                (e.prototype.generateHitAreas = function (e) {
                    for (var t = -1, o = [], n = [], r = 0, i = e; r < i.length; r++) {
                        var s = i[r];
                        (s.top !== t && o.length && (o.length && this.generateHitAreasForGroup(n, o, t, s.top), (t = s.top), (o = [])),
                            o.push(s));
                    }
                    return (this.generateHitAreasForGroup(n, o, t, this.treeBottom), n);
                }),
                (e.prototype.handleOpenFolder = function (e, t) {
                    return (
                        e !== this.currentNode &&
                        (e.children[0] !== this.currentNode && this.addPosition(e, a.Position.Inside, this.getTop(t)), !0)
                    );
                }),
                (e.prototype.handleClosedFolder = function (e, t, o) {
                    var n = this.getTop(o);
                    e === this.currentNode
                        ? this.addPosition(e, a.Position.None, n)
                        : (this.addPosition(e, a.Position.Inside, n), t !== this.currentNode && this.addPosition(e, a.Position.After, n));
                }),
                (e.prototype.handleFirstNode = function (e) {
                    e !== this.currentNode && this.addPosition(e, a.Position.Before, this.getTop(l(e.element)));
                }),
                (e.prototype.handleAfterOpenFolder = function (e, t) {
                    e === this.currentNode || t === this.currentNode
                        ? this.addPosition(e, a.Position.None, this.lastTop)
                        : this.addPosition(e, a.Position.After, this.lastTop);
                }),
                (e.prototype.handleNode = function (e, t, o) {
                    var n = this.getTop(o);
                    (e === this.currentNode ? this.addPosition(e, a.Position.None, n) : this.addPosition(e, a.Position.Inside, n),
                        t === this.currentNode || e === this.currentNode
                            ? this.addPosition(e, a.Position.None, n)
                            : this.addPosition(e, a.Position.After, n));
                }),
                (e.prototype.getTop = function (e) {
                    var t = e.offset();
                    return t ? t.top : 0;
                }),
                (e.prototype.addPosition = function (e, t, o) {
                    var n = { top: o, bottom: 0, node: e, position: t };
                    (this.positions.push(n), (this.lastTop = o));
                }),
                (e.prototype.generateHitAreasForGroup = function (e, t, o, n) {
                    for (var r = Math.min(t.length, 4), i = Math.round((n - o) / r), s = o, a = 0; a < r; ) {
                        var l = t[a];
                        (e.push({ top: s, bottom: s + i, node: l.node, position: l.position }), (s += i), (a += 1));
                    }
                }),
                e
            );
        })(
            (function () {
                function e(e) {
                    this.tree = e;
                }
                return (
                    (e.prototype.iterate = function () {
                        var i = this,
                            s = !0,
                            a = function (o, e) {
                                var t = (o.is_open || !o.element) && o.hasChildren(),
                                    n = null;
                                if (o.element) {
                                    if (!(n = l(o.element)).is(':visible')) return;
                                    (s && (i.handleFirstNode(o), (s = !1)),
                                        o.hasChildren()
                                            ? o.is_open
                                                ? i.handleOpenFolder(o, n) || (t = !1)
                                                : i.handleClosedFolder(o, e, n)
                                            : i.handleNode(o, e, n));
                                }
                                if (t) {
                                    var r = o.children.length;
                                    (o.children.forEach(function (e, t) {
                                        a(o.children[t], t === r - 1 ? null : o.children[t + 1]);
                                    }),
                                        o.is_open && n && i.handleAfterOpenFolder(o, e));
                                }
                            };
                        a(this.tree, null);
                    }),
                    e
                );
            })()
        );
        t.HitAreasGenerator = d;
        var u = (function () {
            function e(e, t, o, n) {
                ((this.offsetX = t),
                    (this.offsetY = o),
                    (this.$element = l('<span class="jqtree-title jqtree-dragging">' + e + '</span>')),
                    this.$element.css('position', 'absolute'),
                    n.append(this.$element));
            }
            return (
                (e.prototype.move = function (e, t) {
                    this.$element.offset({ left: e - this.offsetX, top: t - this.offsetY });
                }),
                (e.prototype.remove = function () {
                    this.$element.remove();
                }),
                e
            );
        })();
    },
    function (e, t, o) {
        'use strict';
        t.__esModule = !0;
        var a = o(1),
            n = (function () {
                function e(e) {
                    ((this.treeWidget = e),
                        (this.openedIconElement = this.createButtonElement(e.options.openedIcon)),
                        (this.closedIconElement = this.createButtonElement(e.options.closedIcon)));
                }
                return (
                    (e.prototype.render = function (e) {
                        e && e.parent ? this.renderFromNode(e) : this.renderFromRoot();
                    }),
                    (e.prototype.renderFromRoot = function () {
                        var e = this.treeWidget.element;
                        (e.empty(), this.createDomElements(e[0], this.treeWidget.tree.children, !0, 1));
                    }),
                    (e.prototype.renderFromNode = function (e) {
                        var t = jQuery(e.element),
                            o = this.createLi(e, e.getLevel());
                        (this.attachNodeData(e, o),
                            t.after(o),
                            t.remove(),
                            e.children && this.createDomElements(o, e.children, !1, e.getLevel() + 1));
                    }),
                    (e.prototype.createDomElements = function (e, t, o, n) {
                        var r = this.createUl(o);
                        e.appendChild(r);
                        for (var i = 0, s = t; i < s.length; i++) {
                            var a = s[i],
                                l = this.createLi(a, n);
                            (r.appendChild(l),
                                this.attachNodeData(a, l),
                                a.hasChildren() && this.createDomElements(l, a.children, !1, n + 1));
                        }
                    }),
                    (e.prototype.attachNodeData = function (e, t) {
                        ((e.element = t), jQuery(t).data('node', e));
                    }),
                    (e.prototype.createUl = function (e) {
                        var t, o;
                        e
                            ? ((t = 'jqtree-tree'), (o = 'tree'), this.treeWidget.options.rtl && (t += ' jqtree-rtl'))
                            : ((t = ''), (o = 'group'));
                        var n = document.createElement('ul');
                        return ((n.className = 'jqtree_common ' + t), n.setAttribute('role', o), n);
                    }),
                    (e.prototype.createLi = function (e, t) {
                        var o = Boolean(this.treeWidget.selectNodeHandler && this.treeWidget.selectNodeHandler.isNodeSelected(e)),
                            n = e.isFolder() ? this.createFolderLi(e, t, o) : this.createNodeLi(e, t, o);
                        return (this.treeWidget.options.onCreateLi && this.treeWidget.options.onCreateLi(e, jQuery(n), o), n);
                    }),
                    (e.prototype.createFolderLi = function (e, t, o) {
                        var n = this.getButtonClasses(e),
                            r = this.getFolderClasses(e, o),
                            i = e.is_open ? this.openedIconElement : this.closedIconElement,
                            s = document.createElement('li');
                        ((s.className = 'jqtree_common ' + r), s.setAttribute('role', 'presentation'));
                        var a = document.createElement('div');
                        ((a.className = 'jqtree-element jqtree_common'), a.setAttribute('role', 'presentation'), s.appendChild(a));
                        var l = document.createElement('a');
                        return (
                            (l.className = n),
                            l.appendChild(i.cloneNode(!0)),
                            l.setAttribute('role', 'presentation'),
                            l.setAttribute('aria-hidden', 'true'),
                            this.treeWidget.options.buttonLeft && a.appendChild(l),
                            a.appendChild(this.createTitleSpan(e.name, t, o, e.is_open, !0)),
                            this.treeWidget.options.buttonLeft || a.appendChild(l),
                            s
                        );
                    }),
                    (e.prototype.createNodeLi = function (e, t, o) {
                        var n = ['jqtree_common'];
                        o && n.push('jqtree-selected');
                        var r = n.join(' '),
                            i = document.createElement('li');
                        ((i.className = r), i.setAttribute('role', 'presentation'));
                        var s = document.createElement('div');
                        return (
                            (s.className = 'jqtree-element jqtree_common'),
                            s.setAttribute('role', 'presentation'),
                            i.appendChild(s),
                            s.appendChild(this.createTitleSpan(e.name, t, o, e.is_open, !1)),
                            i
                        );
                    }),
                    (e.prototype.createTitleSpan = function (e, t, o, n, r) {
                        var i = document.createElement('span'),
                            s = 'jqtree-title jqtree_common';
                        return (
                            r && (s += ' jqtree-title-folder'),
                            (i.className = s),
                            i.setAttribute('role', 'treeitem'),
                            i.setAttribute('aria-level', '' + t),
                            i.setAttribute('aria-selected', a.getBoolString(o)),
                            i.setAttribute('aria-expanded', a.getBoolString(n)),
                            o && i.setAttribute('tabindex', this.treeWidget.options.tabIndex),
                            (i.innerHTML = this.escapeIfNecessary(e)),
                            i
                        );
                    }),
                    (e.prototype.getButtonClasses = function (e) {
                        var t = ['jqtree-toggler', 'jqtree_common'];
                        return (
                            e.is_open || t.push('jqtree-closed'),
                            this.treeWidget.options.buttonLeft ? t.push('jqtree-toggler-left') : t.push('jqtree-toggler-right'),
                            t.join(' ')
                        );
                    }),
                    (e.prototype.getFolderClasses = function (e, t) {
                        var o = ['jqtree-folder'];
                        return (
                            e.is_open || o.push('jqtree-closed'),
                            t && o.push('jqtree-selected'),
                            e.is_loading && o.push('jqtree-loading'),
                            o.join(' ')
                        );
                    }),
                    (e.prototype.escapeIfNecessary = function (e) {
                        return this.treeWidget.options.autoEscape ? a.htmlEscape(e) : e;
                    }),
                    (e.prototype.createButtonElement = function (e) {
                        if ('string' != typeof e) return jQuery(e)[0];
                        var t = document.createElement('div');
                        return ((t.innerHTML = e), document.createTextNode(t.innerHTML));
                    }),
                    e
                );
            })();
        t.default = n;
    },
    function (e, t, o) {
        'use strict';
        t.__esModule = !0;
        var n = (function () {
            function e(e) {
                this.treeWidget = e;
            }
            return (
                (e.prototype.loadFromUrl = function (e, t, o) {
                    var n = this;
                    if (e) {
                        var r = this.getDomElement(t);
                        (this.addLoadingClass(r), this.notifyLoading(!0, t, r));
                        var i = function () {
                            (n.removeLoadingClass(r), n.notifyLoading(!1, t, r));
                        };
                        this.submitRequest(
                            e,
                            function (e) {
                                (i(), n.treeWidget.loadData(n.parseData(e), t), o && 'function' == typeof o && o());
                            },
                            function (e) {
                                i();
                                var t = n.treeWidget.options.onLoadFailed;
                                t && t(e);
                            }
                        );
                    }
                }),
                (e.prototype.addLoadingClass = function (e) {
                    e && e.addClass('jqtree-loading');
                }),
                (e.prototype.removeLoadingClass = function (e) {
                    e && e.removeClass('jqtree-loading');
                }),
                (e.prototype.getDomElement = function (e) {
                    return e ? jQuery(e.element) : this.treeWidget.element;
                }),
                (e.prototype.notifyLoading = function (e, t, o) {
                    var n = this.treeWidget.options.onLoading;
                    (n && n(e, t, o), this.treeWidget._triggerEvent('tree.loading_data', { isLoading: e, node: t, $el: o }));
                }),
                (e.prototype.submitRequest = function (e, t, o) {
                    var n = jQuery.extend({ method: 'GET' }, 'string' == typeof e ? { url: e } : e, {
                        cache: !1,
                        dataType: 'json',
                        success: t,
                        error: o,
                    });
                    ((n.method = n.method.toUpperCase()), jQuery.ajax(n));
                }),
                (e.prototype.parseData = function (e) {
                    var t = this.treeWidget.options.dataFilter,
                        o = e instanceof Array || 'object' == typeof e ? e : null != e ? jQuery.parseJSON(e) : [];
                    return t ? t(o) : o;
                }),
                e
            );
        })();
        t.default = n;
    },
    function (e, t, o) {
        'use strict';
        t.__esModule = !0;
        var n = (function () {
            function o(e) {
                var t = this;
                ((this.handleKeyDown = function (e) {
                    if (!t.canHandleKeyboard()) return !0;
                    switch (e.which) {
                        case o.DOWN:
                            return t.moveDown();
                        case o.UP:
                            return t.moveUp();
                        case o.RIGHT:
                            return t.moveRight();
                        case o.LEFT:
                            return t.moveLeft();
                        default:
                            return !0;
                    }
                }),
                    (this.treeWidget = e).options.keyboardSupport && jQuery(document).on('keydown.jqtree', this.handleKeyDown));
            }
            return (
                (o.prototype.deinit = function () {
                    jQuery(document).off('keydown.jqtree');
                }),
                (o.prototype.moveDown = function () {
                    var e = this.treeWidget.getSelectedNode();
                    return !!e && this.selectNode(e.getNextNode());
                }),
                (o.prototype.moveUp = function () {
                    var e = this.treeWidget.getSelectedNode();
                    return !!e && this.selectNode(e.getPreviousNode());
                }),
                (o.prototype.moveRight = function () {
                    var e = this.treeWidget.getSelectedNode();
                    return !e || !e.isFolder() || (e.is_open ? this.selectNode(e.getNextNode()) : (this.treeWidget.openNode(e), !1));
                }),
                (o.prototype.moveLeft = function () {
                    var e = this.treeWidget.getSelectedNode();
                    return !e || (e.isFolder() && e.is_open ? (this.treeWidget.closeNode(e), !1) : this.selectNode(e.getParent()));
                }),
                (o.prototype.selectNode = function (e) {
                    return (
                        !e ||
                        (this.treeWidget.selectNode(e),
                        this.treeWidget.scrollHandler &&
                            !this.treeWidget.scrollHandler.isScrolledIntoView(jQuery(e.element).find('.jqtree-element')) &&
                            this.treeWidget.scrollToNode(e),
                        !1)
                    );
                }),
                (o.prototype.canHandleKeyboard = function () {
                    return this.treeWidget.options.keyboardSupport && this.isFocusOnTree() && null != this.treeWidget.getSelectedNode();
                }),
                (o.prototype.isFocusOnTree = function () {
                    var e = document.activeElement;
                    return Boolean(e && 'SPAN' === e.tagName && this.treeWidget._containsElement(e));
                }),
                (o.LEFT = 37),
                (o.UP = 38),
                (o.RIGHT = 39),
                (o.DOWN = 40),
                o
            );
        })();
        t.default = n;
    },
    function (e, t, o) {
        'use strict';
        var n,
            r =
                (this && this.__extends) ||
                ((n = function (e, t) {
                    return (n =
                        Object.setPrototypeOf ||
                        ({ __proto__: [] } instanceof Array &&
                            function (e, t) {
                                e.__proto__ = t;
                            }) ||
                        function (e, t) {
                            for (var o in t) t.hasOwnProperty(o) && (e[o] = t[o]);
                        })(e, t);
                }),
                function (e, t) {
                    function o() {
                        this.constructor = e;
                    }
                    (n(e, t), (e.prototype = null === t ? Object.create(t) : ((o.prototype = t.prototype), new o())));
                });
        t.__esModule = !0;
        var i = (function (e) {
            function t() {
                var n = (null !== e && e.apply(this, arguments)) || this;
                return (
                    (n.mouseDown = function (e) {
                        if (1 === e.which) {
                            var t = n._handleMouseDown(n._getPositionInfo(e));
                            return (t && e.preventDefault(), t);
                        }
                    }),
                    (n.mouseMove = function (e) {
                        return n._handleMouseMove(e, n._getPositionInfo(e));
                    }),
                    (n.mouseUp = function (e) {
                        return n._handleMouseUp(n._getPositionInfo(e));
                    }),
                    (n.touchStart = function (e) {
                        var t = e.originalEvent;
                        if (!(1 < t.touches.length)) {
                            var o = t.changedTouches[0];
                            return n._handleMouseDown(n._getPositionInfo(o));
                        }
                    }),
                    (n.touchMove = function (e) {
                        var t = e.originalEvent;
                        if (!(1 < t.touches.length)) {
                            var o = t.changedTouches[0];
                            return n._handleMouseMove(e, n._getPositionInfo(o));
                        }
                    }),
                    (n.touchEnd = function (e) {
                        var t = e.originalEvent;
                        if (!(1 < t.touches.length)) {
                            var o = t.changedTouches[0];
                            return n._handleMouseUp(n._getPositionInfo(o));
                        }
                    }),
                    n
                );
            }
            return (
                r(t, e),
                (t.prototype.setMouseDelay = function (e) {
                    this.mouseDelay = e;
                }),
                (t.prototype._init = function () {
                    (this.$el.on('mousedown.mousewidget', this.mouseDown),
                        this.$el.on('touchstart.mousewidget', this.touchStart),
                        (this.isMouseStarted = !1),
                        (this.mouseDelay = 0),
                        (this.mouseDelayTimer = null),
                        (this.isMouseDelayMet = !0),
                        (this.mouseDownInfo = null));
                }),
                (t.prototype._deinit = function () {
                    (this.$el.off('mousedown.mousewidget'), this.$el.off('touchstart.mousewidget'));
                    var e = jQuery(document);
                    (e.off('mousemove.mousewidget'), e.off('mouseup.mousewidget'));
                }),
                (t.prototype._handleMouseDown = function (e) {
                    if ((this.isMouseStarted && this._handleMouseUp(e), (this.mouseDownInfo = e), this._mouseCapture(e)))
                        return (this._handleStartMouse(), !0);
                }),
                (t.prototype._handleStartMouse = function () {
                    var e = jQuery(document);
                    (e.on('mousemove.mousewidget', this.mouseMove),
                        e.on('touchmove.mousewidget', this.touchMove),
                        e.on('mouseup.mousewidget', this.mouseUp),
                        e.on('touchend.mousewidget', this.touchEnd),
                        this.mouseDelay && this._startMouseDelayTimer());
                }),
                (t.prototype._startMouseDelayTimer = function () {
                    var e = this;
                    (this.mouseDelayTimer && clearTimeout(this.mouseDelayTimer),
                        (this.mouseDelayTimer = window.setTimeout(function () {
                            e.isMouseDelayMet = !0;
                        }, this.mouseDelay)),
                        (this.isMouseDelayMet = !1));
                }),
                (t.prototype._handleMouseMove = function (e, t) {
                    return this.isMouseStarted
                        ? (this._mouseDrag(t), e.preventDefault())
                        : !(!this.mouseDelay || this.isMouseDelayMet) ||
                              (this.mouseDownInfo && (this.isMouseStarted = !1 !== this._mouseStart(this.mouseDownInfo)),
                              this.isMouseStarted ? this._mouseDrag(t) : this._handleMouseUp(t),
                              !this.isMouseStarted);
                }),
                (t.prototype._getPositionInfo = function (e) {
                    return { pageX: e.pageX, pageY: e.pageY, target: e.target, originalEvent: e };
                }),
                (t.prototype._handleMouseUp = function (e) {
                    var t = jQuery(document);
                    (t.off('mousemove.mousewidget'),
                        t.off('touchmove.mousewidget'),
                        t.off('mouseup.mousewidget'),
                        t.off('touchend.mousewidget'),
                        this.isMouseStarted && ((this.isMouseStarted = !1), this._mouseStop(e)));
                }),
                t
            );
        })(o(3).default);
        t.default = i;
    },
    function (e, t, o) {
        'use strict';
        t.__esModule = !0;
        var n = o(1),
            r = (function () {
                function e(e) {
                    this.treeWidget = e;
                }
                return (
                    (e.prototype.saveState = function () {
                        var e = JSON.stringify(this.getState());
                        this.treeWidget.options.onSetStateFromStorage
                            ? this.treeWidget.options.onSetStateFromStorage(e)
                            : this.supportsLocalStorage() && localStorage.setItem(this.getKeyName(), e);
                    }),
                    (e.prototype.getStateFromStorage = function () {
                        var e = this._loadFromStorage();
                        return e ? this._parseState(e) : null;
                    }),
                    (e.prototype.getState = function () {
                        var t;
                        return {
                            open_nodes:
                                ((t = []),
                                this.treeWidget.tree.iterate(function (e) {
                                    return (e.is_open && e.id && e.hasChildren() && t.push(e.id), !0);
                                }),
                                t),
                            selected_node: this.treeWidget.getSelectedNodes().map(function (e) {
                                return e.id;
                            }),
                        };
                    }),
                    (e.prototype.setInitialState = function (e) {
                        if (e) {
                            var t = !1;
                            return (
                                e.open_nodes && (t = this._openInitialNodes(e.open_nodes)),
                                e.selected_node && (this._resetSelection(), this._selectInitialNodes(e.selected_node)),
                                t
                            );
                        }
                        return !1;
                    }),
                    (e.prototype.setInitialStateOnDemand = function (e, t) {
                        e ? this._setInitialStateOnDemand(e.open_nodes, e.selected_node, t) : t();
                    }),
                    (e.prototype.getNodeIdToBeSelected = function () {
                        var e = this.getStateFromStorage();
                        return e && e.selected_node ? e.selected_node[0] : null;
                    }),
                    (e.prototype._parseState = function (e) {
                        var t = jQuery.parseJSON(e);
                        return (t && t.selected_node && n.isInt(t.selected_node) && (t.selected_node = [t.selected_node]), t);
                    }),
                    (e.prototype._loadFromStorage = function () {
                        return this.treeWidget.options.onGetStateFromStorage
                            ? this.treeWidget.options.onGetStateFromStorage()
                            : this.supportsLocalStorage()
                              ? localStorage.getItem(this.getKeyName())
                              : void 0;
                    }),
                    (e.prototype._openInitialNodes = function (e) {
                        for (var t = !1, o = 0, n = e; o < n.length; o++) {
                            var r = n[o],
                                i = this.treeWidget.getNodeById(r);
                            i && (i.load_on_demand ? (t = !0) : (i.is_open = !0));
                        }
                        return t;
                    }),
                    (e.prototype._selectInitialNodes = function (e) {
                        for (var t = 0, o = 0, n = e; o < n.length; o++) {
                            var r = n[o],
                                i = this.treeWidget.getNodeById(r);
                            i && ((t += 1), this.treeWidget.selectNodeHandler && this.treeWidget.selectNodeHandler.addToSelection(i));
                        }
                        return 0 !== t;
                    }),
                    (e.prototype._resetSelection = function () {
                        var t = this.treeWidget.selectNodeHandler;
                        t &&
                            t.getSelectedNodes().forEach(function (e) {
                                t.removeFromSelection(e);
                            });
                    }),
                    (e.prototype._setInitialStateOnDemand = function (e, i, s) {
                        function t() {
                            for (var e = [], t = 0, o = d; t < o.length; t++) {
                                var n = o[t],
                                    r = a.treeWidget.getNodeById(n);
                                r ? r.is_loading || (r.load_on_demand ? u(r) : a.treeWidget._openNode(r, !1, null)) : e.push(n);
                            }
                            ((d = e), a._selectInitialNodes(i) && a.treeWidget._refreshElements(null), 0 === l && s());
                        }
                        var a = this,
                            l = 0,
                            d = e,
                            u = function (e) {
                                ((l += 1),
                                    a.treeWidget._openNode(e, !1, function () {
                                        ((l -= 1), t());
                                    }));
                            };
                        t();
                    }),
                    (e.prototype.getKeyName = function () {
                        return 'string' == typeof this.treeWidget.options.saveState ? this.treeWidget.options.saveState : 'tree';
                    }),
                    (e.prototype.supportsLocalStorage = function () {
                        return (
                            null == this._supportsLocalStorage &&
                                (this._supportsLocalStorage = (function () {
                                    if (null == localStorage) return !1;
                                    try {
                                        var e = '_storage_test';
                                        (sessionStorage.setItem(e, 'value'), sessionStorage.removeItem(e));
                                    } catch (e) {
                                        return !1;
                                    }
                                    return !0;
                                })()),
                            this._supportsLocalStorage
                        );
                    }),
                    e
                );
            })();
        t.default = r;
    },
    function (e, t, o) {
        'use strict';
        t.__esModule = !0;
        var n = (function () {
            function e(e) {
                ((this.treeWidget = e), (this.previousTop = -1), (this.isInitialized = !1));
            }
            return (
                (e.prototype.checkScrolling = function () {
                    (this.ensureInit(), this.checkVerticalScrolling(), this.checkHorizontalScrolling());
                }),
                (e.prototype.scrollToY = function (e) {
                    if ((this.ensureInit(), this.$scrollParent)) this.$scrollParent[0].scrollTop = e;
                    else {
                        var t = this.treeWidget.$el.offset(),
                            o = t ? t.top : 0;
                        jQuery(document).scrollTop(e + o);
                    }
                }),
                (e.prototype.isScrolledIntoView = function (e) {
                    var t, o, n;
                    this.ensureInit();
                    var r,
                        i = e.height() || 0;
                    return (
                        (this.$scrollParent
                            ? ((n = 0),
                              (t = this.$scrollParent.height() || 0),
                              (o = ((r = e.offset()) ? r.top : 0) - this.scrollParentTop) + i)
                            : ((t = (n = jQuery(window).scrollTop() || 0) + (jQuery(window).height() || 0)),
                              (o = (r = e.offset()) ? r.top : 0) + i)) <= t && n <= o
                    );
                }),
                (e.prototype.getScrollLeft = function () {
                    return (this.$scrollParent && this.$scrollParent.scrollLeft()) || 0;
                }),
                (e.prototype.initScrollParent = function () {
                    function e() {
                        ((s.scrollParentTop = 0), (s.$scrollParent = null));
                    }
                    var s = this;
                    'fixed' === this.treeWidget.$el.css('position') && e();
                    var t = (function () {
                        function e(e) {
                            for (var t = 0, o = i; t < o.length; t++) {
                                var n = o[t],
                                    r = e.css(n);
                                if ('auto' === r || 'scroll' === r) return !0;
                            }
                            return !1;
                        }
                        var i = ['overflow', 'overflow-y'];
                        if (e(s.treeWidget.$el)) return s.treeWidget.$el;
                        for (var t = 0, o = s.treeWidget.$el.parents().get(); t < o.length; t++) {
                            var n = o[t],
                                r = jQuery(n);
                            if (e(r)) return r;
                        }
                        return null;
                    })();
                    if (t && t.length && 'HTML' !== t[0].tagName) {
                        this.$scrollParent = t;
                        var o = this.$scrollParent.offset();
                        this.scrollParentTop = o ? o.top : 0;
                    } else e();
                    this.isInitialized = !0;
                }),
                (e.prototype.ensureInit = function () {
                    this.isInitialized || this.initScrollParent();
                }),
                (e.prototype.handleVerticalScrollingWithScrollParent = function (e) {
                    var t = this.$scrollParent && this.$scrollParent[0];
                    t &&
                        (this.scrollParentTop + t.offsetHeight - e.bottom < 20
                            ? ((t.scrollTop += 20), this.treeWidget.refreshHitAreas(), (this.previousTop = -1))
                            : e.top - this.scrollParentTop < 20 &&
                              ((t.scrollTop -= 20), this.treeWidget.refreshHitAreas(), (this.previousTop = -1)));
                }),
                (e.prototype.handleVerticalScrollingWithDocument = function (e) {
                    var t = jQuery(document).scrollTop() || 0;
                    e.top - t < 20
                        ? jQuery(document).scrollTop(t - 20)
                        : (jQuery(window).height() || 0) - (e.bottom - t) < 20 && jQuery(document).scrollTop(t + 20);
                }),
                (e.prototype.checkVerticalScrolling = function () {
                    var e = this.treeWidget.dndHandler && this.treeWidget.dndHandler.hoveredArea;
                    e &&
                        e.top !== this.previousTop &&
                        ((this.previousTop = e.top),
                        this.$scrollParent ? this.handleVerticalScrollingWithScrollParent(e) : this.handleVerticalScrollingWithDocument(e));
                }),
                (e.prototype.checkHorizontalScrolling = function () {
                    var e = this.treeWidget.dndHandler && this.treeWidget.dndHandler.positionInfo;
                    e && (this.$scrollParent ? this.handleHorizontalScrollingWithParent(e) : this.handleHorizontalScrollingWithDocument(e));
                }),
                (e.prototype.handleHorizontalScrollingWithParent = function (e) {
                    if (void 0 !== e.pageX && void 0 !== e.pageY) {
                        var t = this.$scrollParent,
                            o = t && t.offset();
                        if (t && o) {
                            var n = t[0],
                                r = n.scrollLeft + n.clientWidth < n.scrollWidth,
                                i = 0 < n.scrollLeft,
                                s = o.left + n.clientWidth,
                                a = o.left,
                                l = e.pageX > s - 20,
                                d = e.pageX < a + 20;
                            l && r
                                ? (n.scrollLeft = Math.min(n.scrollLeft + 20, n.scrollWidth))
                                : d && i && (n.scrollLeft = Math.max(n.scrollLeft - 20, 0));
                        }
                    }
                }),
                (e.prototype.handleHorizontalScrollingWithDocument = function (e) {
                    if (void 0 !== e.pageX && void 0 !== e.pageY) {
                        var t = jQuery(document),
                            o = t.scrollLeft() || 0,
                            n = jQuery(window).width() || 0,
                            r = 0 < o,
                            i = e.pageX > n - 20,
                            s = e.pageX - o < 20;
                        i ? t.scrollLeft(o + 20) : s && r && t.scrollLeft(Math.max(o - 20, 0));
                    }
                }),
                e
            );
        })();
        t.default = n;
    },
    function (e, t, o) {
        'use strict';
        t.__esModule = !0;
        var n = (function () {
            function e(e) {
                ((this.treeWidget = e), this.clear());
            }
            return (
                (e.prototype.getSelectedNode = function () {
                    var e = this.getSelectedNodes();
                    return !!e.length && e[0];
                }),
                (e.prototype.getSelectedNodes = function () {
                    if (this.selectedSingleNode) return [this.selectedSingleNode];
                    var e = [];
                    for (var t in this.selectedNodes)
                        if (this.selectedNodes.hasOwnProperty(t)) {
                            var o = this.treeWidget.getNodeById(t);
                            o && e.push(o);
                        }
                    return e;
                }),
                (e.prototype.getSelectedNodesUnder = function (e) {
                    if (this.selectedSingleNode) return e.isParentOf(this.selectedSingleNode) ? [this.selectedSingleNode] : [];
                    var t = [];
                    for (var o in this.selectedNodes)
                        if (this.selectedNodes.hasOwnProperty(o)) {
                            var n = this.treeWidget.getNodeById(o);
                            n && e.isParentOf(n) && t.push(n);
                        }
                    return t;
                }),
                (e.prototype.isNodeSelected = function (e) {
                    return (
                        !!e &&
                        (null != e.id
                            ? !!this.selectedNodes[e.id]
                            : !!this.selectedSingleNode && this.selectedSingleNode.element === e.element)
                    );
                }),
                (e.prototype.clear = function () {
                    ((this.selectedNodes = {}), (this.selectedSingleNode = null));
                }),
                (e.prototype.removeFromSelection = function (e, t) {
                    var o = this;
                    (void 0 === t && (t = !1),
                        null == e.id
                            ? this.selectedSingleNode && e.element === this.selectedSingleNode.element && (this.selectedSingleNode = null)
                            : (delete this.selectedNodes[e.id],
                              t &&
                                  e.iterate(function () {
                                      return (delete o.selectedNodes[e.id], !0);
                                  })));
                }),
                (e.prototype.addToSelection = function (e) {
                    null != e.id ? (this.selectedNodes[e.id] = !0) : (this.selectedSingleNode = e);
                }),
                e
            );
        })();
        t.default = n;
    },
    function (e, t, o) {
        'use strict';
        var n,
            r =
                (this && this.__extends) ||
                ((n = function (e, t) {
                    return (n =
                        Object.setPrototypeOf ||
                        ({ __proto__: [] } instanceof Array &&
                            function (e, t) {
                                e.__proto__ = t;
                            }) ||
                        function (e, t) {
                            for (var o in t) t.hasOwnProperty(o) && (e[o] = t[o]);
                        })(e, t);
                }),
                function (e, t) {
                    function o() {
                        this.constructor = e;
                    }
                    (n(e, t), (e.prototype = null === t ? Object.create(t) : ((o.prototype = t.prototype), new o())));
                });
        t.__esModule = !0;
        var i = o(0),
            s = (function () {
                function e(e, t) {
                    this.init(e, t);
                }
                return (
                    (e.prototype.init = function (e, t) {
                        ((this.node = e),
                            (this.treeWidget = t),
                            e.element || (e.element = this.treeWidget.element.get(0)),
                            (this.$element = jQuery(e.element)));
                    }),
                    (e.prototype.addDropHint = function (e) {
                        return this.mustShowBorderDropHint(e)
                            ? new l(this.$element, this.treeWidget._getScrollLeft())
                            : new d(this.node, this.$element, e);
                    }),
                    (e.prototype.select = function (e) {
                        var t = this.getLi();
                        (t.addClass('jqtree-selected'), t.attr('aria-selected', 'true'));
                        var o = this.getSpan();
                        (o.attr('tabindex', this.treeWidget.options.tabIndex), e && o.focus());
                    }),
                    (e.prototype.deselect = function () {
                        var e = this.getLi();
                        (e.removeClass('jqtree-selected'), e.attr('aria-selected', 'false'));
                        var t = this.getSpan();
                        (t.removeAttr('tabindex'), t.blur());
                    }),
                    (e.prototype.getUl = function () {
                        return this.$element.children('ul:first');
                    }),
                    (e.prototype.getSpan = function () {
                        return this.$element.children('.jqtree-element').find('span.jqtree-title');
                    }),
                    (e.prototype.getLi = function () {
                        return this.$element;
                    }),
                    (e.prototype.mustShowBorderDropHint = function (e) {
                        return e === i.Position.Inside;
                    }),
                    e
                );
            })(),
            a = (function (e) {
                function t() {
                    return (null !== e && e.apply(this, arguments)) || this;
                }
                return (
                    r(t, e),
                    (t.prototype.open = function (e, t, o) {
                        var n = this;
                        if ((void 0 === t && (t = !0), void 0 === o && (o = 'fast'), !this.node.is_open)) {
                            this.node.is_open = !0;
                            var r = this.getButton();
                            (r.removeClass('jqtree-closed'), r.html(''));
                            var i = r.get(0);
                            if (i) {
                                var s = this.treeWidget.renderer.openedIconElement.cloneNode(!0);
                                i.appendChild(s);
                            }
                            var a = function () {
                                (n.getLi().removeClass('jqtree-closed'),
                                    n.getSpan().attr('aria-expanded', 'true'),
                                    e && e(n.node),
                                    n.treeWidget._triggerEvent('tree.open', { node: n.node }));
                            };
                            t ? this.getUl().slideDown(o, a) : (this.getUl().show(), a());
                        }
                    }),
                    (t.prototype.close = function (e, t) {
                        var o = this;
                        if ((void 0 === e && (e = !0), void 0 === t && (t = 'fast'), this.node.is_open)) {
                            this.node.is_open = !1;
                            var n = this.getButton();
                            (n.addClass('jqtree-closed'), n.html(''));
                            var r = n.get(0);
                            if (r) {
                                var i = this.treeWidget.renderer.closedIconElement.cloneNode(!0);
                                r.appendChild(i);
                            }
                            var s = function () {
                                (o.getLi().addClass('jqtree-closed'),
                                    o.getSpan().attr('aria-expanded', 'false'),
                                    o.treeWidget._triggerEvent('tree.close', { node: o.node }));
                            };
                            e ? this.getUl().slideUp(t, s) : (this.getUl().hide(), s());
                        }
                    }),
                    (t.prototype.mustShowBorderDropHint = function (e) {
                        return !this.node.is_open && e === i.Position.Inside;
                    }),
                    (t.prototype.getButton = function () {
                        return this.$element.children('.jqtree-element').find('a.jqtree-toggler');
                    }),
                    t
                );
            })((t.NodeElement = s));
        t.FolderElement = a;
        var l = (function () {
            function e(e, t) {
                var o = e.children('.jqtree-element'),
                    n = e.width() || 0,
                    r = Math.max(n + t - 4, 0),
                    i = o.outerHeight() || 0,
                    s = Math.max(i - 4, 0);
                ((this.$hint = jQuery('<span class="jqtree-border"></span>')),
                    o.append(this.$hint),
                    this.$hint.css({ width: r, height: s }));
            }
            return (
                (e.prototype.remove = function () {
                    this.$hint.remove();
                }),
                e
            );
        })();
        t.BorderDropHint = l;
        var d = (function () {
            function e(e, t, o) {
                ((this.$element = t),
                    (this.node = e),
                    (this.$ghost = jQuery(
                        '<li class="jqtree_common jqtree-ghost"><span class="jqtree_common jqtree-circle"></span>\n            <span class="jqtree_common jqtree-line"></span></li>'
                    )),
                    o === i.Position.After
                        ? this.moveAfter()
                        : o === i.Position.Before
                          ? this.moveBefore()
                          : o === i.Position.Inside && (e.isFolder() && e.is_open ? this.moveInsideOpenFolder() : this.moveInside()));
            }
            return (
                (e.prototype.remove = function () {
                    this.$ghost.remove();
                }),
                (e.prototype.moveAfter = function () {
                    this.$element.after(this.$ghost);
                }),
                (e.prototype.moveBefore = function () {
                    this.$element.before(this.$ghost);
                }),
                (e.prototype.moveInsideOpenFolder = function () {
                    jQuery(this.node.children[0].element).before(this.$ghost);
                }),
                (e.prototype.moveInside = function () {
                    (this.$element.after(this.$ghost), this.$ghost.addClass('jqtree-inside'));
                }),
                e
            );
        })();
    },
    ,
    function (e, t, o) {
        e.exports = o(4);
    },
]);
