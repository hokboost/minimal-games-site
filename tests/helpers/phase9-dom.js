'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '../..');

function source(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function dataKey(attribute) {
    return attribute
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function splitSelectorList(selector) {
    const values = [];
    let start = 0;
    let quote = null;
    let brackets = 0;
    for (let index = 0; index < selector.length; index += 1) {
        const character = selector[index];
        if (quote) {
            if (character === quote && selector[index - 1] !== '\\') quote = null;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '[') brackets += 1;
        if (character === ']') brackets -= 1;
        if (character === ',' && brackets === 0) {
            values.push(selector.slice(start, index).trim());
            start = index + 1;
        }
    }
    values.push(selector.slice(start).trim());
    return values.filter(Boolean);
}

function splitDescendants(selector) {
    const values = [];
    let start = 0;
    let quote = null;
    let brackets = 0;
    for (let index = 0; index < selector.length; index += 1) {
        const character = selector[index];
        if (quote) {
            if (character === quote && selector[index - 1] !== '\\') quote = null;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '[') brackets += 1;
        if (character === ']') brackets -= 1;
        if (/\s/.test(character) && brackets === 0) {
            const value = selector.slice(start, index).trim();
            if (value) values.push(value);
            while (/\s/.test(selector[index + 1] || '')) index += 1;
            start = index + 1;
        }
    }
    const value = selector.slice(start).trim();
    if (value) values.push(value);
    return values;
}

class FakeClassList {
    constructor(element) {
        this.element = element;
    }

    values() {
        return this.element.className.split(/\s+/).filter(Boolean);
    }

    contains(value) {
        return this.values().includes(value);
    }

    add(...values) {
        const classes = new Set(this.values());
        values.forEach(value => classes.add(value));
        this.element.className = Array.from(classes).join(' ');
    }

    remove(...values) {
        const removed = new Set(values);
        this.element.className = this.values().filter(value => !removed.has(value)).join(' ');
    }

    toggle(value, force) {
        const present = this.contains(value);
        const next = force === undefined ? !present : Boolean(force);
        if (next) this.add(value);
        else this.remove(value);
        return next;
    }
}

class FakeEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.key = options.key;
        this.code = options.code;
        this.detail = options.detail;
        this.bubbles = options.bubbles !== false;
        this.cancelable = options.cancelable !== false;
        this.defaultPrevented = false;
        this.immediateStopped = false;
        this.target = options.target || null;
        this.currentTarget = null;
        this.returnValue = undefined;
    }

    preventDefault() {
        if (this.cancelable) this.defaultPrevented = true;
    }

    stopImmediatePropagation() {
        this.immediateStopped = true;
    }

    stopPropagation() {
        this.immediateStopped = true;
    }
}

class FakeCustomEvent extends FakeEvent {
    constructor(type, options = {}) {
        super(type, options);
        this.detail = options.detail;
    }
}

class FakeMutationObserver {
    constructor(callback) {
        this.callback = callback;
        this.targets = [];
        FakeMutationObserver.instances.push(this);
    }

    observe(target, options = {}) {
        this.targets.push({ target, options });
        target._observers.add(this);
    }

    disconnect() {
        for (const { target } of this.targets) target._observers.delete(this);
        this.targets = [];
    }

    takeRecords() {
        return [];
    }
}

FakeMutationObserver.instances = [];

function attributeParts(token) {
    const expressions = [];
    const matcher = /\[([A-Za-z0-9_-]+)(?:([~|^$*]?=)["']?([^\]"']*)["']?)?\]/g;
    let match;
    while ((match = matcher.exec(token))) {
        expressions.push({ name: match[1], operator: match[2] || null, expected: match[3] });
    }
    return expressions;
}

function simpleMatches(element, selector) {
    if (!(element instanceof FakeElement)) return false;
    if (selector === '*') return true;
    if (selector === ':scope') return true;
    let token = selector.replace(/:scope/g, '');
    if (token.includes(':last-of-type')) {
        token = token.replace(':last-of-type', '');
        if (!element.parentElement) return false;
        const peers = element.parentElement.children.filter(child => child.tagName === element.tagName);
        if (peers.at(-1) !== element) return false;
    }
    if (token.includes(':checked')) {
        token = token.replace(':checked', '');
        if (!element.checked) return false;
    }
    const id = token.match(/#([A-Za-z0-9_-]+)/)?.[1];
    if (id && element.id !== id) return false;
    const classes = Array.from(token.matchAll(/\.([A-Za-z0-9_-]+)/g), match => match[1]);
    if (classes.some(className => !element.classList.contains(className))) return false;
    const tag = token.match(/^([A-Za-z][A-Za-z0-9-]*)/)?.[1];
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    for (const expression of attributeParts(token)) {
        let actual;
        if (expression.name.startsWith('data-')) actual = element.dataset[dataKey(expression.name)];
        else if (expression.name === 'class') actual = element.className;
        else if (expression.name in element) actual = element[expression.name];
        else actual = element.getAttribute(expression.name);
        if (!expression.operator && (actual === null || actual === undefined || actual === false)) return false;
        const value = String(actual ?? '');
        if (expression.operator === '=' && value !== expression.expected) return false;
        if (expression.operator === '*=' && !value.includes(expression.expected)) return false;
        if (expression.operator === '^=' && !value.startsWith(expression.expected)) return false;
        if (expression.operator === '$=' && !value.endsWith(expression.expected)) return false;
        if (expression.operator === '~=' && !value.split(/\s+/).includes(expression.expected)) return false;
    }
    return true;
}

function matchesComplex(element, selector) {
    const parts = splitDescendants(selector);
    if (!parts.length) return false;
    let current = element;
    if (!simpleMatches(current, parts.at(-1))) return false;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
        current = current.parentElement;
        while (current && !simpleMatches(current, parts[index])) current = current.parentElement;
        if (!current) return false;
    }
    return true;
}

class FakeTextNode {
    constructor(text, ownerDocument) {
        this.nodeType = 3;
        this.textContent = String(text);
        this.ownerDocument = ownerDocument;
        this.parentElement = null;
    }
}

class FakeElement {
    constructor(tagName = 'div', ownerDocument = null) {
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = ownerDocument;
        this.parentElement = null;
        this.children = [];
        this.childNodes = [];
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this._observers = new Set();
        this.className = '';
        this.id = '';
        this.hidden = false;
        this.disabled = false;
        this.checked = false;
        this.selectedIndex = 0;
        this.tabIndex = 0;
        this.type = '';
        this.name = '';
        this.value = '';
        this.max = 1;
        this.maxLength = -1;
        this.href = '';
        this.style = {};
        this.files = [];
        this._text = '';
        this.classList = new FakeClassList(this);
    }

    get textContent() {
        return this._text + this.childNodes.map(child => child.textContent || '').join('');
    }

    set textContent(value) {
        this._text = String(value ?? '');
        this.children = [];
        this.childNodes = [];
        this.notify('characterData');
    }

    get firstChild() {
        return this.childNodes[0] || null;
    }

    get isConnected() {
        let current = this;
        while (current) {
            if (current instanceof FakeDocument) return true;
            current = current.parentElement;
        }
        return false;
    }

    get nextSibling() {
        if (!this.parentElement) return null;
        const index = this.parentElement.childNodes.indexOf(this);
        return this.parentElement.childNodes[index + 1] || null;
    }

    get previousSibling() {
        if (!this.parentElement) return null;
        const index = this.parentElement.childNodes.indexOf(this);
        return this.parentElement.childNodes[index - 1] || null;
    }

    append(...nodes) {
        for (const raw of nodes) {
            const node = typeof raw === 'string' ? new FakeTextNode(raw, this.ownerDocument) : raw;
            if (!node) continue;
            if (node.parentElement) node.remove?.();
            node.parentElement = this;
            this.childNodes.push(node);
            if (node instanceof FakeElement) this.children.push(node);
        }
        this.notify('childList');
    }

    appendChild(node) {
        this.append(node);
        return node;
    }

    prepend(...nodes) {
        const elements = nodes.map(raw => typeof raw === 'string' ? new FakeTextNode(raw, this.ownerDocument) : raw);
        for (const node of elements) node.parentElement = this;
        this.childNodes.unshift(...elements);
        this.children = this.childNodes.filter(node => node instanceof FakeElement);
        this.notify('childList');
    }

    replaceChildren(...nodes) {
        for (const child of this.childNodes) child.parentElement = null;
        this.childNodes = [];
        this.children = [];
        this._text = '';
        this.append(...nodes);
    }

    insertBefore(node, reference) {
        if (!reference) {
            this.append(node);
            return node;
        }
        const index = this.childNodes.indexOf(reference);
        if (index < 0) throw new Error('Reference node is not a child');
        node.parentElement = this;
        this.childNodes.splice(index, 0, node);
        this.children = this.childNodes.filter(child => child instanceof FakeElement);
        this.notify('childList');
        return node;
    }

    before(...nodes) {
        if (!this.parentElement) return;
        for (const node of nodes) this.parentElement.insertBefore(node, this);
    }

    after(...nodes) {
        if (!this.parentElement) return;
        let reference = this.nextSibling;
        for (const node of nodes) {
            this.parentElement.insertBefore(node, reference);
            reference = node.nextSibling;
        }
    }

    insertAdjacentElement(position, element) {
        if (position === 'afterend') this.after(element);
        else if (position === 'beforebegin') this.before(element);
        else if (position === 'afterbegin') this.prepend(element);
        else this.append(element);
        return element;
    }

    remove() {
        if (!this.parentElement) return;
        const parent = this.parentElement;
        parent.childNodes = parent.childNodes.filter(child => child !== this);
        parent.children = parent.children.filter(child => child !== this);
        this.parentElement = null;
        parent.notify('childList');
    }

    setAttribute(name, value) {
        const stringValue = String(value);
        if (name === 'id') this.id = stringValue;
        else if (name === 'class') this.className = stringValue;
        else if (name.startsWith('data-')) this.dataset[dataKey(name)] = stringValue;
        else if (name === 'hidden') this.hidden = true;
        else if (name === 'disabled') this.disabled = true;
        else this.attributes.set(name, stringValue);
        this.notify('attributes', name);
    }

    getAttribute(name) {
        if (name === 'id') return this.id || null;
        if (name === 'class') return this.className || null;
        if (name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
        if (name === 'hidden') return this.hidden ? '' : null;
        if (name === 'disabled') return this.disabled ? '' : null;
        return this.attributes.get(name) ?? null;
    }

    hasAttribute(name) {
        return this.getAttribute(name) !== null;
    }

    removeAttribute(name) {
        if (name === 'id') this.id = '';
        else if (name === 'class') this.className = '';
        else if (name.startsWith('data-')) delete this.dataset[dataKey(name)];
        else if (name === 'hidden') this.hidden = false;
        else if (name === 'disabled') this.disabled = false;
        else this.attributes.delete(name);
        this.notify('attributes', name);
    }

    matches(selector) {
        return splitSelectorList(selector).some(part => matchesComplex(this, part));
    }

    closest(selector) {
        let current = this;
        while (current) {
            if (current.matches(selector)) return current;
            current = current.parentElement;
        }
        return null;
    }

    querySelectorAll(selector) {
        if (selector === ':scope') return [this];
        const matches = [];
        const selectors = splitSelectorList(selector);
        function visit(node) {
            for (const child of node.children) {
                if (selectors.some(part => matchesComplex(child, part))) matches.push(child);
                visit(child);
            }
        }
        visit(this);
        return matches;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    addEventListener(type, listener, options = {}) {
        const listeners = this.listeners.get(type) || [];
        listeners.push({ listener, capture: options === true || Boolean(options?.capture), once: Boolean(options?.once) });
        this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        this.listeners.set(type, listeners.filter(entry => entry.listener !== listener));
    }

    async dispatchEvent(event) {
        if (!(event instanceof FakeEvent)) event = new FakeEvent(event.type || String(event), event);
        if (!event.target) event.target = this;
        const path = [];
        let current = this;
        while (current) {
            path.unshift(current);
            current = current.parentElement;
        }
        for (const node of path) {
            const listeners = (node.listeners.get(event.type) || []).filter(entry => entry.capture);
            for (const entry of listeners) {
                event.currentTarget = node;
                await entry.listener(event);
                if (entry.once) node.removeEventListener(event.type, entry.listener);
                if (event.immediateStopped) return !event.defaultPrevented;
            }
        }
        for (const node of path.reverse()) {
            const listeners = (node.listeners.get(event.type) || []).filter(entry => !entry.capture);
            for (const entry of listeners) {
                event.currentTarget = node;
                await entry.listener(event);
                if (entry.once) node.removeEventListener(event.type, entry.listener);
                if (event.immediateStopped) return !event.defaultPrevented;
            }
            if (!event.bubbles) break;
        }
        return !event.defaultPrevented;
    }

    async dispatch(type, options = {}) {
        const event = type instanceof FakeEvent ? type : new FakeEvent(type, { ...options, target: options.target || this });
        return this.dispatchEvent(event);
    }

    focus() {
        if (this.ownerDocument) this.ownerDocument.activeElement = this;
        this.dispatchEvent(new FakeEvent('focus', { bubbles: false, target: this }));
    }

    scrollIntoView(options) {
        this.lastScrollOptions = options || {};
    }

    cloneNode(deep = false) {
        const clone = new FakeElement(this.tagName, this.ownerDocument);
        clone.id = this.id;
        clone.className = this.className;
        clone.dataset = { ...this.dataset };
        clone.attributes = new Map(this.attributes);
        clone.hidden = this.hidden;
        clone.disabled = this.disabled;
        clone.checked = this.checked;
        clone.value = this.value;
        clone.type = this.type;
        clone.name = this.name;
        clone._text = this._text;
        if (deep) {
            for (const child of this.childNodes) {
                clone.append(child instanceof FakeElement ? child.cloneNode(true) : new FakeTextNode(child.textContent, this.ownerDocument));
            }
        }
        return clone;
    }

    notify(type, attributeName) {
        let current = this;
        while (current) {
            for (const observer of current._observers) {
                const registration = observer.targets.find(target => target.target === current);
                if (!registration) continue;
                if (current !== this && !registration.options.subtree) continue;
                observer.callback([{ type, target: this, attributeName }], observer);
            }
            current = current.parentElement;
        }
    }
}

class FakeDocument extends FakeElement {
    constructor({ lang = 'en' } = {}) {
        super('#document', null);
        this.ownerDocument = this;
        this.documentElement = new FakeElement('html', this);
        this.documentElement.lang = lang;
        this.head = new FakeElement('head', this);
        this.body = new FakeElement('body', this);
        this.documentElement.append(this.head, this.body);
        this.append(this.documentElement);
        this.activeElement = this.body;
    }

    createElement(tagName) {
        return new FakeElement(tagName, this);
    }

    createTextNode(text) {
        return new FakeTextNode(text, this);
    }

    getElementById(id) {
        if (this.documentElement.id === id) return this.documentElement;
        return this.documentElement.querySelector(`#${id}`);
    }
}

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        },
        clear() {
            values.clear();
        },
        dump() {
            return Object.fromEntries(values);
        }
    };
}

function response(body, status = 200, headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
            get(name) {
                return headers[String(name).toLowerCase()] || null;
            }
        },
        async json() {
            return body;
        },
        async text() {
            return typeof body === 'string' ? body : JSON.stringify(body);
        }
    };
}

function createBrowser(options = {}) {
    const document = options.document || new FakeDocument({ lang: options.lang || 'en' });
    const listeners = new Map();
    const localStorage = storage(options.storage);
    const location = {
        href: options.href || 'https://example.test/creator',
        origin: new URL(options.href || 'https://example.test/creator').origin,
        pathname: options.pathname || '/creator',
        hash: options.hash || '',
        reloadCalls: 0,
        reload() {
            this.reloadCalls += 1;
        }
    };
    const history = {
        entries: [],
        replaceState(state, title, url) {
            this.entries.push({ state, title, url });
            if (String(url).startsWith('#')) location.hash = String(url);
        }
    };
    const navigator = {
        onLine: options.online !== false,
        language: options.lang || 'en',
        maxTouchPoints: options.maxTouchPoints || 0
    };
    const browserSetTimeout = options.setTimeout || setTimeout;
    const browserClearTimeout = options.clearTimeout || clearTimeout;
    const browserSetInterval = options.setInterval || setInterval;
    const browserClearInterval = options.clearInterval || clearInterval;
    const windowObject = {
        document,
        navigator,
        localStorage,
        location,
        history,
        innerWidth: options.innerWidth || 1280,
        crypto: options.crypto || { randomUUID: () => '00000000-0000-4000-a000-000000009999' },
        matchMedia: options.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
        addEventListener(type, listener) {
            const values = listeners.get(type) || [];
            values.push(listener);
            listeners.set(type, values);
        },
        removeEventListener(type, listener) {
            listeners.set(type, (listeners.get(type) || []).filter(value => value !== listener));
        },
        async dispatchEvent(event) {
            for (const listener of listeners.get(event.type) || []) await listener(event);
            return !event.defaultPrevented;
        },
        setTimeout: browserSetTimeout,
        clearTimeout: browserClearTimeout,
        setInterval: browserSetInterval,
        clearInterval: browserClearInterval,
        requestAnimationFrame(callback) {
            return browserSetTimeout(callback, 0);
        },
        cancelAnimationFrame: browserClearTimeout
    };
    windowObject.window = windowObject;
    windowObject.self = windowObject;
    const context = {
        window: windowObject,
        self: windowObject,
        globalThis: windowObject,
        document,
        navigator,
        localStorage,
        location,
        history,
        console,
        Event: FakeEvent,
        CustomEvent: FakeCustomEvent,
        MutationObserver: FakeMutationObserver,
        HTMLElement: FakeElement,
        HTMLTextAreaElement: FakeElement,
        HTMLInputElement: FakeElement,
        Node: FakeElement,
        FormData: options.FormData || class FormData {
            constructor(form) {
                this.values = form?._formValues || [];
            }
            *[Symbol.iterator]() {
                yield* this.values;
            }
        },
        fetch: options.fetch || (async () => response({}, 200)),
        crypto: windowObject.crypto,
        URL,
        URLSearchParams,
        Date: options.Date || Date,
        Intl,
        JSON,
        Map,
        Set,
        WeakMap,
        Object,
        Array,
        String,
        Number,
        Boolean,
        RegExp,
        Math,
        Promise,
        setTimeout: browserSetTimeout,
        clearTimeout: browserClearTimeout,
        setInterval: browserSetInterval,
        clearInterval: browserClearInterval,
        structuredClone: global.structuredClone,
        confirm: options.confirm || (() => true),
        prompt: options.prompt || (() => ''),
        requestAnimationFrame: callback => browserSetTimeout(callback, 0),
        cancelAnimationFrame: browserClearTimeout
        ,queueMicrotask
    };
    vm.createContext(context);
    return {
        context,
        document,
        window: windowObject,
        navigator,
        location,
        history,
        localStorage,
        listeners,
        run(relativePath) {
            vm.runInContext(source(relativePath), context, { filename: relativePath });
            return context;
        },
        async emit(type, optionsForEvent = {}) {
            return windowObject.dispatchEvent(new FakeEvent(type, optionsForEvent));
        }
    };
}

function append(document, parent, tag, options = {}) {
    const element = document.createElement(tag);
    if (options.id) element.id = options.id;
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = options.text;
    if (options.type) element.type = options.type;
    if (options.name) element.name = options.name;
    if (options.value !== undefined) element.value = options.value;
    if (options.checked !== undefined) element.checked = options.checked;
    if (options.disabled !== undefined) element.disabled = options.disabled;
    if (options.hidden !== undefined) element.hidden = options.hidden;
    if (options.dataset) Object.assign(element.dataset, options.dataset);
    if (options.attributes) {
        for (const [name, value] of Object.entries(options.attributes)) element.setAttribute(name, value);
    }
    parent.append(element);
    return element;
}

module.exports = {
    FakeClassList,
    FakeCustomEvent,
    FakeDocument,
    FakeElement,
    FakeEvent,
    FakeMutationObserver,
    append,
    createBrowser,
    projectRoot,
    response,
    source,
    storage
};
