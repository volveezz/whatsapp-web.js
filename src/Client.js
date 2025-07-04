'use strict';

const EventEmitter = require('events');
const puppeteer = require('puppeteer');
const moduleRaid = require('@pedroslopez/moduleraid/moduleraid');

const Util = require('./util/Util');
const InterfaceController = require('./util/InterfaceController');
const { WhatsWebURL, DefaultOptions, Events, WAState } = require('./util/Constants');
const { ExposeAuthStore } = require('./util/Injected/AuthStore/AuthStore');
const { ExposeStore } = require('./util/Injected/Store');
const { ExposeLegacyAuthStore } = require('./util/Injected/AuthStore/LegacyAuthStore');
const { ExposeLegacyStore } = require('./util/Injected/LegacyStore');
const { LoadUtils } = require('./util/Injected/Utils');
const ChatFactory = require('./factories/ChatFactory');
const ContactFactory = require('./factories/ContactFactory');
const WebCacheFactory = require('./webCache/WebCacheFactory');
const {
    Broadcast,
    Buttons,
    Call,
    ClientInfo,
    Contact,
    GroupNotification,
    Label,
    List,
    Location,
    Message,
    MessageMedia,
    Poll,
    PollVote,
    Reaction,
} = require('./structures');
const NoAuth = require('./authStrategies/NoAuth');
const { exposeFunctionIfAbsent } = require('./util/Puppeteer');
const treeKill = require('tree-kill');
const { debounce } = require('./util/debounce');

/**
 * SendMessageError represents an error that occurred during message sending
 */
class SendMessageError extends Error {
    constructor({ name, message, stack, code, media, chatId, clientId }) {
        super(`[${clientId || 'default'}] [${name}] ${message}`);
        this.name = 'SendMessageError';
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
        this.clientId = this.options.clientId || 'default';

        if (!this.options.authStrategy) {
            this.authStrategy = new NoAuth();
        } else {
            this.authStrategy = this.options.authStrategy;
        }

        this.authStrategy.setup(this);

        this.debouncedInject = debounce(this.inject.bind(this), 500);

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
        if (!this.pupPage || this.pupPage.isClosed() || this.lastLoggedOut) {
            console.log(`[${this.clientId}] [DEBUG] Skipping inject - page closed or logged out`);
            return;
        }

        let hasReloaded = false;
        const client = this;
        let lastPercent = null; // Move this to the top for broader scope

        const reloadHandler = async () => {
            hasReloaded = true;
        };

        // Clean up any previously exposed functions to prevent conflicts
        try {
            const existingFunctions = [
                'onQRChangedEvent',
                'onOfflineProgressUpdateEvent',
                'onAuthAppStateChangedEvent',
                'onAppStateHasSyncedEvent',
                'onLogoutEvent',
            ];
            for (const funcName of existingFunctions) {
                await this.pupPage.removeExposedFunction(funcName).catch(() => {});
            }
        } catch (err) {
            // Ignore cleanup errors
        }

        try {
            this.pupPage.on('framenavigated', reloadHandler);

            await this.pupPage.waitForFunction('window.Debug?.VERSION != undefined', { timeout: this.options.authTimeoutMs });

            const version = await this.getWWebVersion();
            const isCometOrAbove = parseInt(version.split('.')?.[1]) >= 3000;

            if (isCometOrAbove) {
                await this.pupPage.evaluate(ExposeAuthStore);
            } else {
                await this.pupPage.evaluate(ExposeLegacyAuthStore, moduleRaid.toString());
            }

            const needAuthentication = await this.pupPage.evaluate(async () => {
                let state = window.AuthStore.AppState.state;

                if (state === 'OPENING' || state === 'UNLAUNCHED' || state === 'PAIRING') {
                    // wait till state changes
                    await new Promise((r) => {
                        window.AuthStore.AppState.on('change:state', function waitTillInit(_AppState, state) {
                            if (state !== 'OPENING' && state !== 'UNLAUNCHED' && state !== 'PAIRING') {
                                window.AuthStore.AppState.off('change:state', waitTillInit);
                                r();
                            }
                        });
                    });
                }
                state = window.AuthStore.AppState.state;
                return state == 'UNPAIRED' || state == 'UNPAIRED_IDLE';
            });

            if (needAuthentication) {
                const { failed, failureEventPayload, restart } = await this.authStrategy.onAuthenticationNeeded();

                if (failed) {
                    /**
                     * Emitted when there has been an error while trying to restore an existing session
                     * @event Client#auth_failure
                     * @param {string} message
                     */
                    this.emit(Events.AUTHENTICATION_FAILURE, failureEventPayload);
                    await this.destroy();
                    if (restart) {
                        // session restore failed so try again but without session to force new authentication
                        return this.initialize();
                    }
                    return;
                }

                // Register qr events
                let qrRetries = 0;
                await exposeFunctionIfAbsent(this.pupPage, 'onQRChangedEvent', async (qr) => {
                    /**
                     * Emitted when a QR code is received
                     * @event Client#qr
                     * @param {string} qr QR Code
                     */
                    client.emit(Events.QR_RECEIVED, qr);
                    if (client.options.qrMaxRetries > 0) {
                        qrRetries++;
                        if (qrRetries > client.options.qrMaxRetries) {
                            client.emit(Events.DISCONNECTED, 'Max qrcode retries reached');
                            await client.destroy();
                        }
                    }
                });

                await this.pupPage.evaluate(async () => {
                    const registrationInfo = await window.AuthStore.RegistrationUtils.waSignalStore.getRegistrationInfo();
                    const noiseKeyPair = await window.AuthStore.RegistrationUtils.waNoiseInfo.get();
                    const staticKeyB64 = window.AuthStore.Base64Tools.encodeB64(noiseKeyPair.staticKeyPair.pubKey);
                    const identityKeyB64 = window.AuthStore.Base64Tools.encodeB64(registrationInfo.identityKeyPair.pubKey);
                    const advSecretKey = await window.AuthStore.RegistrationUtils.getADVSecretKey();
                    const platform = window.AuthStore.RegistrationUtils.DEVICE_PLATFORM;
                    const getQR = (ref) => ref + ',' + staticKeyB64 + ',' + identityKeyB64 + ',' + advSecretKey + ',' + platform;

                    window.onQRChangedEvent(getQR(window.AuthStore.Conn.ref)); // initial qr
                    window.AuthStore.Conn.on('change:ref', (_, ref) => {
                        window.onQRChangedEvent(getQR(ref));
                    }); // future QR changes
                });
            }

            await exposeFunctionIfAbsent(this.pupPage, 'onOfflineProgressUpdateEvent', (percent) => {
                if (lastPercent !== percent) {
                    lastPercent = percent;
                    client.emit(Events.LOADING_SCREEN, percent);
                }
            });

            // Expose onAuthAppStateChangedEvent before it's used
            await exposeFunctionIfAbsent(this.pupPage, 'onAuthAppStateChangedEvent', async (state) => {
                client.emit(Events.STATE_CHANGED, state);
                if (state === 'UNPAIRED_IDLE') {
                    // refresh QR code
                    await client.pupPage.evaluate(() => {
                        if (window.Store && window.Store.Cmd && typeof window.Store.Cmd.refreshQR === 'function') {
                            window.Store.Cmd.refreshQR();
                        }
                    });
                }
            });

            // Expose onAppStateHasSyncedEvent before it's used
            await exposeFunctionIfAbsent(this.pupPage, 'onAppStateHasSyncedEvent', async () => {
                // Reset logout flag when authentication syncs successfully
                client.lastLoggedOut = false;

                client.emit(Events.AUTHENTICATED, await client.authStrategy.getAuthEventPayload());

                const injected = await client.pupPage.evaluate(async () => {
                    return typeof window.Store !== 'undefined' && typeof window.WWebJS !== 'undefined';
                });

                if (!injected) {
                    if (client.options.webVersionCache.type === 'local' && client.currentIndexHtml) {
                        const { type: webCacheType, ...webCacheOptions } = client.options.webVersionCache;
                        const webCache = WebCacheFactory.createWebCache(webCacheType, webCacheOptions);
                        const version = await client.getWWebVersion();
                        await webCache.persist(client.currentIndexHtml, version);
                    }

                    const version = await client.getWWebVersion();
                    const isCometOrAbove = parseInt(version.split('.')?.[1]) >= 3000;

                    if (isCometOrAbove) {
                        await client.pupPage.evaluate(ExposeStore);
                    } else {
                        // make sure all modules are ready before injection
                        // 2 second delay after authentication makes sense and does not need to be made dyanmic or removed
                        await new Promise((r) => setTimeout(r, 2000));
                        await client.pupPage.evaluate(ExposeLegacyStore);
                    }

                    // Check window.Store Injection
                    await client.pupPage.waitForFunction('window.Store != undefined');

                    /**
                     * Current connection information
                     * @type {ClientInfo}
                     */
                    client.info = new ClientInfo(
                        client,
                        await client.pupPage.evaluate(() => {
                            return {
                                ...window.Store.Conn.serialize(),
                                wid: window.Store.User.getMeUser(),
                            };
                        })
                    );

                    client.interface = new InterfaceController(client);

                    //Load util functions (serializers, helper functions)
                    await client.pupPage.evaluate(LoadUtils);

                    await client.attachEventListeners();
                }

                if (lastPercent !== 100) {
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                }

                // Don't emit ready if we've been logged out
                if (client.lastLoggedOut) {
                    console.log(`[${client.clientId}] [DEBUG] Skipping ready emission in onAppStateHasSyncedEvent - client logged out`);
                    return;
                }

                /**
                 * Emitted when the client has initialized and is ready to receive messages.
                 * @event Client#ready
                 */
                client.emit(Events.READY);
                client.authStrategy.afterAuthReady();
            });

            await exposeFunctionIfAbsent(this.pupPage, 'onLogoutEvent', async () => {
                client.lastLoggedOut = true;
                await client.pupPage.waitForNavigation({ waitUntil: 'load', timeout: 5000 }).catch((_) => _);
            });
            await this.pupPage.evaluate(() => {
                window.AuthStore.AppState.on('change:state', (_AppState, state) => {
                    if (typeof window.onAuthAppStateChangedEvent === 'function') {
                        try {
                            window.onAuthAppStateChangedEvent(state);
                        } catch (error) {
                            console.warn('Error calling onAuthAppStateChangedEvent:', error);
                        }
                    }
                });
                window.AuthStore.AppState.on('change:hasSynced', () => {
                    if (typeof window.onAppStateHasSyncedEvent === 'function') {
                        try {
                            window.onAppStateHasSyncedEvent();
                        } catch (error) {
                            console.warn('Error calling onAppStateHasSyncedEvent:', error);
                        }
                    }
                });
                window.AuthStore.Cmd.on('offline_progress_update', () => {
                    if (typeof window.onOfflineProgressUpdateEvent === 'function') {
                        try {
                            window.onOfflineProgressUpdateEvent(window.AuthStore.OfflineMessageHandler.getOfflineDeliveryProgress());
                        } catch (error) {
                            console.warn('Error calling onOfflineProgressUpdateEvent:', error);
                        }
                    }
                });

                window.AuthStore.Cmd.on('logout', async () => {
                    if (typeof window.onLogoutEvent === 'function') {
                        try {
                            await window.onLogoutEvent();
                        } catch (error) {
                            console.warn('Error calling onLogoutEvent:', error);
                        }
                    }
                });
            });
        } catch (err) {
            if (!hasReloaded) throw err;
        } finally {
            this.pupPage.off('framenavigated', reloadHandler);
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
        // Reset logout flag at the start of initialization
        this.lastLoggedOut = false;

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
                args: [
                    '--disable-features=VizDisplayCompositor,BluetoothAdapter',
                    '--disable-permissions-policy=bluetooth',
                    ...(puppeteerOpts.args || []),
                ],
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
            isAlreadyInitialized = await page.evaluate(() => typeof window.Store !== 'undefined' && typeof window.WWebJS !== 'undefined');
        }

        if (!isAlreadyInitialized) {
            await page.goto(WhatsWebURL, {
                waitUntil: 'load',
                timeout: 0,
                referer: 'https://whatsapp.com/',
            });
            await this.debouncedInject();
        } else {
            // Don't emit ready if we've been logged out
            if (this.lastLoggedOut) {
                console.log(`[${this.clientId}] [DEBUG] Skipping ready emission - client logged out`);
                return;
            }

            const isAuthenticated = await page.evaluate(() => {
                return !!(window.Store && window.Store.User && window.Store.Conn && typeof window.Store.User.getMeUser === 'function');
            });

            if (!isAuthenticated) {
                console.log(`[${this.clientId}] [DEBUG] Store not ready or not authenticated, skipping ready emission`);
                return;
            }

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
                console.warn(`[${this.clientId}] [WWebJS] Failed to auto-disable auto-download flags:`, err?.message || err);
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
            await this.cdpSession.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: this.options.downloadPath,
            });
        }

        this.pupPage.on('framenavigated', async (frame) => {
            if (frame.url().includes('post_logout=1') || this.lastLoggedOut) {
                this.emit(Events.DISCONNECTED, 'LOGOUT');
                await this.authStrategy.logout();
                await this.authStrategy.beforeBrowserInitialized();
                await this.authStrategy.afterBrowserInitialized();
                await this.destroy();
                this.lastLoggedOut = false;
                return;
            }

            // Skip any operations if we've been logged out
            if (this.lastLoggedOut) {
                console.log(`[${this.clientId}] [DEBUG] Skipping framenavigated - client logged out`);
                return;
            }

            const alreadyInjected = await this.pupPage
                .evaluate(() => {
                    return typeof window.WWebJS !== 'undefined' && typeof window.Store !== 'undefined';
                })
                .catch(() => false);

            if (!this.pupPage || this.pupPage.isClosed()) {
                console.error(`[${this.clientId}] [DEBUG] Page is closed or undefined. Skipping.`);
                return;
            }

            if (!alreadyInjected && frame.url().startsWith(WhatsWebURL)) {
                console.log(`[${this.clientId}] [DEBUG] Page loaded/navigated, attempting injection...`);
                this._storeInjected = false;
                this._listenersAttached = false;
                await this.debouncedInject();
            } else if (alreadyInjected) {
                console.log(`[${this.clientId}] [DEBUG] Page loaded/navigated, WWebJS already injected, skipping inject().`);
            } else {
                console.log(
                    `[${this.clientId}] [DEBUG] Page navigated, but not injecting. URL: ${frame.url()}, Injected: ${alreadyInjected}`
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
                window.AuthStore.PairingCodeLinkUtils.setPairingType('ALT_DEVICE_LINKING');
                await window.AuthStore.PairingCodeLinkUtils.initializeAltDeviceLinking();
                return window.AuthStore.PairingCodeLinkUtils.startAltLinkingFlow(phoneNumber, showNotification);
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

        const client = this;

        await this.pupPage.waitForFunction('!!window.Store && !!window.Store.Msg', {
            timeout: 0,
        });

        await this.pupPage.evaluate(() => {
            const stores = ['Msg', 'Chat', 'Call', 'AppState', 'PollVote'];

            // --- Store references to listeners to be removed ---
            window.__wwebjs_listeners = window.__wwebjs_listeners || {};

            for (const storeName of stores) {
                const emitter = window.Store[storeName];
                if (!emitter || typeof emitter.off !== 'function') continue;

                // Remove listeners stored from previous runs
                if (window.__wwebjs_listeners[storeName]) {
                    for (const [evt, handler] of Object.entries(window.__wwebjs_listeners[storeName])) {
                        try {
                            emitter.off(evt, handler);
                        } catch (e) {
                            console.warn(
                                `[${window.wwebjs_client_id || 'default'}] WWebJS: Failed to remove listener for ${storeName}.${evt}`,
                                e
                            );
                        }
                    }
                }
                window.__wwebjs_listeners[storeName] = {}; // Reset for this run
            }

            // Clear potentially old exposed functions
            Object.keys(window)
                .filter((k) => k.startsWith('on') && k.endsWith('Event'))
                .forEach((k) => {
                    if (window.hasOwnProperty(k)) {
                        try {
                            window[k] = null;
                            delete window[k];
                            if (window.hasOwnProperty(k)) {
                                console.error(
                                    `[${window.wwebjs_client_id || 'default'}] WWebJS Cleanup: ${k} STILL EXISTS after delete attempt`
                                );
                            }
                        } catch (e) {
                            console.error(`[${window.wwebjs_client_id || 'default'}] WWebJS Cleanup: FAILED to clear ${k}:`, e.message);
                        }
                    }
                });
        });

        const mark = (fn) => {
            fn.__wwebjsPatched = true;
            return fn;
        };

        // Add throttling for high-frequency events
        const eventThrottler = {
            lastEmit: {},
            errorCount: {},
            cleanup: () => {
                // Reset throttling data every 5 minutes to prevent memory leaks
                const now = Date.now();
                const fiveMinutesAgo = now - 300000;

                for (const key in eventThrottler.lastEmit) {
                    if (eventThrottler.lastEmit[key] < fiveMinutesAgo) {
                        delete eventThrottler.lastEmit[key];
                    }
                }

                // Reset error counts every hour
                for (const eventType in eventThrottler.errorCount) {
                    if (eventThrottler.errorCount[eventType] > 0) {
                        eventThrottler.errorCount[eventType] = Math.max(0, eventThrottler.errorCount[eventType] - 10);
                    }
                }
            },
            throttle: (eventType, fn, delay = 50) => {
                return (...args) => {
                    try {
                        const now = Date.now();
                        const key = `${eventType}_${args[0]?.id?._serialized || args[0]?.id || 'default'}`;

                        // Circuit breaker: if too many errors, skip this event type
                        if (eventThrottler.errorCount[eventType] > 50) {
                            if (now % 10000 < 100) {
                                // Log every ~10 seconds
                                console.warn(`[${client.clientId}] Event ${eventType} disabled due to excessive errors`);
                            }
                            return;
                        }

                        if (!eventThrottler.lastEmit[key] || now - eventThrottler.lastEmit[key] > delay) {
                            eventThrottler.lastEmit[key] = now;
                            return fn(...args);
                        }
                    } catch (error) {
                        eventThrottler.errorCount[eventType] = (eventThrottler.errorCount[eventType] || 0) + 1;
                        console.error(`[${client.clientId}] Error in event ${eventType}:`, error);
                    }
                };
            },
        };

        // Setup periodic cleanup
        setInterval(eventThrottler.cleanup, 300000); // Every 5 minutes

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onAddMessageEvent',
            mark(
                eventThrottler.throttle(
                    'message_add',
                    (msg) => {
                        if (msg.type === 'gp2') {
                            const notification = new GroupNotification(client, msg);
                            if (['add', 'invite', 'linked_group_join'].includes(msg.subtype)) {
                                /**
                                 * Emitted when a user joins the chat via invite link or is added by an admin.
                                 * @event Client#group_join
                                 * @param {GroupNotification} notification GroupNotification with more information about the action
                                 */
                                client.emit(Events.GROUP_JOIN, notification);
                            } else if (msg.subtype === 'remove' || msg.subtype === 'leave') {
                                /**
                                 * Emitted when a user leaves the chat or is removed by an admin.
                                 * @event Client#group_leave
                                 * @param {GroupNotification} notification GroupNotification with more information about the action
                                 */
                                client.emit(Events.GROUP_LEAVE, notification);
                            } else if (msg.subtype === 'promote' || msg.subtype === 'demote') {
                                /**
                                 * Emitted when a current user is promoted to an admin or demoted to a regular user.
                                 * @event Client#group_admin_changed
                                 * @param {GroupNotification} notification GroupNotification with more information about the action
                                 */
                                client.emit(Events.GROUP_ADMIN_CHANGED, notification);
                            } else if (msg.subtype === 'membership_approval_request') {
                                /**
                                 * Emitted when some user requested to join the group
                                 * that has the membership approval mode turned on
                                 * @event Client#group_membership_request
                                 * @param {GroupNotification} notification GroupNotification with more information about the action
                                 * @param {string} notification.chatId The group ID the request was made for
                                 * @param {string} notification.author The user ID that made a request
                                 * @param {number} notification.timestamp The timestamp the request was made at
                                 */
                                client.emit(Events.GROUP_MEMBERSHIP_REQUEST, notification);
                            } else {
                                /**
                                 * Emitted when group settings are updated, such as subject, description or picture.
                                 * @event Client#group_update
                                 * @param {GroupNotification} notification GroupNotification with more information about the action
                                 */
                                client.emit(Events.GROUP_UPDATE, notification);
                            }
                            return;
                        }

                        const message = new Message(client, msg);

                        /**
                         * Emitted when a new message is created, which may include the current user's own messages.
                         * @event Client#message_create
                         * @param {Message} message The message that was created
                         */
                        client.emit(Events.MESSAGE_CREATE, message);

                        if (msg.id.fromMe) return;

                        /**
                         * Emitted when a new message is received.
                         * @event Client#message
                         * @param {Message} message The message that was received
                         */
                        client.emit(Events.MESSAGE_RECEIVED, message);
                    },
                    25
                )
            )
        );

        let last_message;

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onChangeMessageTypeEvent',
            mark((msg) => {
                if (msg.type === 'revoked') {
                    const message = new Message(client, msg);
                    let revoked_msg;
                    if (last_message && msg.id.id === last_message.id.id) {
                        revoked_msg = new Message(client, last_message);
                    }

                    /**
                     * Emitted when a message is deleted for everyone in the chat.
                     * @event Client#message_revoke_everyone
                     * @param {Message} message The message that was revoked, in its current state. It will not contain the original message's data.
                     * @param {?Message} revoked_msg The message that was revoked, before it was revoked. It will contain the message's original data.
                     * Note that due to the way this data is captured, it may be possible that this param will be undefined.
                     */
                    client.emit(Events.MESSAGE_REVOKED_EVERYONE, message, revoked_msg);
                }
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onChangeMessageEvent',
            mark((msg) => {
                if (msg.type !== 'revoked') {
                    last_message = msg;
                }

                /**
                 * The event notification that is received when one of
                 * the group participants changes their phone number.
                 */
                const isParticipant = msg.type === 'gp2' && msg.subtype === 'modify';

                /**
                 * The event notification that is received when one of
                 * the contacts changes their phone number.
                 */
                const isContact = msg.type === 'notification_template' && msg.subtype === 'change_number';

                if (isParticipant || isContact) {
                    /** @type {GroupNotification} object does not provide enough information about this event, so a @type {Message} object is used. */
                    const message = new Message(client, msg);

                    const newId = isParticipant ? msg.recipients[0] : msg.to;
                    const oldId = isParticipant ? msg.author : msg.templateParams.find((id) => id !== newId);

                    /**
                     * Emitted when a contact or a group participant changes their phone number.
                     * @event Client#contact_changed
                     * @param {Message} message Message with more information about the event.
                     * @param {String} oldId The user's id (an old one) who changed their phone number
                     * and who triggered the notification.
                     * @param {String} newId The user's new id after the change.
                     * @param {Boolean} isContact Indicates if a contact or a group participant changed their phone number.
                     */
                    client.emit(Events.CONTACT_CHANGED, message, oldId, newId, isContact);
                }
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onRemoveMessageEvent',
            mark((msg) => {
                if (!msg.isNewMsg) return;

                const message = new Message(client, msg);

                /**
                 * Emitted when a message is deleted by the current user.
                 * @event Client#message_revoke_me
                 * @param {Message} message The message that was revoked
                 */
                client.emit(Events.MESSAGE_REVOKED_ME, message);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onMessageAckEvent',
            mark((msg, ack) => {
                const message = new Message(client, msg);

                /**
                 * Emitted when an ack event occurrs on message type.
                 * @event Client#message_ack
                 * @param {Message} message The message that was affected
                 * @param {MessageAck} ack The new ACK value
                 */
                client.emit(Events.MESSAGE_ACK, message, ack);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onChatUnreadCountEvent',
            mark(async (data) => {
                const chat = await client.getChatById(data.id);

                /**
                 * Emitted when the chat unread count changes
                 */
                client.emit(Events.UNREAD_COUNT, chat);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onMessageMediaUploadedEvent',
            mark((msg) => {
                const message = new Message(client, msg);

                /**
                 * Emitted when media has been uploaded for a message sent by the client.
                 * @event Client#media_uploaded
                 * @param {Message} message The message with media that was uploaded
                 */
                client.emit(Events.MEDIA_UPLOADED, message);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onAppStateChangedEvent',
            mark(async (state) => {
                /**
                 * Emitted when the connection state changes
                 * @event Client#change_state
                 * @param {WAState} state the new connection state
                 */
                client.emit(Events.STATE_CHANGED, state);

                const ACCEPTED_STATES = [WAState.CONNECTED, WAState.OPENING, WAState.PAIRING, WAState.TIMEOUT];

                if (client.options.takeoverOnConflict) {
                    ACCEPTED_STATES.push(WAState.CONFLICT);

                    if (state === WAState.CONFLICT) {
                        setTimeout(() => {
                            client.pupPage.evaluate(() => window.Store.AppState.takeover());
                        }, client.options.takeoverTimeoutMs);
                    }
                }

                if (!ACCEPTED_STATES.includes(state)) {
                    /**
                     * Emitted when the client has been disconnected
                     * @event Client#disconnected
                     * @param {WAState|"LOGOUT"} reason reason that caused the disconnect
                     */
                    await client.authStrategy.disconnect();
                    client.emit(Events.DISCONNECTED, state);
                    client.destroy();
                }
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onBatteryStateChangedEvent',
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
                client.emit(Events.BATTERY_CHANGED, { battery, plugged });
            })
        );

        await exposeFunctionIfAbsent(this.pupPage, 'onIncomingCall', (call) => {
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
            const cll = new Call(client, call);
            client.emit(Events.INCOMING_CALL, cll);
        });

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onReaction',
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

                    client.emit(Events.MESSAGE_REACTION, new Reaction(client, reaction));
                }
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onRemoveChatEvent',
            mark(async (chat) => {
                const _chat = await client.getChatById(chat.id);

                /**
                 * Emitted when a chat is removed
                 * @event Client#chat_removed
                 * @param {Chat} chat
                 */
                client.emit(Events.CHAT_REMOVED, _chat);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onArchiveChatEvent',
            mark(async (chat, currState, prevState) => {
                const _chat = await client.getChatById(chat.id);

                /**
                 * Emitted when a chat is archived/unarchived
                 * @event Client#chat_archived
                 * @param {Chat} chat
                 * @param {boolean} currState
                 * @param {boolean} prevState
                 */
                client.emit(Events.CHAT_ARCHIVED, _chat, currState, prevState);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onEditMessageEvent',
            mark((msg, newBody, prevBody) => {
                if (msg.type === 'revoked') {
                    return;
                }
                /**
                 * Emitted when messages are edited
                 * @event Client#message_edit
                 * @param {Message} message
                 * @param {string} newBody
                 * @param {string} prevBody
                 */
                client.emit(Events.MESSAGE_EDIT, new Message(client, msg), newBody, prevBody);
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onAddMessageCiphertextEvent',
            mark((msg) => {
                /**
                 * Emitted when messages are edited
                 * @event Client#message_ciphertext
                 * @param {Message} message
                 */
                client.emit(Events.MESSAGE_CIPHERTEXT, new Message(client, msg));
            })
        );

        await exposeFunctionIfAbsent(
            this.pupPage,
            'onPollVoteEvent',
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
                window.__wwebjs_listeners[storeName] = window.__wwebjs_listeners[storeName] || {};
                window.__wwebjs_listeners[storeName][eventName] = handler; // Store reference
                window.Store[storeName].on(eventName, handler);
            };

            attachListener('Msg', 'change', (msg) => {
                window.onChangeMessageEvent(window.WWebJS.getMessageModel(msg));
            });
            attachListener('Msg', 'change:type', (msg) => {
                window.onChangeMessageTypeEvent(window.WWebJS.getMessageModel(msg));
            });
            attachListener('Msg', 'change:ack', (msg, ack) => {
                window.onMessageAckEvent(window.WWebJS.getMessageModel(msg), ack);
            });
            attachListener('Msg', 'change:isUnsentMedia', (msg, unsent) => {
                if (msg.id.fromMe && !unsent) window.onMessageMediaUploadedEvent(window.WWebJS.getMessageModel(msg));
            });
            attachListener('Msg', 'remove', (msg) => {
                if (msg.isNewMsg) window.onRemoveMessageEvent(window.WWebJS.getMessageModel(msg));
            });
            attachListener('Msg', 'change:body change:caption', (msg, newBody, prevBody) => {
                window.onEditMessageEvent(window.WWebJS.getMessageModel(msg), newBody, prevBody);
            });
            attachListener('AppState', 'change:state', (_AppState, state) => {
                window.onAppStateChangedEvent(state);
            });
            attachListener('Call', 'add', (call) => {
                window.onIncomingCall(call);
            });
            attachListener('Chat', 'remove', async (chat) => {
                window.onRemoveChatEvent(await window.WWebJS.getChatModel(chat));
            });
            attachListener('Chat', 'change:archive', async (chat, currState, prevState) => {
                window.onArchiveChatEvent(await window.WWebJS.getChatModel(chat), currState, prevState);
            });
            attachListener('Msg', 'add', (msg) => {
                if (msg.isNewMsg) {
                    if (msg.type === 'ciphertext') {
                        // defer message event until ciphertext is resolved (type changed)
                        msg.once('change:type', (_msg) => window.onAddMessageEvent(window.WWebJS.getMessageModel(_msg)));
                        window.onAddMessageCiphertextEvent(window.WWebJS.getMessageModel(msg));
                    } else {
                        window.onAddMessageEvent(window.WWebJS.getMessageModel(msg));
                    }
                }
            });
            attachListener('Chat', 'change:unreadCount', (chat) => {
                window.onChatUnreadCountEvent(chat);
            });
            attachListener('PollVote', 'add', async (vote) => {
                const pollVoteModel = await window.WWebJS.getPollVoteModel(vote);
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
        const { type: webCacheType, ...webCacheOptions } = this.options.webVersionCache;
        const webCache = WebCacheFactory.createWebCache(webCacheType, webCacheOptions);

        const requestedVersion = this.options.webVersion;
        const versionContent = await webCache.resolve(requestedVersion);

        if (versionContent) {
            await this.pupPage.setRequestInterception(true);
            this.pupPage.on('request', async (req) => {
                if (req.url() === WhatsWebURL) {
                    req.respond({
                        status: 200,
                        contentType: 'text/html',
                        body: versionContent,
                    });
                } else {
                    req.continue();
                }
            });
        } else {
            this.pupPage.on('response', async (res) => {
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
        this.lastLoggedOut = true;

        await this.pupPage
            ?.evaluate(() => {
                if (window.Store?.AppState && typeof window.Store.AppState.logout === 'function') {
                    return window.Store.AppState.logout();
                }
            })
            .catch((e) => console.error(`[${this.clientId}] Received an error when tried to logout from the session`, e));
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
        return await this.pupPage.evaluate(async (chatId) => {
            return window.WWebJS.sendSeen(chatId);
        }, chatId);
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
        const isChannel = /@\w*newsletter\b/.test(chatId);

        if (
            isChannel &&
            [
                options.sendMediaAsDocument,
                options.quotedMessageId,
                options.parseVCards,
                options.isViewOnce,
                content instanceof Location,
                content instanceof Contact,
                content instanceof Buttons,
                content instanceof List,
                Array.isArray(content) && content.length > 0 && content[0] instanceof Contact,
            ].includes(true)
        ) {
            console.warn(
                'The message type is currently not supported for sending in channels,\nthe supported message types are: text, image, sticker, gif, video, voice and poll.'
            );
            return null;
        }

        if (options.mentions) {
            !Array.isArray(options.mentions) && (options.mentions = [options.mentions]);
            if (options.mentions.some((possiblyContact) => possiblyContact instanceof Contact)) {
                console.warn(
                    'Mentions with an array of Contact are now deprecated. See more at https://github.com/pedroslopez/whatsapp-web.js/pull/2166.'
                );
                options.mentions = options.mentions.map((a) => a.id._serialized);
            }
        }

        options.groupMentions && !Array.isArray(options.groupMentions) && (options.groupMentions = [options.groupMentions]);

        let internalOptions = {
            linkPreview: options.linkPreview === false ? undefined : true,
            sendAudioAsVoice: options.sendAudioAsVoice,
            sendVideoAsGif: options.sendVideoAsGif,
            sendMediaAsSticker: options.sendMediaAsSticker,
            sendMediaAsDocument: options.sendMediaAsDocument,
            sendMediaAsHd: options.sendMediaAsHd,
            caption: options.caption,
            quotedMessageId: options.quotedMessageId,
            parseVCards: options.parseVCards !== false,
            mentionedJidList: options.mentions || [],
            groupMentions: options.groupMentions,
            invokedBotWid: options.invokedBotWid,
            ignoreQuoteErrors: options.ignoreQuoteErrors !== false,
            extraOptions: options.extra,
        };

        const sendSeen = options.sendSeen !== false;

        if (content instanceof MessageMedia) {
            internalOptions.media = content;
            ((internalOptions.isViewOnce = options.isViewOnce), (content = ''));
        } else if (options.media instanceof MessageMedia) {
            internalOptions.media = options.media;
            internalOptions.caption = content;
            ((internalOptions.isViewOnce = options.isViewOnce), (content = ''));
        } else if (content instanceof Location) {
            internalOptions.location = content;
            content = '';
        } else if (content instanceof Poll) {
            internalOptions.poll = content;
            content = '';
        } else if (content instanceof Contact) {
            internalOptions.contactCard = content.id._serialized;
            content = '';
        } else if (Array.isArray(content) && content[0] instanceof Contact) {
            internalOptions.contactCardList = content.map((c) => c.id._serialized);
            content = '';
        } else if (content instanceof Buttons) {
            if (content.type !== 'chat') internalOptions.attachment = content.body;
            internalOptions.buttons = content;
            content = '';
        } else if (content instanceof List) {
            internalOptions.list = content;
            content = '';
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
        const sendSeen = options.sendSeen === undefined ? true : options.sendSeen;

        /* ---------- hand off to in-page helper ---------- */
        const { message: newMessage, error } = await this.pupPage.evaluate(
            async (chatId, body, opts, seen) => {
                const chatWid = window.Store.WidFactory.createWid(chatId);
                const chat = window.Store.Chat.get(chatWid) || (await window.Store.Chat.find(chatWid));
                if (!chat) throw new Error('Chat not found');

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

        return sentMsg ? new Message(this, sentMsg) : undefined;
    }

    /**
     * @typedef {Object} SendChannelAdminInviteOptions
     * @property {?string} comment The comment to be added to an invitation
     */

    /**
     * Sends a channel admin invitation to a user, allowing them to become an admin of the channel
     * @param {string} chatId The ID of a user to send the channel admin invitation to
     * @param {string} channelId The ID of a channel for which the invitation is being sent
     * @param {SendChannelAdminInviteOptions} options
     * @returns {Promise<boolean>} Returns true if an invitation was sent successfully, false otherwise
     */
    async sendChannelAdminInvite(chatId, channelId, options = {}) {
        const response = await this.pupPage.evaluate(
            async (chatId, channelId, options) => {
                const channelWid = window.Store.WidFactory.createWid(channelId);
                const chatWid = window.Store.WidFactory.createWid(chatId);
                const chat = window.Store.Chat.get(chatWid) || (await window.Store.Chat.find(chatWid));

                if (!chatWid.isUser()) {
                    return false;
                }

                return await window.Store.SendChannelMessage.sendNewsletterAdminInviteMessage(chat, {
                    newsletterWid: channelWid,
                    invitee: chatWid,
                    inviteMessage: options.comment,
                    base64Thumb: await window.WWebJS.getProfilePicThumbToBase64(channelWid),
                });
            },
            chatId,
            channelId,
            options
        );

        return response.messageSendResult === 'OK';
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
        const sanitizedUniqueId = uniqueId.replace(/[^a-zA-Z0-9_]/g, '_');
        const inputId = `wwebjs-upload-${sanitizedUniqueId}_${Math.random().toString(36).substring(2, 15)}`.slice(0, 255);

        // Create input element in browser
        await this.pupPage.evaluate((id) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.id = id;
            input.style.display = 'none';
            document.body.appendChild(input);
        }, inputId);
        await this.pupPage.waitForSelector(`#${inputId}`, { timeout: 5000 }); // 5s
        const input = await this.pupPage.$(`#${inputId}`);
        if (!input) throw new Error('Input element not found');

        await input.uploadFile(filePath);

        // Race browser logic against the abort signal outside
        let abortListener;
        const abortPromise = new Promise((_, reject) => {
            if (options.signal) {
                abortListener = () => reject(new Error('Aborted by signal'));
                options.signal.addEventListener('abort', abortListener);
            }
        });

        const mainPromise = this.pupPage.evaluate(
            async (id, options) => {
                let finished = false;
                let timeout;
                try {
                    const file = document.getElementById(id)?.files?.[0];
                    if (!file) throw new Error('No file found in input');

                    timeout = setTimeout(() => {
                        if (!finished) {
                            finished = true;
                            document.getElementById(id)?.remove();
                            throw new Error('Media upload timed out after 120s');
                        }
                    }, 120000);

                    const data = await window.WWebJS.processMediaData(file, options);
                    if (!window.WWebJS.preparedMediaMap) window.WWebJS.preparedMediaMap = {};
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
                options.signal.removeEventListener('abort', abortListener);
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
                const msg = window.Store.Msg.get(messageId) || (await window.Store.Msg.getMessagesById([messageId]))?.messages?.[0];

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
                const { messages } = await window.Store.Msg.search(query, page, count, remote);
                return messages.map((msg) => window.WWebJS.getMessageModel(msg));
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
        const chats = await this.pupPage.evaluate(async () => {
            return await window.WWebJS.getChats();
        });

        return chats.map((chat) => ChatFactory.create(this, chat));
    }

    /**
     * Gets all cached {@link Channel} instance
     * @returns {Promise<Array<Channel>>}
     */
    async getChannels() {
        const channels = await this.pupPage.evaluate(async () => {
            return await window.WWebJS.getChannels();
        });

        return channels.map((channel) => ChatFactory.create(this, channel));
    }

    /**
     * Gets chat or channel instance by ID
     * @param {string} chatId
     * @returns {Promise<Chat|Channel>}
     */
    async getChatById(chatId) {
        const chat = await this.pupPage.evaluate(async (chatId) => {
            return await window.WWebJS.getChat(chatId);
        }, chatId);
        return chat ? ChatFactory.create(this, chat) : undefined;
    }

    /**
     * Gets a {@link Channel} instance by invite code
     * @param {string} inviteCode The code that comes after the 'https://whatsapp.com/channel/'
     * @returns {Promise<Channel>}
     */
    async getChannelByInviteCode(inviteCode) {
        const channel = await this.pupPage.evaluate(async (inviteCode) => {
            let channelMetadata;
            try {
                channelMetadata = await window.WWebJS.getChannelMetadata(inviteCode);
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return null;
                throw err;
            }
            return await window.WWebJS.getChat(channelMetadata.id);
        }, inviteCode);

        return channel ? ChatFactory.create(this, channel) : undefined;
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

            const params = messageId.split('_');
            if (params.length !== 3 && params.length !== 4) throw new Error('Invalid serialized message id specified');

            let messagesObject = await window.Store.Msg.getMessagesById([messageId]);
            if (messagesObject && messagesObject.messages.length) msg = messagesObject.messages[0];

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
            return await window.Store.GroupInvite.joinGroupViaInvite(inviteCode);
        }, inviteCode);

        return res.gid._serialized;
    }

    /**
     * Accepts a channel admin invitation and promotes the current user to a channel admin
     * @param {string} channelId The channel ID to accept the admin invitation from
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async acceptChannelAdminInvite(channelId) {
        return await this.pupPage.evaluate(async (channelId) => {
            try {
                await window.Store.ChannelUtils.acceptNewsletterAdminInvite(channelId);
                return true;
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return false;
                throw err;
            }
        }, channelId);
    }

    /**
     * Revokes a channel admin invitation sent to a user by a channel owner
     * @param {string} channelId The channel ID an invitation belongs to
     * @param {string} userId The user ID the invitation was sent to
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async revokeChannelAdminInvite(channelId, userId) {
        return await this.pupPage.evaluate(
            async (channelId, userId) => {
                try {
                    const userWid = window.Store.WidFactory.createWid(userId);
                    await window.Store.ChannelUtils.revokeNewsletterAdminInvite(channelId, userWid);
                    return true;
                } catch (err) {
                    if (err.name === 'ServerStatusCodeError') return false;
                    throw err;
                }
            },
            channelId,
            userId
        );
    }

    /**
     * Demotes a channel admin to a regular subscriber (can be used also for self-demotion)
     * @param {string} channelId The channel ID to demote an admin in
     * @param {string} userId The user ID to demote
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async demoteChannelAdmin(channelId, userId) {
        return await this.pupPage.evaluate(
            async (channelId, userId) => {
                try {
                    const userWid = window.Store.WidFactory.createWid(userId);
                    await window.Store.ChannelUtils.demoteNewsletterAdmin(channelId, userWid);
                    return true;
                } catch (err) {
                    if (err.name === 'ServerStatusCodeError') return false;
                    throw err;
                }
            },
            channelId,
            userId
        );
    }

    /**
     * Accepts a private invitation to join a group
     * @param {object} inviteInfo Invite V4 Info
     * @returns {Promise<Object>}
     */
    async acceptGroupV4Invite(inviteInfo) {
        if (!inviteInfo.inviteCode) throw 'Invalid invite code, try passing the message.inviteV4 object';
        if (inviteInfo.inviteCodeExp == 0) throw 'Expired invite code';
        return this.pupPage.evaluate(async (inviteInfo) => {
            let { groupId, fromId, inviteCode, inviteCodeExp } = inviteInfo;
            let userWid = window.Store.WidFactory.createWid(fromId);
            return await window.Store.GroupInviteV4.joinGroupViaInviteV4(inviteCode, String(inviteCodeExp), groupId, userWid);
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
            let chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
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
            let chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
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
            let chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
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
            let chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
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
     * @param {?Date} unmuteDate Date when the chat will be unmuted, don't provide a value to mute forever
     * @returns {Promise<{isMuted: boolean, muteExpiration: number}>}
     */
    async muteChat(chatId, unmuteDate) {
        unmuteDate = unmuteDate ? Math.floor(unmuteDate.getTime() / 1000) : -1;
        return this._muteUnmuteChat(chatId, 'MUTE', unmuteDate);
    }

    /**
     * Unmutes the Chat
     * @param {string} chatId ID of the chat that will be unmuted
     * @returns {Promise<{isMuted: boolean, muteExpiration: number}>}
     */
    async unmuteChat(chatId) {
        return this._muteUnmuteChat(chatId, 'UNMUTE');
    }

    /**
     * Internal method to mute or unmute the chat
     * @param {string} chatId ID of the chat that will be muted/unmuted
     * @param {string} action The action: 'MUTE' or 'UNMUTE'
     * @param {number} unmuteDateTs Timestamp at which the chat will be unmuted
     * @returns {Promise<{isMuted: boolean, muteExpiration: number}>}
     */
    async _muteUnmuteChat(chatId, action, unmuteDateTs) {
        return this.pupPage.evaluate(
            async (chatId, action, unmuteDateTs) => {
                const chat = window.Store.Chat.get(chatId) ?? (await window.Store.Chat.find(chatId));
                action === 'MUTE'
                    ? await chat.mute.mute({ expiration: unmuteDateTs, sendDevice: true })
                    : await chat.mute.unmute({ sendDevice: true });
                return { isMuted: chat.mute.expiration !== 0, muteExpiration: chat.mute.expiration };
            },
            chatId,
            action,
            unmuteDateTs || -1
        );
    }

    /**
     * Mark the Chat as unread
     * @param {string} chatId ID of the chat that will be marked as unread
     */
    async markChatUnread(chatId) {
        await this.pupPage.evaluate(async (chatId) => {
            let chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
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
            console.warn(`[${this.clientId}] [getProfilePicUrl] Page is closed or undefined. Skipping.`);
            return undefined;
        }

        // Wait for WidFactory to be available
        await this.pupPage.waitForFunction('window.Store && window.Store.WidFactory', { timeout: 10000 });

        const profilePic = await this.pupPage.evaluate(async (contactId) => {
            try {
                const chatWid = window.Store.WidFactory.createWid(contactId);
                return await window.Store.ProfilePic.requestProfilePicFromServer(chatWid);
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return undefined;
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
                const chatConstructor = window.Store.Contact.getModelsArray().find((c) => !c.isGroup).constructor;
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
            window.Store.AppState.reconnect();
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
        if (!number.endsWith('@c.us')) {
            number += '@c.us';
        }

        return await this.pupPage.evaluate(async (number) => {
            const wid = window.Store.WidFactory.createWid(number);
            const result = await window.Store.QueryExist(wid);
            if (!result || result.wid === undefined) return null;
            return result.wid;
        }, number);
    }

    /**
     * Get the formatted number of a WhatsApp ID.
     * @param {string} number Number or ID
     * @returns {Promise<string>}
     */
    async getFormattedNumber(number) {
        if (!number.endsWith('@s.whatsapp.net')) number = number.replace('c.us', 's.whatsapp.net');
        if (!number.includes('@s.whatsapp.net')) number = `${number}@s.whatsapp.net`;

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
        number = number.replace(' ', '').replace('+', '').replace('@c.us', '');

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
                const { messageTimer = 0, parentGroupId, autoSendInviteV4 = true, comment = '' } = options;
                const participantData = {},
                    participantWids = [],
                    failedParticipants = [];
                let createGroupResult, parentGroupWid;

                const addParticipantResultCodes = {
                    default: 'An unknown error occupied while adding a participant',
                    200: 'The participant was added successfully',
                    403: 'The participant can be added by sending private invitation only',
                    404: 'The phone number is not registered on WhatsApp',
                };

                for (const participant of participants) {
                    const pWid = window.Store.WidFactory.createWid(participant);
                    if ((await window.Store.QueryExist(pWid))?.wid) participantWids.push(pWid);
                    else failedParticipants.push(participant);
                }

                parentGroupId && (parentGroupWid = window.Store.WidFactory.createWid(parentGroupId));

                try {
                    createGroupResult = await window.Store.GroupUtils.createGroup(
                        {
                            memberAddMode: options.memberAddMode === undefined ? true : options.memberAddMode,
                            membershipApprovalMode: options.membershipApprovalMode === undefined ? false : options.membershipApprovalMode,
                            announce: options.announce === undefined ? true : options.announce,
                            ephemeralDuration: messageTimer,
                            full: undefined,
                            parentGroupId: parentGroupWid,
                            restrict: options.restrict === undefined ? true : options.restrict,
                            thumb: undefined,
                            title: title,
                        },
                        participantWids
                    );
                } catch (err) {
                    return 'CreateGroupError: An unknown error occupied while creating a group';
                }

                for (const participant of createGroupResult.participants) {
                    let isInviteV4Sent = false;
                    const participantId = participant.wid._serialized;
                    const statusCode = participant.error || 200;

                    if (autoSendInviteV4 && statusCode === 403) {
                        window.Store.Contact.gadd(participant.wid, { silent: true });
                        const addParticipantResult = await window.Store.GroupInviteV4.sendGroupInviteMessage(
                            await window.Store.Chat.find(participant.wid),
                            createGroupResult.wid._serialized,
                            createGroupResult.subject,
                            participant.invite_code,
                            participant.invite_code_exp,
                            comment,
                            await window.WWebJS.getProfilePicThumbToBase64(createGroupResult.wid)
                        );
                        isInviteV4Sent = window.compareWwebVersions(window.Debug.VERSION, '<', '2.2335.6')
                            ? addParticipantResult === 'OK'
                            : addParticipantResult.messageSendResult === 'OK';
                    }

                    participantData[participantId] = {
                        statusCode: statusCode,
                        message: addParticipantResultCodes[statusCode] || addParticipantResultCodes.default,
                        isGroupCreator: participant.type === 'superadmin',
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

                return { title: title, gid: createGroupResult.wid, participants: participantData };
            },
            title,
            participants,
            options
        );
    }

    /**
     * An object that handles the result for {@link createChannel} method
     * @typedef {Object} CreateChannelResult
     * @property {string} title A channel title
     * @property {ChatId} nid An object that handels the newly created channel ID
     * @property {string} nid.server 'newsletter'
     * @property {string} nid.user 'XXXXXXXXXX'
     * @property {string} nid._serialized 'XXXXXXXXXX@newsletter'
     * @property {string} inviteLink The channel invite link, starts with 'https://whatsapp.com/channel/'
     * @property {number} createdAtTs The timestamp the channel was created at
     */

    /**
     * Options for the channel creation
     * @typedef {Object} CreateChannelOptions
     * @property {?string} description The channel description
     * @property {?MessageMedia} picture The channel profile picture
     */

    /**
     * Creates a new channel
     * @param {string} title The channel name
     * @param {CreateChannelOptions} options
     * @returns {Promise<CreateChannelResult|string>} Returns an object that handles the result for the channel creation or an error message as a string
     */
    async createChannel(title, options = {}) {
        return await this.pupPage.evaluate(
            async (title, options) => {
                let response,
                    { description = null, picture = null } = options;

                if (!window.Store.ChannelUtils.isNewsletterCreationEnabled()) {
                    return 'CreateChannelError: A channel creation is not enabled';
                }

                if (picture) {
                    picture = await window.WWebJS.cropAndResizeImage(picture, {
                        asDataUrl: true,
                        mimetype: 'image/jpeg',
                        size: 640,
                        quality: 1,
                    });
                }

                try {
                    response = await window.Store.ChannelUtils.createNewsletterQuery({
                        name: title,
                        description: description,
                        picture: picture,
                    });
                } catch (err) {
                    if (err.name === 'ServerStatusCodeError') {
                        return 'CreateChannelError: An error occupied while creating a channel';
                    }
                    throw err;
                }

                return {
                    title: title,
                    nid: window.Store.JidToWid.newsletterJidToWid(response.idJid),
                    inviteLink: `https://whatsapp.com/channel/${response.newsletterInviteLinkMetadataMixin.inviteCode}`,
                    createdAtTs: response.newsletterCreationTimeMetadataMixin.creationTimeValue,
                };
            },
            title,
            options
        );
    }

    /**
     * Subscribe to channel
     * @param {string} channelId The channel ID
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async subscribeToChannel(channelId) {
        return await this.pupPage.evaluate(async (channelId) => {
            return await window.WWebJS.subscribeToUnsubscribeFromChannel(channelId, 'Subscribe');
        }, channelId);
    }

    /**
     * Options for unsubscribe from a channel
     * @typedef {Object} UnsubscribeOptions
     * @property {boolean} [deleteLocalModels = false] If true, after an unsubscription, it will completely remove a channel from the channel collection making it seem like the current user have never interacted with it. Otherwise it will only remove a channel from the list of channels the current user is subscribed to and will set the membership type for that channel to GUEST
     */

    /**
     * Unsubscribe from channel
     * @param {string} channelId The channel ID
     * @param {UnsubscribeOptions} options
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async unsubscribeFromChannel(channelId, options) {
        return await this.pupPage.evaluate(
            async (channelId, options) => {
                return await window.WWebJS.subscribeToUnsubscribeFromChannel(channelId, 'Unsubscribe', options);
            },
            channelId,
            options
        );
    }

    /**
     * Options for transferring a channel ownership to another user
     * @typedef {Object} TransferChannelOwnershipOptions
     * @property {boolean} [shouldDismissSelfAsAdmin = false] If true, after the channel ownership is being transferred to another user, the current user will be dismissed as a channel admin and will become to a channel subscriber.
     */

    /**
     * Transfers a channel ownership to another user.
     * Note: the user you are transferring the channel ownership to must be a channel admin.
     * @param {string} channelId
     * @param {string} newOwnerId
     * @param {TransferChannelOwnershipOptions} options
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async transferChannelOwnership(channelId, newOwnerId, options = {}) {
        return await this.pupPage.evaluate(
            async (channelId, newOwnerId, options) => {
                const channel = await window.WWebJS.getChat(channelId, { getAsModel: false });
                const newOwner = window.Store.Contact.get(newOwnerId) || (await window.Store.Contact.find(newOwnerId));
                if (!channel.newsletterMetadata) {
                    await window.Store.NewsletterMetadataCollection.update(channel.id);
                }

                try {
                    await window.Store.ChannelUtils.changeNewsletterOwnerAction(channel, newOwner);

                    if (options.shouldDismissSelfAsAdmin) {
                        const meContact = window.Store.ContactCollection.getMeContact();
                        meContact && (await window.Store.ChannelUtils.demoteNewsletterAdminAction(channel, meContact));
                    }
                } catch (error) {
                    return false;
                }

                return true;
            },
            channelId,
            newOwnerId,
            options
        );
    }

    /**
     * Searches for channels based on search criteria, there are some notes:
     * 1. The method finds only channels you are not subscribed to currently
     * 2. If you have never been subscribed to a found channel
     * or you have unsubscribed from it with {@link UnsubscribeOptions.deleteLocalModels} set to 'true',
     * the lastMessage property of a found channel will be 'null'
     *
     * @param {Object} searchOptions Search options
     * @param {string} [searchOptions.searchText = ''] Text to search
     * @param {Array<string>} [searchOptions.countryCodes = [your local region]] Array of country codes in 'ISO 3166-1 alpha-2' standart (@see https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) to search for channels created in these countries
     * @param {boolean} [searchOptions.skipSubscribedNewsletters = false] If true, channels that user is subscribed to won't appear in found channels
     * @param {number} [searchOptions.view = 0] View type, makes sense only when the searchText is empty. Valid values to provide are:
     * 0 for RECOMMENDED channels
     * 1 for TRENDING channels
     * 2 for POPULAR channels
     * 3 for NEW channels
     * @param {number} [searchOptions.limit = 50] The limit of found channels to be appear in the returnig result
     * @returns {Promise<Array<Channel>|[]>} Returns an array of Channel objects or an empty array if no channels were found
     */
    async searchChannels(searchOptions = {}) {
        return await this.pupPage.evaluate(
            async ({
                searchText = '',
                countryCodes = [window.Store.ChannelUtils.currentRegion],
                skipSubscribedNewsletters = false,
                view = 0,
                limit = 50,
            }) => {
                searchText = searchText.trim();
                const currentRegion = window.Store.ChannelUtils.currentRegion;
                if (![0, 1, 2, 3].includes(view)) view = 0;

                countryCodes =
                    countryCodes.length === 1 && countryCodes[0] === currentRegion
                        ? countryCodes
                        : countryCodes.filter((code) => Object.keys(window.Store.ChannelUtils.countryCodesIso).includes(code));

                const viewTypeMapping = {
                    0: 'RECOMMENDED',
                    1: 'TRENDING',
                    2: 'POPULAR',
                    3: 'NEW',
                };

                searchOptions = {
                    searchText: searchText,
                    countryCodes: countryCodes,
                    skipSubscribedNewsletters: skipSubscribedNewsletters,
                    view: viewTypeMapping[view],
                    categories: [],
                    cursorToken: '',
                };

                const originalFunction = window.Store.ChannelUtils.getNewsletterDirectoryPageSize;
                limit !== 50 && (window.Store.ChannelUtils.getNewsletterDirectoryPageSize = () => limit);

                const channels = (await window.Store.ChannelUtils.fetchNewsletterDirectories(searchOptions)).newsletters;

                limit !== 50 && (window.Store.ChannelUtils.getNewsletterDirectoryPageSize = originalFunction);

                return channels
                    ? await Promise.all(channels.map((channel) => window.WWebJS.getChatModel(channel, { isChannel: true })))
                    : [];
            },
            searchOptions
        );
    }

    /**
     * Deletes the channel you created
     * @param {string} channelId The ID of a channel to delete
     * @returns {Promise<boolean>} Returns true if the operation completed successfully, false otherwise
     */
    async deleteChannel(channelId) {
        return await this.client.pupPage.evaluate(async (channelId) => {
            const channel = await window.WWebJS.getChat(channelId, { getAsModel: false });
            if (!channel) return false;
            try {
                await window.Store.ChannelUtils.deleteNewsletterAction(channel);
                return true;
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return false;
                throw err;
            }
        }, channelId);
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
                if (item.parentType === 'Chat') {
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
            let chatIds = window.Store.Blocklist.getModelsArray().map((a) => a.id._serialized);
            return Promise.all(chatIds.map((id) => window.WWebJS.getContact(id)));
        });

        return blockedContacts.map((contact) => ContactFactory.create(this.client, contact));
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
                if (['smba', 'smbi'].indexOf(window.Store.Conn.platform) === -1) {
                    throw '[LT01] Only Whatsapp business';
                }
                const labels = window.WWebJS.getLabels().filter((e) => labelIds.find((l) => l == e.id) !== undefined);
                const chats = window.Store.Chat.filter((e) => chatIds.includes(e.id._serialized));

                let actions = labels.map((label) => ({ id: label.id, type: 'add' }));

                chats.forEach((chat) => {
                    (chat.labels || []).forEach((n) => {
                        if (!actions.find((e) => e.id == n)) {
                            actions.push({ id: n, type: 'remove' });
                        }
                    });
                });

                return await window.Store.Label.addOrRemoveLabels(actions, chats);
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
            return await window.Store.MembershipRequestUtils.getMembershipApprovalRequests(groupWid);
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
                return await window.WWebJS.membershipRequestAction(groupId, 'Approve', requesterIds, sleep);
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
                return await window.WWebJS.membershipRequestAction(groupId, 'Reject', requesterIds, sleep);
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
            const autoDownload = window.Store.Settings.getAutoDownloadDocuments();
            if (autoDownload === flag) {
                return flag;
            }
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
            await window.Store.Settings.setAutoDownloadVideos(flag);
            return flag;
        }, flag);
    }

    /**
     * Setting background synchronization.
     * NOTE: this action will take effect after you restart the client.
     * @param {boolean} flag true/false
     * @returns {Promise<boolean>}
     */
    async setBackgroundSync(flag) {
        return await this.pupPage.evaluate(async (flag) => {
            const backSync = window.Store.Settings.getGlobalOfflineNotifications();
            if (backSync === flag) {
                return flag;
            }
            await window.Store.Settings.setGlobalOfflineNotifications(flag);
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
            const devices = await window.Store.DeviceList.getDeviceIds([window.Store.WidFactory.createWid(userId)]);
            if (devices && devices.length && devices[0] != null && typeof devices[0].devices == 'object') {
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
            const chatWid = window.Store.WidFactory.createWid(chatId);
            const chat = window.Store.Chat.get(chatWid) ?? (await window.Store.Chat.find(chatWid));
            if (chat?.endOfHistoryTransferType === 0) {
                await window.Store.HistorySync.sendPeerDataOperationRequest(3, {
                    chatId: chat.id,
                });
                return true;
            }
            return false;
        }, chatId);
    }

    /**
     * Save new contact to user's addressbook or edit the existing one
     * @param {string} phoneNumber The contact's phone number in a format "17182222222", where "1" is a country code
     * @param {string} firstName
     * @param {string} lastName
     * @param {boolean} [syncToAddressbook = false] If set to true, the contact will also be saved to the user's address book on their phone. False by default
     * @returns {Promise<import('..').ChatId>} Object in a wid format
     */
    async saveOrEditAddressbookContact(phoneNumber, firstName, lastName, syncToAddressbook = false) {
        return await this.pupPage.evaluate(
            async (phoneNumber, firstName, lastName, syncToAddressbook) => {
                return await window.Store.AddressbookContactUtils.saveContactAction(
                    phoneNumber,
                    null,
                    firstName,
                    lastName,
                    syncToAddressbook
                );
            },
            phoneNumber,
            firstName,
            lastName,
            syncToAddressbook
        );
    }

    /**
     * Deletes the contact from user's addressbook
     * @param {string} phoneNumber The contact's phone number in a format "17182222222", where "1" is a country code
     * @returns {Promise<void>}
     */
    async deleteAddressbookContact(phoneNumber) {
        return await this.pupPage.evaluate(async (phoneNumber) => {
            return await window.Store.AddressbookContactUtils.deleteContactAction(phoneNumber);
        }, phoneNumber);
    }

    /**
     * Reinitializes the crypto store
     * @returns {Promise<void>}
     */
    async reinitializeCryptoStore() {
        if (!this.pupPage || this.pupPage.isClosed()) return;

        await this.pupPage.evaluate(() => {
            // Simple crypto reinitialization without dangerous event handler patching
            if (window.Store?.CryptoLib && typeof window.Store.CryptoLib.initializeWebCrypto === 'function') {
                try {
                    window.Store.CryptoLib.initializeWebCrypto();
                    console.log(`[${window.wwebjs_client_id || 'default'}] Crypto store reinitialized`);
                } catch (error) {
                    console.warn(`[${window.wwebjs_client_id || 'default'}] Failed to reinitialize crypto store:`, error);
                }
            }

            // Force decrypt any pending ciphertext messages
            if (window.Store?.Msg) {
                const ciphertextMessages = window.Store.Msg.filter((msg) => msg.type === 'ciphertext');
                ciphertextMessages.forEach((msg) => {
                    if (window.Store?.CryptoLib?.decryptE2EMessage) {
                        window.Store.CryptoLib.decryptE2EMessage(msg).catch((err) => {
                            console.warn(`[${window.wwebjs_client_id || 'default'}] Failed to decrypt message:`, err);
                        });
                    }
                });
            }
        });
    }
}

module.exports = { Client, SendMessageError };
