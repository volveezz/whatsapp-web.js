"use strict";

const EventEmitter = require("events");
const puppeteer = require("puppeteer");

const Util = require("./util/Util");
const InterfaceController = require("./util/InterfaceController");
const {
    WhatsWebURL,
    DefaultOptions,
    Events,
    WAState,
    MessageTypes,
} = require("./util/Constants");
const { ExposeAuthStore } = require("./util/Injected/AuthStore/AuthStore");
const { ExposeStore } = require("./util/Injected/Store");
const { LoadUtils } = require("./util/Injected/Utils");
const ChatFactory = require("./factories/ChatFactory");
const ContactFactory = require("./factories/ContactFactory");
const WebCacheFactory = require("./webCache/WebCacheFactory");
const {
    ClientInfo,
    Message,
    MessageMedia,
    Contact,
    Location,
    Poll,
    PollVote,
    GroupNotification,
    Label,
    Call,
    Buttons,
    List,
    Reaction,
    Broadcast,
} = require("./structures");
const NoAuth = require("./authStrategies/NoAuth");
const { exposeFunctionIfAbsent } = require("./util/Puppeteer");
const treeKill = require("tree-kill");

/**
 * SendMessageError represents an error that occurred during message sending
 */
class SendMessageError extends Error {
    constructor({ name, message, stack, code, media, chatId, clientId }) {
        super(`[${clientId || "default"}] [${name}] ${message}`);
        this.name = "SendMessageError";
        this.original = name;
        this.code = code;
        this.media = media;
        this.chatId = chatId;
        this.stack = stack;
        this.clientId = clientId;
    }
}

/**
 * Starting point for interacting with the WhatsApp Web API
 * @extends {EventEmitter}
 * @param {object} options - Client options
 * @param {AuthStrategy} options.authStrategy - Determines how to save and restore sessions. Will use LegacySessionAuth if options.session is set. Otherwise, NoAuth will be used.
 * @param {string} options.webVersion - The version of WhatsApp Web to use. Use options.webVersionCache to configure how the version is retrieved.
 * @param {object} options.webVersionCache - Determines how to retrieve the WhatsApp Web version. Defaults to a local cache (LocalWebCache) that falls back to latest if the requested version is not found.
 * @param {number} options.authTimeoutMs - Timeout for authentication selector in puppeteer
 * @param {object} options.puppeteer - Puppeteer launch options. View docs here: https://github.com/puppeteer/puppeteer/
 * @param {number} options.qrMaxRetries - How many times should the qrcode be refreshed before giving up
 * @param {number} options.takeoverOnConflict - If another whatsapp web session is detected (another browser), take over the session in the current browser
 * @param {number} options.takeoverTimeoutMs - How much time to wait before taking over the session
 * @param {string} options.userAgent - User agent to use in puppeteer
 * @param {string} options.ffmpegPath - Ffmpeg path to use when formatting videos to webp while sending stickers
 * @param {boolean} options.bypassCSP - Sets bypassing of page's Content-Security-Policy.
 * @param {object} options.proxyAuthentication - Proxy Authentication object.
 *
 * @fires Client#qr
 * @fires Client#authenticated
 * @fires Client#auth_failure
 * @fires Client#ready
 * @fires Client#message
 * @fires Client#message_ack
 * @fires Client#message_create
 * @fires Client#message_revoke_me
 * @fires Client#message_revoke_everyone
 * @fires Client#message_ciphertext
 * @fires Client#message_edit
 * @fires Client#media_uploaded
 * @fires Client#group_join
 * @fires Client#group_leave
 * @fires Client#group_update
 * @fires Client#disconnected
 * @fires Client#change_state
 * @fires Client#contact_changed
 * @fires Client#group_admin_changed
 * @fires Client#group_membership_request
 * @fires Client#vote_update
 */
class Client extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = Util.mergeDefault(DefaultOptions, options);

        if (!this.options.authStrategy) {
            this.authStrategy = new NoAuth();
        } else {
            this.authStrategy = this.options.authStrategy;
        }
        this.clientId = this.authStrategy.clientId || "default";

        this.authStrategy.setup(this);

        /**
         * @type {puppeteer.Browser}
         */
        this.pupBrowser = null;
        /**
         * @type {puppeteer.Page}
         */
        this.pupPage = null;

        this.currentIndexHtml = null;
        this.lastLoggedOut = false;
        this.isInjecting = false;
        this._storeInjected = false;
        this._listenersAttached = false;

        Util.setFfmpegPath(this.options.ffmpegPath);
    }

    /**
     * Injection logic
     * Private function
     */
    async inject() {
        if (this.isInjecting) return;
        if (!this.pupPage || this.pupPage.isClosed()) return;
        this.isInjecting = true;

        try {
            /*───────────────── preload stub ─────────────────*/
            if (!this._bridgePreloaded) {
                await this.pupPage.evaluateOnNewDocument(() => {
                    if (window.__wwebjs_preload_done) return;
                    window.__wwebjs_preload_done = true;

                    // Track last loading progress to prevent duplicate events
                    window.__wwebjs_last_progress = -1;

                    // Create persistent placeholder functions that will survive page changes
                    // Use a more resilient approach with Object.defineProperty to prevent overwriting
                    const persistentFunctions = [
                        "onOfflineProgressUpdateEvent",
                        "onAuthAppStateChangedEvent",
                        "onAppStateHasSyncedEvent",
                        "onLogoutEvent",
                        "onQRChangedEvent",
                    ];

                    persistentFunctions.forEach((fn) => {
                        // Only define if it doesn't exist
                        if (!window[fn]) {
                            // Use a property descriptor to make it harder to accidentally overwrite
                            Object.defineProperty(window, fn, {
                                value: function (...args) {
                                    console.log(
                                        `[${
                                            window.wwebjs_client_id || "default"
                                        }] Placeholder for ${fn} called with:`,
                                        args
                                    );
                                },
                                writable: true, // Allow our code to redefine it later
                                configurable: false, // Prevent deletion
                            });
                        }
                    });

                    // Add a recovery mechanism that periodically checks and restores these functions
                    window.__wwebjs_check_functions = setInterval(() => {
                        persistentFunctions.forEach((fn) => {
                            if (typeof window[fn] !== "function") {
                                console.warn(
                                    `[${
                                        window.wwebjs_client_id || "default"
                                    }] Function ${fn} was lost, restoring placeholder`
                                );
                                window[fn] = function (...args) {
                                    console.log(
                                        `[${
                                            window.wwebjs_client_id || "default"
                                        }] Restored placeholder for ${fn} called with:`,
                                        args
                                    );
                                };
                            }
                        });
                    }, 300000); // Check every 5 minutes

                    window.__wwebjs_ready = false;
                    window.__wwebjs_q = [];
                    window.__wwebjs_bridge = (...args) => {
                        if (!window.__wwebjs_ready)
                            return window.__wwebjs_q.push(args);
                        if (typeof window.__wwebjs_emit === "function")
                            window.__wwebjs_emit(...args);
                    };
                    window.__wwebjs_emit = (...args) =>
                        window.__wwebjs_bridge(...args);
                });
                this._bridgePreloaded = true;
            }

            /*───────────────── wait for core WA objects ─────────────────*/
            await this.pupPage.waitForFunction(
                "window.Debug && window.Debug.VERSION",
                {
                    timeout: this.options.authTimeoutMs,
                }
            );

            // Initialize tracking for last progress percentage
            this._lastLoadingPercent = -1;

            await exposeFunctionIfAbsent(
                this.pupPage,
                "onOfflineProgressUpdateEvent",
                async (pct) => {
                    // Only emit if percentage has changed
                    if (pct !== this._lastLoadingPercent) {
                        this._lastLoadingPercent = pct;
                        this.emit(Events.LOADING_SCREEN, pct);
                    }
                }
            );

            // Expose clientId to the browser context for in-page script logging
            await this.pupPage.evaluate((id) => {
                window.wwebjs_client_id = id;
            }, this.clientId);

            await exposeFunctionIfAbsent(
                this.pupPage,
                "onAuthAppStateChangedEvent",
                async (state) => {
                    if (state === "UNPAIRED_IDLE") {
                        // refresh QR if phone unpaired itself
                        await this.pupPage.evaluate(() => {
                            if (
                                window.Store &&
                                window.Store.Cmd &&
                                typeof window.Store.Cmd.refreshQR === "function"
                            ) {
                                window.Store.Cmd.refreshQR();
                            } else {
                                console.warn(
                                    `[${
                                        window.wwebjs_client_id || "default"
                                    }] Cannot refresh QR: Store.Cmd is not available`
                                );
                            }
                        });
                    }
                }
            );

            await exposeFunctionIfAbsent(
                this.pupPage,
                "onAppStateHasSyncedEvent",
                async () => {
                    await this.pupPage.evaluate(() =>
                        window.__wwebjs_emit("auth_synced")
                    );
                }
            );

            await exposeFunctionIfAbsent(
                this.pupPage,
                "onLogoutEvent",
                async () => {
                    this.emit(Events.DISCONNECTED, "LOGOUT");
                    await this.destroy();
                }
            );

            /* core bridge for everything else */
            await exposeFunctionIfAbsent(
                this.pupPage,
                "__wwebjs_bridge",
                async (evt, ...p) => {
                    try {
                        switch (evt) {
                            case "auth_state":
                                this.emit(Events.STATE_CHANGED, p[0]);
                                break;
                            case "auth_synced":
                                this.emit(
                                    Events.AUTHENTICATED,
                                    await this.authStrategy.getAuthEventPayload()
                                );
                                if (!this._storeInjected) {
                                    await this.pupPage.evaluate(ExposeStore);
                                    await this.pupPage.evaluate(LoadUtils);
                                    this.info = new ClientInfo(
                                        this,
                                        await this.pupPage.evaluate(() => ({
                                            ...window.Store.Conn.serialize(),
                                            wid: window.Store.User.getMeUser(),
                                        }))
                                    );
                                    this.interface = new InterfaceController(
                                        this
                                    );
                                    await this.attachEventListeners();
                                    this._storeInjected = true;
                                }
                                this.emit(Events.READY);
                                this.authStrategy.afterAuthReady();
                                break;
                            case "offline_progress":
                                // Also check for duplicates here for the bridge event
                                const progressPct = p[0];
                                if (progressPct !== this._lastLoadingPercent) {
                                    this._lastLoadingPercent = progressPct;
                                    this.emit(
                                        Events.LOADING_SCREEN,
                                        progressPct
                                    );
                                }
                                break;
                        }
                    } catch (err) {
                        console.error(`[${this.clientId}] bridge`, err);
                    }
                }
            );

            // ──────── flush queue ─────────
            await this.pupPage.evaluate(() => {
                window.__wwebjs_emit = (...a) => window.__wwebjs_bridge(...a);
                window.__wwebjs_ready = true;
                (window.__wwebjs_q || []).forEach((args) =>
                    window.__wwebjs_bridge(...args)
                );
                window.__wwebjs_q = [];
            });

            /*───────────────── Expose WA AuthStore ─────────────────*/
            await this.pupPage.evaluate(ExposeAuthStore);

            /*───────────────── Check whether we need QR login ─────────────────*/
            const needAuth = await this.pupPage.evaluate(async () => {
                const { AppState } = window.AuthStore;
                let st = AppState.state;
                if (["OPENING", "UNLAUNCHED", "PAIRING"].includes(st)) {
                    await new Promise((res) => {
                        const cb = (_a, s) => {
                            if (
                                !["OPENING", "UNLAUNCHED", "PAIRING"].includes(
                                    s
                                )
                            ) {
                                AppState.off("change:state", cb);
                                res();
                            }
                        };
                        AppState.on("change:state", cb);
                    });
                    st = AppState.state;
                }
                return st === "UNPAIRED" || st === "UNPAIRED_IDLE";
            });

            if (needAuth) {
                const { failed, failureEventPayload, restart } =
                    await this.authStrategy.onAuthenticationNeeded();
                if (failed) {
                    this.emit(
                        Events.AUTHENTICATION_FAILURE,
                        failureEventPayload
                    );
                    await this.destroy();
                    if (restart) return this.initialize();
                    return;
                }

                await exposeFunctionIfAbsent(
                    this.pupPage,
                    "onQRChangedEvent",
                    (qr) => this.emit(Events.QR_RECEIVED, qr)
                );

                await this.pupPage.evaluate(() => {
                    const reg = window.AuthStore.RegistrationUtils;
                    const buildQR = async () => {
                        const info =
                            await reg.waSignalStore.getRegistrationInfo();
                        const noise = await reg.waNoiseInfo.get();
                        const sB64 = window.AuthStore.Base64Tools.encodeB64(
                            noise.staticKeyPair.pubKey
                        );
                        const iB64 = window.AuthStore.Base64Tools.encodeB64(
                            info.identityKeyPair.pubKey
                        );
                        const adv = await reg.getADVSecretKey();
                        const plat = reg.DEVICE_PLATFORM;
                        const ref = window.AuthStore.Conn.ref;
                        return `${ref},${sB64},${iB64},${adv},${plat}`;
                    };

                    // Use a try-catch block to safely call the function
                    const safeCallQREvent = async () => {
                        try {
                            const qrString = await buildQR();
                            if (typeof window.onQRChangedEvent === "function") {
                                window.onQRChangedEvent(qrString);
                            } else {
                                console.warn(
                                    `[${
                                        window.wwebjs_client_id || "default"
                                    }] onQRChangedEvent is not available yet`
                                );
                            }
                        } catch (err) {
                            console.error(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] Error generating QR:`,
                                err
                            );
                        }
                    };

                    safeCallQREvent();

                    window.AuthStore.Conn.on("change:ref", async () => {
                        safeCallQREvent();
                    });
                });
            }

            /*───────────────── Wire WA-side emitters ─────────────────*/
            await this.pupPage.evaluate(() => {
                if (window.__wwebjs_authHooksInstalled) return;
                window.__wwebjs_authHooksInstalled = true;

                // Add safety check to ensure AuthStore exists before accessing it
                if (!window.AuthStore) {
                    console.error(
                        `[${
                            window.wwebjs_client_id || "default"
                        }] AuthStore is undefined, cannot set up event hooks`
                    );

                    // Create a periodic check to try setting up hooks when AuthStore becomes available
                    window.__wwebjs_authstore_check = setInterval(() => {
                        if (window.AuthStore) {
                            console.log(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] AuthStore is now available, setting up hooks`
                            );
                            clearInterval(window.__wwebjs_authstore_check);
                            setupAuthHooks();
                        }
                    }, 60000); // Check every minute

                    return;
                }

                // Move the hook setup into a named function so we can call it later if needed
                function setupAuthHooks() {
                    try {
                        const { AppState, Cmd, OfflineMessageHandler } =
                            window.AuthStore || {};

                        // Safety check for required objects
                        if (!AppState) {
                            console.error(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] AppState is undefined, cannot set up event hooks`
                            );
                            return;
                        }

                        if (!Cmd) {
                            console.error(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] Cmd is undefined, cannot set up event hooks`
                            );
                            return;
                        }

                        // Improved safeEmit with fallback mechanism
                        const safeEmit = (fnName, ...args) => {
                            if (typeof window[fnName] === "function") {
                                try {
                                    window[fnName](...args);
                                } catch (err) {
                                    console.error(
                                        `[${
                                            window.wwebjs_client_id || "default"
                                        }] Error calling ${fnName}:`,
                                        err
                                    );
                                    // Attempt to restore function if it fails
                                    window[fnName] = function (...restoreArgs) {
                                        console.log(
                                            `[${
                                                window.wwebjs_client_id ||
                                                "default"
                                            }] Restored ${fnName} called with:`,
                                            restoreArgs
                                        );
                                    };
                                }
                            } else {
                                console.warn(
                                    `[${
                                        window.wwebjs_client_id || "default"
                                    }] ${fnName} is not available, creating placeholder`
                                );
                                // Create a placeholder if missing
                                window[fnName] = function (...restoreArgs) {
                                    console.log(
                                        `[${
                                            window.wwebjs_client_id || "default"
                                        }] New placeholder for ${fnName} called with:`,
                                        restoreArgs
                                    );
                                };
                            }
                        };

                        // Use try-catch around all event listeners
                        try {
                            if (AppState && typeof AppState.on === "function") {
                                AppState.on("change:state", (_s, st) => {
                                    try {
                                        safeEmit(
                                            "onAuthAppStateChangedEvent",
                                            st
                                        );
                                    } catch (e) {
                                        console.error(
                                            `[${
                                                window.wwebjs_client_id ||
                                                "default"
                                            }] Error in AppState state change handler:`,
                                            e
                                        );
                                    }
                                });
                            }
                        } catch (e) {
                            console.error(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] Failed to set up AppState.on('change:state') listener:`,
                                e
                            );
                        }

                        try {
                            if (AppState && typeof AppState.on === "function") {
                                AppState.on("change:hasSynced", () => {
                                    try {
                                        safeEmit("onAppStateHasSyncedEvent");
                                    } catch (e) {
                                        console.error(
                                            `[${
                                                window.wwebjs_client_id ||
                                                "default"
                                            }] Error in AppState hasSynced change handler:`,
                                            e
                                        );
                                    }
                                });
                            }
                        } catch (e) {
                            console.error(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] Failed to set up AppState.on('change:hasSynced') listener:`,
                                e
                            );
                        }

                        // Track last progress percentage in the browser context
                        window.__wwebjs_last_progress = -1;

                        try {
                            if (
                                Cmd &&
                                typeof Cmd.on === "function" &&
                                OfflineMessageHandler
                            ) {
                                Cmd.on("offline_progress_update", () => {
                                    try {
                                        const progress =
                                            OfflineMessageHandler.getOfflineDeliveryProgress();

                                        // Only emit if progress has changed
                                        if (
                                            progress !==
                                            window.__wwebjs_last_progress
                                        ) {
                                            window.__wwebjs_last_progress =
                                                progress;
                                            safeEmit(
                                                "onOfflineProgressUpdateEvent",
                                                progress
                                            );
                                        }
                                    } catch (e) {
                                        console.error(
                                            `[${
                                                window.wwebjs_client_id ||
                                                "default"
                                            }] Error in offline_progress_update handler:`,
                                            e
                                        );
                                    }
                                });
                            }
                        } catch (e) {
                            console.error(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] Failed to set up Cmd.on('offline_progress_update') listener:`,
                                e
                            );
                        }

                        try {
                            if (Cmd && typeof Cmd.on === "function") {
                                Cmd.on("logout", () => {
                                    try {
                                        safeEmit("onLogoutEvent");
                                    } catch (e) {
                                        console.error(
                                            `[${
                                                window.wwebjs_client_id ||
                                                "default"
                                            }] Error in logout handler:`,
                                            e
                                        );
                                    }
                                });
                            }
                        } catch (e) {
                            console.error(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] Failed to set up Cmd.on('logout') listener:`,
                                e
                            );
                        }
                    } catch (outerError) {
                        console.error(
                            `[${
                                window.wwebjs_client_id || "default"
                            }] Fatal error setting up auth hooks:`,
                            outerError
                        );
                    }
                }

                // Call the setup function immediately
                setupAuthHooks();

                // Also set up a periodic check to ensure hooks are still working
                window.__wwebjs_hook_check = setInterval(() => {
                    if (!window.AuthStore || !window.AuthStore.Cmd) {
                        console.warn(
                            `[${
                                window.wwebjs_client_id || "default"
                            }] AuthStore or Cmd is missing, trying to re-setup hooks`
                        );
                        setupAuthHooks();
                    }
                }, 300000); // Check every 5 minutes
            });

            if (this._authStoreCheckInterval) {
                clearInterval(this._authStoreCheckInterval);
            }

            // Also add a periodic page-level check from the Node.js side
            this._authStoreCheckInterval = setInterval(async () => {
                if (!this.pupPage || this.pupPage.isClosed()) {
                    clearInterval(this._authStoreCheckInterval);
                    return;
                }

                try {
                    const authStoreExists = await this.pupPage.evaluate(() => {
                        return !!window.AuthStore && !!window.AuthStore.Cmd;
                    });

                    if (!authStoreExists) {
                        console.warn(
                            `[${this.clientId}] AuthStore missing, re-exposing...`
                        );
                        await this.pupPage.evaluate(ExposeAuthStore);

                        // Try to reinstall hooks
                        await this.pupPage.evaluate((id) => {
                            window.wwebjs_client_id = id; // Ensure client_id is available for subsequent browser-side logs
                            window.__wwebjs_authHooksInstalled = false;
                            if (typeof setupAuthHooks === "function") {
                                setupAuthHooks();
                            }
                        }, this.clientId);
                    }
                } catch (err) {
                    console.error(
                        `[${this.clientId}] Error checking AuthStore:`,
                        err
                    );
                }
            }, 600000); // Check every 10 minutes
        } finally {
            this.isInjecting = false;
        }
    }

    /**************************************************************************/

    async grabFirstPage(browser) {
        const pages = await browser.pages();

        const page = pages.find((page) => page.url() === WhatsWebURL);

        return page || (await browser.newPage());
    }

    /**
     * Sets up events and requirements, kicks off authentication request
     */
    async initialize() {
        let /**
             * @type {puppeteer.Browser}
             */
            browser,
            /**
             * @type {puppeteer.Page}
             */
            page;

        browser = null;
        page = null;

        await this.authStrategy.beforeBrowserInitialized();

        const puppeteerOpts = this.options.puppeteer;
        if (puppeteerOpts?.browserWSEndpoint) {
            browser = await puppeteer.connect({
                ...puppeteerOpts,
                waitForInitialPage: false,
            });
        } else {
            browser = await puppeteer.launch({
                ...puppeteerOpts,
                args: puppeteerOpts.args || [],
                waitForInitialPage: false,
            });
        }

        page = await this.grabFirstPage(browser);

        if (this.options.proxyAuthentication) {
            await page.authenticate(this.options.proxyAuthentication);
        }

        await page.setUserAgent(this.options.userAgent);
        if (this.options.bypassCSP) await page.setBypassCSP(true);

        this.pupBrowser = browser;
        this.pupPage = page;
        this.cdpSession = await this.pupPage.createCDPSession();

        await this.authStrategy.afterBrowserInitialized();
        await this.initWebVersionCache();

        let isAlreadyInitialized = false;
        const url = page.url();
        if (url.startsWith(WhatsWebURL)) {
            isAlreadyInitialized = await page.evaluate(
                () =>
                    typeof window.Store !== "undefined" &&
                    typeof window.WWebJS !== "undefined"
            );
        }

        if (!isAlreadyInitialized) {
            await page.goto(WhatsWebURL, {
                waitUntil: "load",
                timeout: 0,
                referer: "https://whatsapp.com/",
            });
            await this.inject();
        } else {
            const infoData = await page.evaluate(() => ({
                ...window.Store.Conn.serialize(),
                wid: window.Store.User.getMeUser(),
            }));
            this.info = new ClientInfo(this, infoData);
            this.interface = new InterfaceController(this);

            this.emit(Events.READY);
            this.authStrategy.afterAuthReady();
            await this.attachEventListeners();
        }

        // Auto-disable media auto-download flags on client start
        const disableAutoDownloadFlags = async () => {
            try {
                await this.setAutoDownloadAudio(false);
                await this.setAutoDownloadDocuments(false);
                await this.setAutoDownloadPhotos(false);
                await this.setAutoDownloadVideos(false);
            } catch (err) {
                console.warn(
                    `[${this.clientId}] [WWebJS] Failed to auto-disable auto-download flags:`,
                    err?.message || err
                );
            }
        };

        // Disable auto-download flags on client start
        if (isAlreadyInitialized) {
            disableAutoDownloadFlags();
        } else {
            this.once(Events.READY, disableAutoDownloadFlags);
        }

        if (this.options.downloadPath && this.cdpSession) {
            // Specifying the path for chrome to save files
            await this.cdpSession.send("Page.setDownloadBehavior", {
                behavior: "allow",
                downloadPath: this.options.downloadPath,
            });
        }

        this.pupPage.on("framenavigated", async (frame) => {
            if (frame.url().includes("post_logout=1") || this.lastLoggedOut) {
                this.emit(Events.DISCONNECTED, "LOGOUT");
                await this.authStrategy.logout();
                await this.authStrategy.beforeBrowserInitialized();
                await this.authStrategy.afterBrowserInitialized();
                await this.destroy();
                this.lastLoggedOut = false;
                return;
            }

            const alreadyInjected = await this.pupPage
                .evaluate(() => {
                    return (
                        typeof window.WWebJS !== "undefined" &&
                        typeof window.Store !== "undefined"
                    );
                })
                .catch(() => false);

            if (
                this.pupPage &&
                !this.pupPage.isClosed() &&
                !alreadyInjected &&
                frame.url().startsWith(WhatsWebURL)
            ) {
                console.log(
                    `[${this.clientId}] [DEBUG] Page loaded/navigated, attempting injection...`
                );
                this._storeInjected = false;
                this._listenersAttached = false;
                await this.inject();
            } else if (alreadyInjected) {
                console.log(
                    `[${this.clientId}] [DEBUG] Page loaded/navigated, WWebJS already injected, skipping inject().`
                );
            } else {
                console.log(
                    `[${
                        this.clientId
                    }] [DEBUG] Page navigated, but not injecting. URL: ${frame.url()}, Closed: ${this.pupPage?.isClosed()}, Injected: ${alreadyInjected}`
                );
            }
        });
    }

    /**
     * Request authentication via pairing code instead of QR code
     * @param {string} phoneNumber - Phone number in international, symbol-free format (e.g. 12025550108 for US, 551155501234 for Brazil)
     * @param {boolean} showNotification - Show notification to pair on phone number
     * @returns {Promise<string>} - Returns a pairing code in format "ABCDEFGH"
     */
    async requestPairingCode(phoneNumber, showNotification = true) {
        return await this.pupPage.evaluate(
            async (phoneNumber, showNotification) => {
                window.AuthStore.PairingCodeLinkUtils.setPairingType(
                    "ALT_DEVICE_LINKING"
                );
                await window.AuthStore.PairingCodeLinkUtils.initializeAltDeviceLinking();
                return window.AuthStore.PairingCodeLinkUtils.startAltLinkingFlow(
                    phoneNumber,
                    showNotification
                );
            },
            phoneNumber,
            showNotification
        );
    }

    /**
     * Attach event listeners to WA Web
     * Private function
     * @property {boolean} reinject is this a reinject?
     */
    async attachEventListeners() {
        if (this._listenersAttached) return;
        this._listenersAttached = true;

        await this.pupPage.waitForFunction(
            "!!window.Store && !!window.Store.Msg",
            {
                timeout: 0,
            }
        );

        await this.pupPage.evaluate(() => {
            const stores = ["Msg", "Chat", "Call", "AppState", "PollVote"];

            // --- Store references to listeners to be removed ---
            window.__wwebjs_listeners = window.__wwebjs_listeners || {};

            for (const storeName of stores) {
                const emitter = window.Store[storeName];
                if (!emitter || typeof emitter.off !== "function") continue;

                // Remove listeners stored from previous runs
                if (window.__wwebjs_listeners[storeName]) {
                    for (const [evt, handler] of Object.entries(
                        window.__wwebjs_listeners[storeName]
                    )) {
                        try {
                            emitter.off(evt, handler);
                        } catch (e) {
                            console.warn(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] WWebJS: Failed to remove listener for ${storeName}.${evt}`,
                                e
                            );
                        }
                    }
                }
                window.__wwebjs_listeners[storeName] = {}; // Reset for this run
            }

            // Clear potentially old exposed functions
            Object.keys(window)
                .filter((k) => k.startsWith("on") && k.endsWith("Event"))
                .forEach((k) => {
                    if (window.hasOwnProperty(k)) {
                        try {
                            window[k] = null;
                            delete window[k];
                            if (window.hasOwnProperty(k)) {
                                console.error(
                                    `[${
                                        window.wwebjs_client_id || "default"
                                    }] WWebJS Cleanup: ${k} STILL EXISTS after delete attempt`
                                );
                            }
                        } catch (e) {
                            console.error(
                                `[${
                                    window.wwebjs_client_id || "default"
                                }] WWebJS Cleanup: FAILED to clear ${k}:`,
                                e.message
                            );
                        }
                    }
                });
        });

        const mark = (fn) => {
            fn.__wwebjsPatched = true;
            return fn;
        };

        let last_created_message_id;

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onAddMessageEvent",
            mark((msg) => {
                if (msg.id.id === last_created_message_id) {
                    console.error(
                        "Received message with same id as last created message",
                        msg
                    );
                    return;
                }

                last_created_message_id = msg?.id?.id;

                if (msg.type === "gp2") {
                    const notification = new GroupNotification(this, msg);
                    if (
                        ["add", "invite", "linked_group_join"].includes(
                            msg.subtype
                        )
                    ) {
                        /**
                         * Emitted when a user joins the chat via invite link or is added by an admin.
                         * @event Client#group_join
                         * @param {GroupNotification} notification GroupNotification with more information about the action
                         */
                        this.emit(Events.GROUP_JOIN, notification);
                    } else if (
                        msg.subtype === "remove" ||
                        msg.subtype === "leave"
                    ) {
                        /**
                         * Emitted when a user leaves the chat or is removed by an admin.
                         * @event Client#group_leave
                         * @param {GroupNotification} notification GroupNotification with more information about the action
                         */
                        this.emit(Events.GROUP_LEAVE, notification);
                    } else if (
                        msg.subtype === "promote" ||
                        msg.subtype === "demote"
                    ) {
                        /**
                         * Emitted when a current user is promoted to an admin or demoted to a regular user.
                         * @event Client#group_admin_changed
                         * @param {GroupNotification} notification GroupNotification with more information about the action
                         */
                        this.emit(Events.GROUP_ADMIN_CHANGED, notification);
                    } else if (msg.subtype === "membership_approval_request") {
                        /**
                         * Emitted when some user requested to join the group
                         * that has the membership approval mode turned on
                         * @event Client#group_membership_request
                         * @param {GroupNotification} notification GroupNotification with more information about the action
                         * @param {string} notification.chatId The group ID the request was made for
                         * @param {string} notification.author The user ID that made a request
                         * @param {number} notification.timestamp The timestamp the request was made at
                         */
                        this.emit(
                            Events.GROUP_MEMBERSHIP_REQUEST,
                            notification
                        );
                    } else {
                        /**
                         * Emitted when group settings are updated, such as subject, description or picture.
                         * @event Client#group_update
                         * @param {GroupNotification} notification GroupNotification with more information about the action
                         */
                        this.emit(Events.GROUP_UPDATE, notification);
                    }
                    return;
                }

                const message = new Message(this, msg);

                /**
                 * Emitted when a new message is created, which may include the current user's own messages.
                 * @event Client#message_create
                 * @param {Message} message The message that was created
                 */
                this.emit(Events.MESSAGE_CREATE, message);

                if (msg.id.fromMe) return;

                /**
                 * Emitted when a new message is received.
                 * @event Client#message
                 * @param {Message} message The message that was received
                 */
                this.emit(Events.MESSAGE_RECEIVED, message);
            })
        );

        let last_message;

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onChangeMessageTypeEvent",
            mark((msg) => {
                if (msg.type === "revoked") {
                    const message = new Message(this, msg);
                    let revoked_msg;
                    if (last_message && msg.id.id === last_message.id.id) {
                        revoked_msg = new Message(this, last_message);
                    }

                    /**
                     * Emitted when a message is deleted for everyone in the chat.
                     * @event Client#message_revoke_everyone
                     * @param {Message} message The message that was revoked, in its current state. It will not contain the original message's data.
                     * @param {?Message} revoked_msg The message that was revoked, before it was revoked. It will contain the message's original data.
                     * Note that due to the way this data is captured, it may be possible that this param will be undefined.
                     */
                    this.emit(
                        Events.MESSAGE_REVOKED_EVERYONE,
                        message,
                        revoked_msg
                    );
                }
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onChangeMessageEvent",
            mark((msg) => {
                if (msg.type !== "revoked") {
                    last_message = msg;
                }

                /**
                 * The event notification that is received when one of
                 * the group participants changes their phone number.
                 */
                const isParticipant =
                    msg.type === "gp2" && msg.subtype === "modify";

                /**
                 * The event notification that is received when one of
                 * the contacts changes their phone number.
                 */
                const isContact =
                    msg.type === "notification_template" &&
                    msg.subtype === "change_number";

                if (isParticipant || isContact) {
                    /** @type {GroupNotification} object does not provide enough information about this event, so a @type {Message} object is used. */
                    const message = new Message(this, msg);

                    const newId = isParticipant ? msg.recipients[0] : msg.to;
                    const oldId = isParticipant
                        ? msg.author
                        : msg.templateParams.find((id) => id !== newId);

                    /**
                     * Emitted when a contact or a group participant changes their phone number.
                     * @event Client#contact_changed
                     * @param {Message} message Message with more information about the event.
                     * @param {String} oldId The user's id (an old one) who changed their phone number
                     * and who triggered the notification.
                     * @param {String} newId The user's new id after the change.
                     * @param {Boolean} isContact Indicates if a contact or a group participant changed their phone number.
                     */
                    this.emit(
                        Events.CONTACT_CHANGED,
                        message,
                        oldId,
                        newId,
                        isContact
                    );
                }
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onRemoveMessageEvent",
            mark((msg) => {
                if (!msg.isNewMsg) return;

                const message = new Message(this, msg);

                /**
                 * Emitted when a message is deleted by the current user.
                 * @event Client#message_revoke_me
                 * @param {Message} message The message that was revoked
                 */
                this.emit(Events.MESSAGE_REVOKED_ME, message);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onMessageAckEvent",
            mark((msg, ack) => {
                const message = new Message(this, msg);

                /**
                 * Emitted when an ack event occurrs on message type.
                 * @event Client#message_ack
                 * @param {Message} message The message that was affected
                 * @param {MessageAck} ack The new ACK value
                 */
                this.emit(Events.MESSAGE_ACK, message, ack);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onChatUnreadCountEvent",
            mark(async (data) => {
                const chat = await this.getChatById(data.id);

                /**
                 * Emitted when the chat unread count changes
                 */
                this.emit(Events.UNREAD_COUNT, chat);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onMessageMediaUploadedEvent",
            mark((msg) => {
                const message = new Message(this, msg);

                /**
                 * Emitted when media has been uploaded for a message sent by the client.
                 * @event Client#media_uploaded
                 * @param {Message} message The message with media that was uploaded
                 */
                this.emit(Events.MEDIA_UPLOADED, message);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onAppStateChangedEvent",
            mark(async (state) => {
                /**
                 * Emitted when the connection state changes
                 * @event Client#change_state
                 * @param {WAState} state the new connection state
                 */
                this.emit(Events.STATE_CHANGED, state);

                const ACCEPTED_STATES = [
                    WAState.CONNECTED,
                    WAState.OPENING,
                    WAState.PAIRING,
                    WAState.TIMEOUT,
                ];

                if (this.options.takeoverOnConflict) {
                    ACCEPTED_STATES.push(WAState.CONFLICT);

                    if (state === WAState.CONFLICT) {
                        setTimeout(() => {
                            this.pupPage.evaluate(() =>
                                window.Store.AppState.takeover()
                            );
                        }, this.options.takeoverTimeoutMs);
                    }
                }

                if (!ACCEPTED_STATES.includes(state)) {
                    /**
                     * Emitted when the client has been disconnected
                     * @event Client#disconnected
                     * @param {WAState|"LOGOUT"} reason reason that caused the disconnect
                     */
                    await this.authStrategy.disconnect();
                    this.emit(Events.DISCONNECTED, state);
                    this.destroy();
                }
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onBatteryStateChangedEvent",
            mark((state) => {
                const { battery, plugged } = state;

                if (battery === undefined) return;

                /**
                 * Emitted when the battery percentage for the attached device changes. Will not be sent if using multi-device.
                 * @event Client#change_battery
                 * @param {object} batteryInfo
                 * @param {number} batteryInfo.battery - The current battery percentage
                 * @param {boolean} batteryInfo.plugged - Indicates if the phone is plugged in (true) or not (false)
                 * @deprecated
                 */
                this.emit(Events.BATTERY_CHANGED, { battery, plugged });
            })
        );

        await exposeFunctionIfAbsent(this.pupPage, "onIncomingCall", (call) => {
            /**
             * Emitted when a call is received
             * @event Client#incoming_call
             * @param {object} call
             * @param {number} call.id - Call id
             * @param {string} call.peerJid - Who called
             * @param {boolean} call.isVideo - if is video
             * @param {boolean} call.isGroup - if is group
             * @param {boolean} call.canHandleLocally - if we can handle in waweb
             * @param {boolean} call.outgoing - if is outgoing
             * @param {boolean} call.webClientShouldHandle - If Waweb should handle
             * @param {object} call.participants - Participants
             */
            const cll = new Call(this, call);
            this.emit(Events.INCOMING_CALL, cll);
        });

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onReaction",
            mark((reactions) => {
                for (const reaction of reactions) {
                    /**
                     * Emitted when a reaction is sent, received, updated or removed
                     * @event Client#message_reaction
                     * @param {object} reaction
                     * @param {object} reaction.id - Reaction id
                     * @param {number} reaction.orphan - Orphan
                     * @param {?string} reaction.orphanReason - Orphan reason
                     * @param {number} reaction.timestamp - Timestamp
                     * @param {string} reaction.reaction - Reaction
                     * @param {boolean} reaction.read - Read
                     * @param {object} reaction.msgId - Parent message id
                     * @param {string} reaction.senderId - Sender id
                     * @param {?number} reaction.ack - Ack
                     */

                    this.emit(
                        Events.MESSAGE_REACTION,
                        new Reaction(this, reaction)
                    );
                }
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onRemoveChatEvent",
            mark(async (chat) => {
                const _chat = await this.getChatById(chat.id);

                /**
                 * Emitted when a chat is removed
                 * @event Client#chat_removed
                 * @param {Chat} chat
                 */
                this.emit(Events.CHAT_REMOVED, _chat);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onArchiveChatEvent",
            mark(async (chat, currState, prevState) => {
                const _chat = await this.getChatById(chat.id);

                /**
                 * Emitted when a chat is archived/unarchived
                 * @event Client#chat_archived
                 * @param {Chat} chat
                 * @param {boolean} currState
                 * @param {boolean} prevState
                 */
                this.emit(Events.CHAT_ARCHIVED, _chat, currState, prevState);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onEditMessageEvent",
            mark((msg, newBody, prevBody) => {
                if (msg.type === "revoked") {
                    return;
                }
                /**
                 * Emitted when messages are edited
                 * @event Client#message_edit
                 * @param {Message} message
                 * @param {string} newBody
                 * @param {string} prevBody
                 */
                this.emit(
                    Events.MESSAGE_EDIT,
                    new Message(this, msg),
                    newBody,
                    prevBody
                );
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onAddMessageCiphertextEvent",
            mark((msg) => {
                /**
                 * Emitted when messages are edited
                 * @event Client#message_ciphertext
                 * @param {Message} message
                 */
                this.emit(Events.MESSAGE_CIPHERTEXT, new Message(this, msg));
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            "onPollVoteEvent",
            mark((vote) => {
                const _vote = new PollVote(this, vote);
                /**
                 * Emitted when some poll option is selected or deselected,
                 * shows a user's current selected option(s) on the poll
                 * @event Client#vote_update
                 */
                this.emit(Events.VOTE_UPDATE, _vote);
            })
        );

        await this.pupPage.evaluate(() => {
            const attachListener = (storeName, eventName, handler) => {
                window.__wwebjs_listeners = window.__wwebjs_listeners || {};
                window.__wwebjs_listeners[storeName] =
                    window.__wwebjs_listeners[storeName] || {};
                window.__wwebjs_listeners[storeName][eventName] = handler; // Store reference
                window.Store[storeName].on(eventName, handler);
            };

            attachListener("Msg", "change", (msg) => {
                window.onChangeMessageEvent(window.WWebJS.getMessageModel(msg));
            });
            attachListener("Msg", "change:type", (msg) => {
                window.onChangeMessageTypeEvent(
                    window.WWebJS.getMessageModel(msg)
                );
            });
            attachListener("Msg", "change:ack", (msg, ack) => {
                window.onMessageAckEvent(
                    window.WWebJS.getMessageModel(msg),
                    ack
                );
            });
            attachListener("Msg", "change:isUnsentMedia", (msg, unsent) => {
                if (msg.id.fromMe && !unsent)
                    window.onMessageMediaUploadedEvent(
                        window.WWebJS.getMessageModel(msg)
                    );
            });
            attachListener("Msg", "remove", (msg) => {
                if (msg.isNewMsg)
                    window.onRemoveMessageEvent(
                        window.WWebJS.getMessageModel(msg)
                    );
            });
            attachListener(
                "Msg",
                "change:body change:caption",
                (msg, newBody, prevBody) => {
                    window.onEditMessageEvent(
                        window.WWebJS.getMessageModel(msg),
                        newBody,
                        prevBody
                    );
                }
            );
            attachListener("AppState", "change:state", (_AppState, state) => {
                window.onAppStateChangedEvent(state);
            });
            attachListener("Call", "add", (call) => {
                window.onIncomingCall(call);
            });
            attachListener("Chat", "remove", async (chat) => {
                window.onRemoveChatEvent(
                    await window.WWebJS.getChatModel(chat)
                );
            });
            attachListener(
                "Chat",
                "change:archive",
                async (chat, currState, prevState) => {
                    window.onArchiveChatEvent(
                        await window.WWebJS.getChatModel(chat),
                        currState,
                        prevState
                    );
                }
            );
            attachListener("Msg", "add", (msg) => {
                if (msg.isNewMsg) {
                    if (msg.type === "ciphertext") {
                        // defer message event until ciphertext is resolved (type changed)
                        msg.once("change:type", (_msg) =>
                            window.onAddMessageEvent(
                                window.WWebJS.getMessageModel(_msg)
                            )
                        );
                        window.onAddMessageCiphertextEvent(
                            window.WWebJS.getMessageModel(msg)
                        );
                    } else {
                        window.onAddMessageEvent(
                            window.WWebJS.getMessageModel(msg)
                        );
                    }
                }
            });
            attachListener("Chat", "change:unreadCount", (chat) => {
                window.onChatUnreadCountEvent(chat);
            });
            attachListener("PollVote", "add", async (vote) => {
                const pollVoteModel = await window.WWebJS.getPollVoteModel(
                    vote
                );
                pollVoteModel && window.onPollVoteEvent(pollVoteModel);
            });

            const module = window.Store.AddonReactionTable;
            const ogMethod = module.bulkUpsert;
            if (!ogMethod.__wwebjsPatched) {
                module.bulkUpsert = ((...args) => {
                    window.onReaction(
                        args[0].map((reaction) => {
                            const msgKey = reaction.id;
                            const parentMsgKey = reaction.reactionParentKey;
                            const timestamp = reaction.reactionTimestamp / 1000;
                            const sender = reaction.author ?? reaction.from;
                            const senderUserJid = sender._serialized;

                            return {
                                ...reaction,
                                msgKey,
                                parentMsgKey,
                                senderUserJid,
                                timestamp,
                            };
                        })
                    );
                    return ogMethod.apply(module, args);
                }).bind(module);
                module.bulkUpsert.__wwebjsPatched = true;
            }
        });
    }

    async initWebVersionCache() {
        const { type: webCacheType, ...webCacheOptions } =
            this.options.webVersionCache;
        const webCache = WebCacheFactory.createWebCache(
            webCacheType,
            webCacheOptions
        );

        const requestedVersion = this.options.webVersion;
        const versionContent = await webCache.resolve(requestedVersion);

        if (versionContent) {
            await this.pupPage.setRequestInterception(true);
            this.pupPage.on("request", async (req) => {
                if (req.url() === WhatsWebURL) {
                    req.respond({
                        status: 200,
                        contentType: "text/html",
                        body: versionContent,
                    });
                } else {
                    req.continue();
                }
            });
        } else {
            this.pupPage.on("response", async (res) => {
                if (res.ok() && res.url() === WhatsWebURL) {
                    const indexHtml = await res.text();
                    this.currentIndexHtml = indexHtml;
                }
            });
        }
    }

    /**
     * Closes the client
     */
    async destroy() {
        if (this._authStoreCheckInterval) {
            clearInterval(this._authStoreCheckInterval);
        }
        const browserPid = this.pupBrowser?.process()?.pid;
        await this.pupBrowser?.close();
        await this.authStrategy?.destroy();

        if (browserPid) treeKill(browserPid);
    }

    /**
     * Logs out the client, closing the current session
     */
    async logout() {
        await this.pupPage
            ?.evaluate(() => {
                if (
                    window.Store?.AppState &&
                    typeof window.Store.AppState.logout === "function"
                ) {
                    return window.Store.AppState.logout();
                }
            })
            .catch((e) =>
                console.error(
                    `[${this.clientId}] Received an error when tried to logout from the session`,
                    e
                )
            );
        await this.pupBrowser?.close();

        let maxDelay = 0;
        while (this.pupBrowser.connected && maxDelay < 10) {
            // waits a maximum of 1 second before calling the AuthStrategy
            await new Promise((resolve) => setTimeout(resolve, 100));
            maxDelay++;
        }

        await this.authStrategy.logout();
    }

    /**
     * Returns the version of WhatsApp Web currently being run
     * @returns {Promise<string>}
     */
    async getWWebVersion() {
        return await this.pupPage.evaluate(() => {
            return window.Debug.VERSION;
        });
    }

    /**
     * Mark as seen for the Chat
     * @param {string} chatId
     * @returns {Promise<boolean>} result
     *
     */
    async sendSeen(chatId) {
        const result = await this.pupPage.evaluate(async (chatId) => {
            return window.WWebJS.sendSeen(chatId);
        }, chatId);
        return result;
    }

    /**
     * An object representing mentions of groups
     * @typedef {Object} GroupMention
     * @property {string} subject - The name of a group to mention (can be custom)
     * @property {string} id - The group ID, e.g.: 'XXXXXXXXXX@g.us'
     */

    /**
     * Message options.
     * @typedef {Object} MessageSendOptions
     * @property {boolean} [linkPreview=true] - Show links preview. Has no effect on multi-device accounts.
     * @property {boolean} [sendAudioAsVoice=false] - Send audio as voice message with a generated waveform
     * @property {boolean} [sendVideoAsGif=false] - Send video as gif
     * @property {boolean} [sendMediaAsSticker=false] - Send media as a sticker
     * @property {boolean} [sendMediaAsDocument=false] - Send media as a document
     * @property {boolean} [isViewOnce=false] - Send photo/video as a view once message
     * @property {boolean} [parseVCards=true] - Automatically parse vCards and send them as contacts
     * @property {string} [caption] - Image or video caption
     * @property {string} [quotedMessageId] - Id of the message that is being quoted (or replied to)
     * @property {GroupMention[]} [groupMentions] - An array of object that handle group mentions
     * @property {string[]} [mentions] - User IDs to mention in the message
     * @property {boolean} [sendSeen=true] - Mark the conversation as seen after sending the message
     * @property {string} [invokedBotWid=undefined] - Bot Wid when doing a bot mention like @Meta AI
     * @property {string} [stickerAuthor=undefined] - Sets the author of the sticker, (if sendMediaAsSticker is true).
     * @property {string} [stickerName=undefined] - Sets the name of the sticker, (if sendMediaAsSticker is true).
     * @property {string[]} [stickerCategories=undefined] - Sets the categories of the sticker, (if sendMediaAsSticker is true). Provide emoji char array, can be null.
     * @property {MessageMedia} [media] - Media to be sent
     */

    /**
     * Send a message to a specific chatId.
     *
     * @param  {string} chatId
     * @param  {string | MessageMedia | {mediaKey:string} | Location | Poll | Contact | Array<Contact> | Buttons | List} content
     * @param  {MessageSendOptions & { preparedMedia?: Object }} [options]
     * @returns {Promise<Message>}
     */
    async sendMessage(chatId, content, options = {}) {
        /* ---------- base options ---------- */
        const internalOptions = {
            linkPreview: options.linkPreview === false ? undefined : true,
            sendAudioAsVoice: options.sendAudioAsVoice,
            sendVideoAsGif: options.sendVideoAsGif,
            sendMediaAsSticker: options.sendMediaAsSticker,
            sendMediaAsDocument: options.sendMediaAsDocument,
            caption: options.caption,
            quotedMessageId: options.quotedMessageId,
            parseVCards: options.parseVCards === false ? false : true,
            mentionedJidList: Array.isArray(options.mentions)
                ? options.mentions.map((c) => (c?.id ? c.id._serialized : c))
                : [],
            extraOptions: options.extra,
        };

        /* ---------- other input-types ---------- */
        if (content instanceof MessageMedia) {
            internalOptions.attachment = content;
            internalOptions.isViewOnce = options.isViewOnce;
            content = "";
        } else if (options.media instanceof MessageMedia) {
            internalOptions.attachment = options.media;
            internalOptions.caption = content;
            internalOptions.isViewOnce = options.isViewOnce;
            content = "";
        } else if (content instanceof Location) {
            internalOptions.location = content;
            content = "";
        } else if (content instanceof Poll) {
            internalOptions.poll = content;
            content = "";
        } else if (content instanceof Contact) {
            internalOptions.contactCard = content.id._serialized;
            content = "";
        } else if (Array.isArray(content) && content[0] instanceof Contact) {
            internalOptions.contactCardList = content.map(
                (c) => c.id._serialized
            );
            content = "";
        } else if (content instanceof Buttons) {
            if (content.type !== "chat")
                internalOptions.attachment = content.body;
            internalOptions.buttons = content;
            content = "";
        } else if (content instanceof List) {
            internalOptions.list = content;
            content = "";
        }

        /* ---------- sticker conversion ---------- */
        if (
            internalOptions.sendMediaAsSticker &&
            internalOptions.attachment // Sticker conversion only happens if attachment was set above
        ) {
            internalOptions.attachment = await Util.formatToWebpSticker(
                internalOptions.attachment,
                {
                    name: options.stickerName,
                    author: options.stickerAuthor,
                    categories: options.stickerCategories,
                },
                this.pupPage
            );
        }

        /* ---------- mark-as-seen flag ---------- */
        const sendSeen =
            options.sendSeen === undefined ? true : options.sendSeen;

        /* ---------- hand off to in-page helper ---------- */
        const { message: newMessage, error } = await this.pupPage.evaluate(
            async (chatId, body, opts, seen) => {
                const chatWid = window.Store.WidFactory.createWid(chatId);
                const chat =
                    window.Store.Chat.get(chatWid) ||
                    (await window.Store.Chat.find(chatWid));
                if (!chat) throw new Error("Chat not found");

                if (seen) void window.Store.SendSeen.sendSeen(chat, false);

                try {
                    const m = await window.WWebJS.sendMessage(chat, body, opts);
                    return { message: window.WWebJS.getMessageModel(m) };
                } catch (e) {
                    return {
                        error: {
                            name: e.name,
                            message: e.message,
                            stack: e.stack,
                            code: e.code,
                            chatId: chatWid,
                        },
                    };
                }
            },
            chatId,
            content,
            internalOptions,
            sendSeen
        );

        if (error) {
            console.error(
                `[${this.clientId}] Failed to send message to`,
                chatId,
                error
            );
            throw new SendMessageError({ ...error, clientId: this.clientId });
        }

        return new Message(this, newMessage);
    }

    /**
     * Prepare a media file for sending.
     * @param {string} filePath - The path to the media file.
     * @param {string} uniqueId - A unique identifier for the media.
     * @param {Object} options - Additional options.
     * @param {boolean} [options.forceVoice=false] - Force the media to be sent as a voice message.
     * @param {boolean} [options.forceDocument=false] - Force the media to be sent as a document.
     * @param {boolean} [options.forceGif=false] - Force the media to be sent as a GIF.
     * @param {AbortSignal} [options.signal] - Abort signal to kill all attempts
     * @returns {Promise<string>} The ID of the input element.
     */
    async prepareMedia(filePath, uniqueId, options = {}) {
        const sanitizedUniqueId = uniqueId.replace(/[^a-zA-Z0-9_]/g, "_");
        const inputId = `wwebjs-upload-${sanitizedUniqueId}`;

        // Create input element in browser
        await this.pupPage.evaluate((id) => {
            const input = document.createElement("input");
            input.type = "file";
            input.id = id;
            input.style.display = "none";
            document.body.appendChild(input);
        }, inputId);

        let input = await this.pupPage.$(`#${inputId}`);

        if (!input) {
            let maxDelay = 0;
            while (!input && maxDelay < 30 /** 30 seconds */) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                input = await this.pupPage.$(`#${inputId}`);
                maxDelay++;
            }
            if (!input) throw new Error("Media upload timed out after 30s");
        }

        await input.uploadFile(filePath);

        // Race browser logic against the abort signal outside
        let abortListener;
        const abortPromise = new Promise((_, reject) => {
            if (options.signal) {
                abortListener = () => reject(new Error("Aborted by signal"));
                options.signal.addEventListener("abort", abortListener);
            }
        });

        const mainPromise = this.pupPage.evaluate(
            async (id, options) => {
                let finished = false;
                let timeout;
                try {
                    const file = document.getElementById(id)?.files?.[0];
                    if (!file) throw new Error("No file found in input");

                    timeout = setTimeout(() => {
                        if (!finished) {
                            finished = true;
                            document.getElementById(id)?.remove();
                            throw new Error(
                                "Media upload timed out after 120s"
                            );
                        }
                    }, 120000);

                    const data = await window.WWebJS.processMediaData(
                        file,
                        options
                    );
                    if (!window.WWebJS.preparedMediaMap)
                        window.WWebJS.preparedMediaMap = {};
                    window.WWebJS.preparedMediaMap[id] = data;
                    finished = true;
                    return true;
                } finally {
                    clearTimeout(timeout);
                    document.getElementById(id)?.remove();
                }
            },
            inputId,
            options
        );

        // Race the promises: if abort wins, cleanup input in Node. If not, continue.
        try {
            await Promise.race([mainPromise, abortPromise]);
        } finally {
            if (options.signal && abortListener) {
                options.signal.removeEventListener("abort", abortListener);
            }
            try {
                await input.dispose();
            } catch {}
            await this.pupPage.evaluate((id) => {
                const el = document.getElementById(id);
                if (el) el.remove();
            }, inputId);
        }

        return inputId;
    }

    /**
     * React to a message with an emoji
     * @param {string} reaction - Emoji to react with. Send an empty string to remove the reaction.
     * @param {string} messageId - The ID of the message to react to.
     * @return {Promise}
     */
    async sendReaction(reaction, messageId) {
        await this.pupPage.evaluate(
            async (messageId, reaction) => {
                const msg =
                    window.Store.Msg.get(messageId) ||
                    (await window.Store.Msg.getMessagesById([messageId]))
                        ?.messages?.[0];

                if (msg) {
                    await window.Store.sendReactionToMsg(msg, reaction);
                }
            },
            messageId,
            reaction
        );
    }

    /**
     * Searches for messages
     * @param {string} query
     * @param {Object} [options]
     * @param {number} [options.page]
     * @param {number} [options.limit]
     * @param {string} [options.chatId]
     * @returns {Promise<Message[]>}
     */
    async searchMessages(query, options = {}) {
        const messages = await this.pupPage.evaluate(
            async (query, page, count, remote) => {
                const { messages } = await window.Store.Msg.search(
                    query,
                    page,
                    count,
                    remote
                );
                return messages.map((msg) =>
                    window.WWebJS.getMessageModel(msg)
                );
            },
            query,
            options.page,
            options.limit,
            options.chatId
        );

        return messages.map((msg) => new Message(this, msg));
    }

    /**
     * Get all current chat instances
     * @returns {Promise<Array<Chat>>}
     */
    async getChats() {
        let chats = await this.pupPage.evaluate(async () => {
            return await window.WWebJS.getChats();
        });

        return chats.map((chat) => ChatFactory.create(this, chat));
    }

    /**
     * Get chat instance by ID
     * @param {string} chatId
     * @returns {Promise<Chat>}
     */
    async getChatById(chatId) {
        let chat = await this.pupPage.evaluate(async (chatId) => {
            return await window.WWebJS.getChat(chatId);
        }, chatId);

        return ChatFactory.create(this, chat);
    }

    /**
     * Get all current contact instances
     * @returns {Promise<Array<Contact>>}
     */
    async getContacts() {
        let contacts = await this.pupPage.evaluate(() => {
            return window.WWebJS.getContacts();
        });

        return contacts.map((contact) => ContactFactory.create(this, contact));
    }

    /**
     * Get contact instance by ID
     * @param {string} contactId
     * @returns {Promise<Contact>}
     */
    async getContactById(contactId) {
        let contact = await this.pupPage.evaluate((contactId) => {
            return window.WWebJS.getContact(contactId);
        }, contactId);

        return ContactFactory.create(this, contact);
    }

    async getMessageById(messageId) {
        const msg = await this.pupPage.evaluate(async (messageId) => {
            let msg = window.Store.Msg.get(messageId);
            if (msg) return window.WWebJS.getMessageModel(msg);

            const params = messageId.split("_");
            if (params.length !== 3 && params.length !== 4)
                throw new Error("Invalid serialized message id specified");

            let messagesObject = await window.Store.Msg.getMessagesById([
                messageId,
            ]);
            if (messagesObject && messagesObject.messages.length)
                msg = messagesObject.messages[0];

            if (msg) return window.WWebJS.getMessageModel(msg);
        }, messageId);

        if (msg) return new Message(this, msg);
        return null;
    }

    /**
     * Returns an object with information about the invite code's group
     * @param {string} inviteCode
     * @returns {Promise<object>} Invite information
     */
    async getInviteInfo(inviteCode) {
        return await this.pupPage.evaluate((inviteCode) => {
            return window.Store.GroupInvite.queryGroupInvite(inviteCode);
        }, inviteCode);
    }

    /**
     * Accepts an invitation to join a group
     * @param {string} inviteCode Invitation code
     * @returns {Promise<string>} Id of the joined Chat
     */
    async acceptInvite(inviteCode) {
        const res = await this.pupPage.evaluate(async (inviteCode) => {
            return await window.Store.GroupInvite.joinGroupViaInvite(
                inviteCode
            );
        }, inviteCode);

        return res.gid._serialized;
    }

    /**
     * Accepts a private invitation to join a group
     * @param {object} inviteInfo Invite V4 Info
     * @returns {Promise<Object>}
     */
    async acceptGroupV4Invite(inviteInfo) {
        if (!inviteInfo.inviteCode)
            throw "Invalid invite code, try passing the message.inviteV4 object";
        if (inviteInfo.inviteCodeExp == 0) throw "Expired invite code";
        return this.pupPage.evaluate(async (inviteInfo) => {
            let { groupId, fromId, inviteCode, inviteCodeExp } = inviteInfo;
            let userWid = window.Store.WidFactory.createWid(fromId);
            return await window.Store.GroupInviteV4.joinGroupViaInviteV4(
                inviteCode,
                String(inviteCodeExp),
                groupId,
                userWid
            );
        }, inviteInfo);
    }

    /**
     * Sets the current user's status message
     * @param {string} status New status message
     */
    async setStatus(status) {
        await this.pupPage.evaluate(async (status) => {
            return await window.Store.StatusUtils.setMyStatus(status);
        }, status);
    }

    /**
     * Sets the current user's display name.
     * This is the name shown to WhatsApp users that have not added you as a contact beside your number in groups and in your profile.
     * @param {string} displayName New display name
     * @returns {Promise<Boolean>}
     */
    async setDisplayName(displayName) {
        const couldSet = await this.pupPage.evaluate(async (displayName) => {
            if (!window.Store.Conn.canSetMyPushname()) return false;
            await window.Store.Settings.setPushname(displayName);
            return true;
        }, displayName);

        return couldSet;
    }

    /**
     * Gets the current connection state for the client
     * @returns {WAState}
     */
    async getState() {
        return await this.pupPage.evaluate(() => {
            if (!window.Store) return null;
            return window.Store.AppState.state;
        });
    }

    /**
     * Marks the client as online
     */
    async sendPresenceAvailable() {
        return await this.pupPage.evaluate(() => {
            return window.Store.PresenceUtils.sendPresenceAvailable();
        });
    }

    /**
     * Marks the client as unavailable
     */
    async sendPresenceUnavailable() {
        return await this.pupPage.evaluate(() => {
            return window.Store.PresenceUtils.sendPresenceUnavailable();
        });
    }

    /**
     * Enables and returns the archive state of the Chat
     * @returns {boolean}
     */
    async archiveChat(chatId) {
        return await this.pupPage.evaluate(async (chatId) => {
            let chat = await window.Store.Chat.get(chatId);
            await window.Store.Cmd.archiveChat(chat, true);
            return true;
        }, chatId);
    }

    /**
     * Changes and returns the archive state of the Chat
     * @returns {boolean}
     */
    async unarchiveChat(chatId) {
        return await this.pupPage.evaluate(async (chatId) => {
            let chat = await window.Store.Chat.get(chatId);
            await window.Store.Cmd.archiveChat(chat, false);
            return false;
        }, chatId);
    }

    /**
     * Pins the Chat
     * @returns {Promise<boolean>} New pin state. Could be false if the max number of pinned chats was reached.
     */
    async pinChat(chatId) {
        return this.pupPage.evaluate(async (chatId) => {
            let chat = window.Store.Chat.get(chatId);
            if (chat.pin) {
                return true;
            }
            const MAX_PIN_COUNT = 3;
            const chatModels = window.Store.Chat.getModelsArray();
            if (chatModels.length > MAX_PIN_COUNT) {
                let maxPinned = chatModels[MAX_PIN_COUNT - 1].pin;
                if (maxPinned) {
                    return false;
                }
            }
            await window.Store.Cmd.pinChat(chat, true);
            return true;
        }, chatId);
    }

    /**
     * Unpins the Chat
     * @returns {Promise<boolean>} New pin state
     */
    async unpinChat(chatId) {
        return this.pupPage.evaluate(async (chatId) => {
            let chat = window.Store.Chat.get(chatId);
            if (!chat.pin) {
                return false;
            }
            await window.Store.Cmd.pinChat(chat, false);
            return false;
        }, chatId);
    }

    /**
     * Mutes this chat forever, unless a date is specified
     * @param {string} chatId ID of the chat that will be muted
     * @param {?Date} unmuteDate Date when the chat will be unmuted, leave as is to mute forever
     */
    async muteChat(chatId, unmuteDate) {
        unmuteDate = unmuteDate ? unmuteDate.getTime() / 1000 : -1;
        await this.pupPage.evaluate(
            async (chatId, timestamp) => {
                let chat = await window.Store.Chat.get(chatId);
                await chat.mute.mute({ expiration: timestamp, sendDevice: !0 });
            },
            chatId,
            unmuteDate || -1
        );
    }

    /**
     * Unmutes the Chat
     * @param {string} chatId ID of the chat that will be unmuted
     */
    async unmuteChat(chatId) {
        await this.pupPage.evaluate(async (chatId) => {
            let chat = await window.Store.Chat.get(chatId);
            await window.Store.Cmd.muteChat(chat, false);
        }, chatId);
    }

    /**
     * Mark the Chat as unread
     * @param {string} chatId ID of the chat that will be marked as unread
     */
    async markChatUnread(chatId) {
        await this.pupPage.evaluate(async (chatId) => {
            let chat = await window.Store.Chat.get(chatId);
            await window.Store.Cmd.markChatUnread(chat, true);
        }, chatId);
    }

    /**
     * Returns the contact ID's profile picture URL, if privacy settings allow it
     * @param {string} contactId the whatsapp user's ID
     * @returns {Promise<string>}
     */
    async getProfilePicUrl(contactId) {
        if (!this.pupPage || this.pupPage.isClosed()) {
            console.warn(
                `[${this.clientId}] [getProfilePicUrl] Page is closed or undefined. Skipping.`
            );
            return undefined;
        }

        const profilePic = await this.pupPage.evaluate(async (contactId) => {
            try {
                const chatWid = window.Store.WidFactory.createWid(contactId);
                return await window.Store.ProfilePic.requestProfilePicFromServer(
                    chatWid
                );
            } catch (err) {
                if (err.name === "ServerStatusCodeError") return undefined;
                throw err;
            }
        }, contactId);

        return profilePic ? profilePic.eurl : undefined;
    }

    /**
     * Gets the Contact's common groups with you. Returns empty array if you don't have any common group.
     * @param {string} contactId the whatsapp user's ID (_serialized format)
     * @returns {Promise<WAWebJS.ChatId[]>}
     */
    async getCommonGroups(contactId) {
        const commonGroups = await this.pupPage.evaluate(async (contactId) => {
            let contact = window.Store.Contact.get(contactId);
            if (!contact) {
                const wid = window.Store.WidFactory.createUserWid(contactId);
                const chatConstructor =
                    window.Store.Contact.getModelsArray().find(
                        (c) => !c.isGroup
                    ).constructor;
                contact = new chatConstructor({ id: wid });
            }

            if (contact.commonGroups) {
                return contact.commonGroups.serialize();
            }
            const status = await window.Store.findCommonGroups(contact);
            if (status) {
                return contact.commonGroups.serialize();
            }
            return [];
        }, contactId);
        const chats = [];
        for (const group of commonGroups) {
            chats.push(group.id);
        }
        return chats;
    }

    /**
     * Force reset of connection state for the client
     */
    async resetState() {
        await this.pupPage.evaluate(() => {
            window.Store.AppState.phoneWatchdog.shiftTimer.forceRunNow();
        });
    }

    /**
     * Check if a given ID is registered in whatsapp
     * @param {string} id the whatsapp user's ID
     * @returns {Promise<Boolean>}
     */
    async isRegisteredUser(id) {
        return Boolean(await this.getNumberId(id));
    }

    /**
     * Get the registered WhatsApp ID for a number.
     * Will return null if the number is not registered on WhatsApp.
     * @param {string} number Number or ID ("@c.us" will be automatically appended if not specified)
     * @returns {Promise<Object|null>}
     */
    async getNumberId(number) {
        return await this.pupPage.evaluate(
            async (number) => {
                const wid = window.Store.WidFactory.createWid(number);
                const result = await window.Store.QueryExist(wid);
                if (!result || result.wid === undefined) return null;
                return result.wid;
            },
            number.endsWith("@c.us") ? number : `${number}@c.us`
        );
    }

    /**
     * Get the formatted number of a WhatsApp ID.
     * @param {string} number Number or ID
     * @returns {Promise<string>}
     */
    async getFormattedNumber(number) {
        if (!number.endsWith("@s.whatsapp.net"))
            number = number.replace("c.us", "s.whatsapp.net");
        if (!number.includes("@s.whatsapp.net"))
            number = `${number}@s.whatsapp.net`;

        return await this.pupPage.evaluate(async (numberId) => {
            return window.Store.NumberInfo.formattedPhoneNumber(numberId);
        }, number);
    }

    /**
     * Get the country code of a WhatsApp ID.
     * @param {string} number Number or ID
     * @returns {Promise<string>}
     */
    async getCountryCode(number) {
        number = number
            .replace(/\s+/g, "")
            .replace(/\+/g, "")
            .replace("@c.us", "");

        return await this.pupPage.evaluate(async (numberId) => {
            return window.Store.NumberInfo.findCC(numberId);
        }, number);
    }

    /**
     * An object that represents the result for a participant added to a group
     * @typedef {Object} ParticipantResult
     * @property {number} statusCode The status code of the result
     * @property {string} message The result message
     * @property {boolean} isGroupCreator Indicates if the participant is a group creator
     * @property {boolean} isInviteV4Sent Indicates if the inviteV4 was sent to the participant
     */

    /**
     * An object that handles the result for {@link createGroup} method
     * @typedef {Object} CreateGroupResult
     * @property {string} title A group title
     * @property {Object} gid An object that handles the newly created group ID
     * @property {string} gid.server
     * @property {string} gid.user
     * @property {string} gid._serialized
     * @property {Object.<string, ParticipantResult>} participants An object that handles the result value for each added to the group participant
     */

    /**
     * An object that handles options for group creation
     * @typedef {Object} CreateGroupOptions
     * @property {number} [messageTimer = 0] The number of seconds for the messages to disappear in the group (0 by default, won't take an effect if the group is been creating with myself only)
     * @property {string|undefined} parentGroupId The ID of a parent community group to link the newly created group with (won't take an effect if the group is been creating with myself only)
     * @property {boolean} [autoSendInviteV4 = true] If true, the inviteV4 will be sent to those participants who have restricted others from being automatically added to groups, otherwise the inviteV4 won't be sent (true by default)
     * @property {string} [comment = ''] The comment to be added to an inviteV4 (empty string by default)
     */

    /**
     * Creates a new group
     * @param {string} title Group title
     * @param {string|Contact|Array<Contact|string>|undefined} participants A single Contact object or an ID as a string or an array of Contact objects or contact IDs to add to the group
     * @param {CreateGroupOptions} options An object that handles options for group creation
     * @returns {Promise<CreateGroupResult|string>} Object with resulting data or an error message as a string
     */
    async createGroup(title, participants = [], options = {}) {
        !Array.isArray(participants) && (participants = [participants]);
        participants.map((p) => (p instanceof Contact ? p.id._serialized : p));

        return await this.pupPage.evaluate(
            async (title, participants, options) => {
                const {
                    messageTimer = 0,
                    parentGroupId,
                    autoSendInviteV4 = true,
                    comment = "",
                } = options;
                const participantData = {},
                    participantWids = [],
                    failedParticipants = [];
                let createGroupResult, parentGroupWid;

                const addParticipantResultCodes = {
                    default:
                        "An unknown error occupied while adding a participant",
                    200: "The participant was added successfully",
                    403: "The participant can be added by sending private invitation only",
                    404: "The phone number is not registered on WhatsApp",
                };

                for (const participant of participants) {
                    const pWid = window.Store.WidFactory.createWid(participant);
                    if ((await window.Store.QueryExist(pWid))?.wid)
                        participantWids.push(pWid);
                    else failedParticipants.push(participant);
                }

                parentGroupId &&
                    (parentGroupWid =
                        window.Store.WidFactory.createWid(parentGroupId));

                try {
                    createGroupResult =
                        await window.Store.GroupUtils.createGroup(
                            {
                                memberAddMode:
                                    options.memberAddMode === undefined
                                        ? true
                                        : options.memberAddMode,
                                membershipApprovalMode:
                                    options.membershipApprovalMode === undefined
                                        ? false
                                        : options.membershipApprovalMode,
                                announce:
                                    options.announce === undefined
                                        ? true
                                        : options.announce,
                                ephemeralDuration: messageTimer,
                                full: undefined,
                                parentGroupId: parentGroupWid,
                                restrict:
                                    options.restrict === undefined
                                        ? true
                                        : options.restrict,
                                thumb: undefined,
                                title: title,
                            },
                            participantWids
                        );
                } catch (err) {
                    return "CreateGroupError: An unknown error occupied while creating a group";
                }

                for (const participant of createGroupResult.participants) {
                    let isInviteV4Sent = false;
                    const participantId = participant.wid._serialized;
                    const statusCode = participant.error ?? 200;

                    if (autoSendInviteV4 && statusCode === 403) {
                        window.Store.Contact.gadd(participant.wid, {
                            silent: true,
                        });
                        const addParticipantResult =
                            await window.Store.GroupInviteV4.sendGroupInviteMessage(
                                await window.Store.Chat.find(participant.wid),
                                createGroupResult.wid._serialized,
                                createGroupResult.subject,
                                participant.invite_code,
                                participant.invite_code_exp,
                                comment,
                                await window.WWebJS.getProfilePicThumbToBase64(
                                    createGroupResult.wid
                                )
                            );
                        isInviteV4Sent = window.compareWwebVersions(
                            window.Debug.VERSION,
                            "<",
                            "2.2335.6"
                        )
                            ? addParticipantResult === "OK"
                            : addParticipantResult.messageSendResult === "OK";
                    }

                    participantData[participantId] = {
                        statusCode: statusCode,
                        message:
                            addParticipantResultCodes[statusCode] ||
                            addParticipantResultCodes.default,
                        isGroupCreator: participant.type === "superadmin",
                        isInviteV4Sent: isInviteV4Sent,
                    };
                }

                for (const f of failedParticipants) {
                    participantData[f] = {
                        statusCode: 404,
                        message: addParticipantResultCodes[404],
                        isGroupCreator: false,
                        isInviteV4Sent: false,
                    };
                }

                return {
                    title: title,
                    gid: createGroupResult.wid,
                    participants: participantData,
                };
            },
            title,
            participants,
            options
        );
    }

    /**
     * Get all current Labels
     * @returns {Promise<Array<Label>>}
     */
    async getLabels() {
        const labels = await this.pupPage.evaluate(async () => {
            return window.WWebJS.getLabels();
        });

        return labels.map((data) => new Label(this, data));
    }

    /**
     * Get all current Broadcast
     * @returns {Promise<Array<Broadcast>>}
     */
    async getBroadcasts() {
        const broadcasts = await this.pupPage.evaluate(async () => {
            return window.WWebJS.getAllStatuses();
        });
        return broadcasts.map((data) => new Broadcast(this, data));
    }

    /**
     * Get Label instance by ID
     * @param {string} labelId
     * @returns {Promise<Label>}
     */
    async getLabelById(labelId) {
        const label = await this.pupPage.evaluate(async (labelId) => {
            return window.WWebJS.getLabel(labelId);
        }, labelId);

        return new Label(this, label);
    }

    /**
     * Get all Labels assigned to a chat
     * @param {string} chatId
     * @returns {Promise<Array<Label>>}
     */
    async getChatLabels(chatId) {
        const labels = await this.pupPage.evaluate(async (chatId) => {
            return window.WWebJS.getChatLabels(chatId);
        }, chatId);

        return labels.map((data) => new Label(this, data));
    }

    /**
     * Get all Chats for a specific Label
     * @param {string} labelId
     * @returns {Promise<Array<Chat>>}
     */
    async getChatsByLabelId(labelId) {
        const chatIds = await this.pupPage.evaluate(async (labelId) => {
            const label = window.Store.Label.get(labelId);
            const labelItems = label.labelItemCollection.getModelsArray();
            return labelItems.reduce((result, item) => {
                if (item.parentType === "Chat") {
                    result.push(item.parentId);
                }
                return result;
            }, []);
        }, labelId);

        return Promise.all(chatIds.map((id) => this.getChatById(id)));
    }

    /**
     * Gets all blocked contacts by host account
     * @returns {Promise<Array<Contact>>}
     */
    async getBlockedContacts() {
        const blockedContacts = await this.pupPage.evaluate(() => {
            let chatIds = window.Store.Blocklist.getModelsArray().map(
                (a) => a.id._serialized
            );
            return Promise.all(
                chatIds.map((id) => window.WWebJS.getContact(id))
            );
        });

        return blockedContacts.map((contact) =>
            ContactFactory.create(this.client, contact)
        );
    }

    /**
     * Sets the current user's profile picture.
     * @param {MessageMedia} media
     * @returns {Promise<boolean>} Returns true if the picture was properly updated.
     */
    async setProfilePicture(media) {
        const success = await this.pupPage.evaluate(
            (chatid, media) => {
                return window.WWebJS.setPicture(chatid, media);
            },
            this.info.wid._serialized,
            media
        );

        return success;
    }

    /**
     * Deletes the current user's profile picture.
     * @returns {Promise<boolean>} Returns true if the picture was properly deleted.
     */
    async deleteProfilePicture() {
        const success = await this.pupPage.evaluate((chatid) => {
            return window.WWebJS.deletePicture(chatid);
        }, this.info.wid._serialized);

        return success;
    }

    /**
     * Change labels in chats
     * @param {Array<number|string>} labelIds
     * @param {Array<string>} chatIds
     * @returns {Promise<void>}
     */
    async addOrRemoveLabels(labelIds, chatIds) {
        return this.pupPage.evaluate(
            async (labelIds, chatIds) => {
                if (
                    ["smba", "smbi"].indexOf(window.Store.Conn.platform) === -1
                ) {
                    throw "[LT01] Only Whatsapp business";
                }
                const labels = window.WWebJS.getLabels().filter(
                    (e) => labelIds.find((l) => l == e.id) !== undefined
                );
                const chats = window.Store.Chat.filter((e) =>
                    chatIds.includes(e.id._serialized)
                );

                let actions = labels.map((label) => ({
                    id: label.id,
                    type: "add",
                }));

                chats.forEach((chat) => {
                    (chat.labels || []).forEach((n) => {
                        if (!actions.find((e) => e.id == n)) {
                            actions.push({ id: n, type: "remove" });
                        }
                    });
                });

                return await window.Store.Label.addOrRemoveLabels(
                    actions,
                    chats
                );
            },
            labelIds,
            chatIds
        );
    }

    /**
     * An object that handles the information about the group membership request
     * @typedef {Object} GroupMembershipRequest
     * @property {Object} id The wid of a user who requests to enter the group
     * @property {Object} addedBy The wid of a user who created that request
     * @property {Object|null} parentGroupId The wid of a community parent group to which the current group is linked
     * @property {string} requestMethod The method used to create the request: NonAdminAdd/InviteLink/LinkedGroupJoin
     * @property {number} t The timestamp the request was created at
     */

    /**
     * Gets an array of membership requests
     * @param {string} groupId The ID of a group to get membership requests for
     * @returns {Promise<Array<GroupMembershipRequest>>} An array of membership requests
     */
    async getGroupMembershipRequests(groupId) {
        return await this.pupPage.evaluate(async (groupId) => {
            const groupWid = window.Store.WidFactory.createWid(groupId);
            return await window.Store.MembershipRequestUtils.getMembershipApprovalRequests(
                groupWid
            );
        }, groupId);
    }

    /**
     * An object that handles the result for membership request action
     * @typedef {Object} MembershipRequestActionResult
     * @property {string} requesterId User ID whos membership request was approved/rejected
     * @property {number|undefined} error An error code that occurred during the operation for the participant
     * @property {string} message A message with a result of membership request action
     */

    /**
     * An object that handles options for {@link approveGroupMembershipRequests} and {@link rejectGroupMembershipRequests} methods
     * @typedef {Object} MembershipRequestActionOptions
     * @property {Array<string>|string|null} requesterIds User ID/s who requested to join the group, if no value is provided, the method will search for all membership requests for that group
     * @property {Array<number>|number|null} sleep The number of milliseconds to wait before performing an operation for the next requester. If it is an array, a random sleep time between the sleep[0] and sleep[1] values will be added (the difference must be >=100 ms, otherwise, a random sleep time between sleep[1] and sleep[1] + 100 will be added). If sleep is a number, a sleep time equal to its value will be added. By default, sleep is an array with a value of [250, 500]
     */

    /**
     * Approves membership requests if any
     * @param {string} groupId The group ID to get the membership request for
     * @param {MembershipRequestActionOptions} options Options for performing a membership request action
     * @returns {Promise<Array<MembershipRequestActionResult>>} Returns an array of requester IDs whose membership requests were approved and an error for each requester, if any occurred during the operation. If there are no requests, an empty array will be returned
     */
    async approveGroupMembershipRequests(groupId, options = {}) {
        return await this.pupPage.evaluate(
            async (groupId, options) => {
                const { requesterIds = null, sleep = [250, 500] } = options;
                return await window.WWebJS.membershipRequestAction(
                    groupId,
                    "Approve",
                    requesterIds,
                    sleep
                );
            },
            groupId,
            options
        );
    }

    /**
     * Rejects membership requests if any
     * @param {string} groupId The group ID to get the membership request for
     * @param {MembershipRequestActionOptions} options Options for performing a membership request action
     * @returns {Promise<Array<MembershipRequestActionResult>>} Returns an array of requester IDs whose membership requests were rejected and an error for each requester, if any occurred during the operation. If there are no requests, an empty array will be returned
     */
    async rejectGroupMembershipRequests(groupId, options = {}) {
        return await this.pupPage.evaluate(
            async (groupId, options) => {
                const { requesterIds = null, sleep = [250, 500] } = options;
                return await window.WWebJS.membershipRequestAction(
                    groupId,
                    "Reject",
                    requesterIds,
                    sleep
                );
            },
            groupId,
            options
        );
    }

    /**
     * Setting autoload download audio
     * @param {boolean} flag true/false
     */
    async setAutoDownloadAudio(flag) {
        await this.pupPage.evaluate(async (flag) => {
            const autoDownload = window.Store.Settings.getAutoDownloadAudio();
            if (autoDownload === flag) {
                return flag;
            }

            console.error(
                `[${
                    window.wwebjs_client_id || "default"
                }] Updating auto download audio`,
                autoDownload,
                flag
            );

            await window.Store.Settings.setAutoDownloadAudio(flag);
            return flag;
        }, flag);
    }

    /**
     * Setting autoload download documents
     * @param {boolean} flag true/false
     */
    async setAutoDownloadDocuments(flag) {
        await this.pupPage.evaluate(async (flag) => {
            const autoDownload =
                window.Store.Settings.getAutoDownloadDocuments();
            if (autoDownload === flag) {
                return flag;
            }

            console.error(
                `[${
                    window.wwebjs_client_id || "default"
                }] Updating auto download documents`,
                autoDownload,
                flag
            );

            await window.Store.Settings.setAutoDownloadDocuments(flag);
            return flag;
        }, flag);
    }

    /**
     * Setting autoload download photos
     * @param {boolean} flag true/false
     */
    async setAutoDownloadPhotos(flag) {
        await this.pupPage.evaluate(async (flag) => {
            const autoDownload = window.Store.Settings.getAutoDownloadPhotos();
            if (autoDownload === flag) {
                return flag;
            }

            console.error(
                `[${
                    window.wwebjs_client_id || "default"
                }] Updating auto download photos`,
                autoDownload,
                flag
            );

            await window.Store.Settings.setAutoDownloadPhotos(flag);
            return flag;
        }, flag);
    }

    /**
     * Setting autoload download videos
     * @param {boolean} flag true/false
     */
    async setAutoDownloadVideos(flag) {
        await this.pupPage.evaluate(async (flag) => {
            const autoDownload = window.Store.Settings.getAutoDownloadVideos();
            if (autoDownload === flag) {
                return flag;
            }

            console.error(
                `[${
                    window.wwebjs_client_id || "default"
                }] Updating auto download videos`,
                autoDownload,
                flag
            );

            await window.Store.Settings.setAutoDownloadVideos(flag);
            return flag;
        }, flag);
    }

    /**
     * Get user device count by ID
     * Each WaWeb Connection counts as one device, and the phone (if exists) counts as one
     * So for a non-enterprise user with one WaWeb connection it should return "2"
     * @param {string} userId
     * @returns {Promise<number>}
     */
    async getContactDeviceCount(userId) {
        return await this.pupPage.evaluate(async (userId) => {
            const devices = await window.Store.DeviceList.getDeviceIds([
                window.Store.WidFactory.createWid(userId),
            ]);
            if (
                devices &&
                devices.length &&
                devices[0] != null &&
                typeof devices[0].devices == "object"
            ) {
                return devices[0].devices.length;
            }
            return 0;
        }, userId);
    }

    /**
     * Sync chat history conversation
     * @param {string} chatId
     * @return {Promise<boolean>} True if operation completed successfully, false otherwise.
     */
    async syncHistory(chatId) {
        return await this.pupPage.evaluate(async (chatId) => {
            const chat = await window.WWebJS.getChat(chatId);
            if (chat.endOfHistoryTransferType === 0) {
                await window.Store.HistorySync.sendPeerDataOperationRequest(3, {
                    chatId: chat.id,
                });
                return true;
            }
            return false;
        }, chatId);
    }

    /**
     * Reinitializes the crypto store
     * @returns {Promise<void>}
     */
    async reinitializeCryptoStore() {
        if (!this.pupPage || this.pupPage.isClosed()) return;

        await this.pupPage.waitForFunction("!!window.Store", {
            timeout: 180_000,
        });

        await this.pupPage?.evaluate(async (CIPHERTEXT_TYPE_VALUE) => {
            try {
                if (window.Store?.CryptoLib) {
                    // Reinitialize the crypto state
                    window.Store.CryptoLib.initializeWebCrypto();
                }

                // Patch message handler to decrypt immediately
                const originalAddHandler = window.Store.Msg.on;
                window.Store.Msg.on = function (event, handler) {
                    if (event === "add") {
                        return originalAddHandler.call(
                            this,
                            event,
                            async (msg) => {
                                if (msg.isNewMsg) {
                                    if (msg.type === CIPHERTEXT_TYPE_VALUE) {
                                        try {
                                            await window.Store.CryptoLib?.decryptE2EMessage(
                                                msg
                                            );
                                            msg.once("change:type", (_msg) =>
                                                window.onAddMessageEvent(
                                                    window.WWebJS.getMessageModel(
                                                        _msg
                                                    )
                                                )
                                            );
                                            window.onAddMessageCiphertextEvent(
                                                window.WWebJS.getMessageModel(
                                                    msg
                                                )
                                            );
                                        } catch (err) {
                                            console.error(
                                                `[${
                                                    window.wwebjs_client_id ||
                                                    "default"
                                                }] Failed to decrypt message during reinitializeCryptoStore:`,
                                                err.message,
                                                err.stack
                                            );
                                        }
                                    } else {
                                        handler(msg);
                                    }
                                }
                            }
                        );
                    }
                    return originalAddHandler.call(this, event, handler);
                };
                console.log(
                    `[${
                        window.wwebjs_client_id || "default"
                    }] Msg store patched successfully in reinitializeCryptoStore.`
                );
            } catch (err) {
                console.error(
                    `[${
                        window.wwebjs_client_id || "default"
                    }] Error during reinitializeCryptoStore: ${err.message}`,
                    err.stack
                );
            }
        }, MessageTypes.CIPHERTEXT);
    }
}

module.exports = { Client, SendMessageError };
