'use strict';

// Minimal DOM: just enough for vim-scroll.js, without real layout.
//
// Visibility: by default every element is "visible" through the common browser APIs, so an
// implementation that labels only visible links can use whichever it prefers:
//   - getBoundingClientRect() / getClientRects(): every <a> gets an in-viewport rect by default
//     (DEFAULT_LINK_RECT); other elements cover the viewport. Override per element with `el.rect = {...}`.
//   - offsetWidth/offsetHeight/offsetParent, clientWidth/clientHeight
//   - checkVisibility() -> true
//   - getComputedStyle(el): display/visibility/opacity defaults, overlaid by inline styles and by
//     `el.computed = { ... }` overrides.
//   - window.innerWidth/innerHeight (VIEWPORT), scrollX/scrollY 0, documentElement.clientWidth/Height.
// Real layout, CSS and hidden-element behavior are tested in real Chromium (tests/e2e).

const VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_LINK_RECT = { x: 8, y: 8, width: 80, height: 18 };

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const DOCUMENT_FRAGMENT_NODE = 11;

const INLINE_TAGS = new Set(['A', 'SPAN', 'B', 'I', 'EM', 'STRONG', 'MARK', 'SUP', 'SUB', 'SMALL', 'LABEL', 'CODE', 'KBD']);

function kebab(name) {
  if (name.startsWith('--')) return name;
  return name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()).replace(/^webkit-/, '-webkit-');
}

function parseCss(text) {
  const out = new Map();
  for (const part of String(text).split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const name = part.slice(0, i).trim().toLowerCase();
    let value = part.slice(i + 1).trim();
    let priority = '';
    const imp = value.match(/\s*!\s*important\s*$/i);
    if (imp) {
      value = value.slice(0, imp.index).trim();
      priority = 'important';
    }
    if (name) out.set(name, { value, priority });
  }
  return out;
}

// CSSStyleDeclaration-like object: cssText, setProperty/getPropertyValue/removeProperty and
// camelCase or kebab-case property access (style.display = 'none', style['border-radius']).
function createStyle() {
  const props = new Map(); // kebab name -> { value, priority }
  const api = {
    get cssText() {
      return Array.from(props, ([k, v]) => `${k}: ${v.value}${v.priority ? ' !important' : ''};`).join(' ');
    },
    set cssText(text) {
      props.clear();
      for (const [k, v] of parseCss(text)) props.set(k, v);
    },
    setProperty(name, value, priority = '') {
      if (value === null || value === '') props.delete(kebab(name));
      else props.set(kebab(name), { value: String(value), priority: priority || '' });
    },
    getPropertyValue(name) {
      const p = props.get(kebab(name));
      return p ? p.value : '';
    },
    getPropertyPriority(name) {
      const p = props.get(kebab(name));
      return p ? p.priority : '';
    },
    removeProperty(name) {
      const p = props.get(kebab(name));
      props.delete(kebab(name));
      return p ? p.value : '';
    },
    get length() {
      return props.size;
    },
    entries() {
      return Array.from(props, ([k, v]) => [k, v.value]);
    },
  };
  return new Proxy(api, {
    get(target, key) {
      if (typeof key !== 'string' || key in target) return Reflect.get(target, key);
      return target.getPropertyValue(key);
    },
    set(target, key, value) {
      if (typeof key !== 'string' || key in target) return Reflect.set(target, key, value);
      target.setProperty(key, value);
      return true;
    },
  });
}

// Selector support: comma lists of simple compound selectors such as `a`, `.cls`, `#id`,
// `a[href]`, `[href]`, `a.cls`, `*`. Descendant combinators are not supported.
function compileSelector(selector) {
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
  const tests = parts.map((part) => {
    if (/[\s>+~]/.test(part)) throw new Error(`fake-dom: unsupported selector "${selector}"`);
    const re = /([a-zA-Z][\w-]*|\*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:([~^$*|]?=)["']?([^"'\]]*)["']?)?\]|:not\(\[([\w-]+)\]\)/g;
    const checks = [];
    let consumed = 0;
    let m;
    while ((m = re.exec(part))) {
      consumed += m[0].length;
      const [, tag, cls, id, attr, op, val, notAttr] = m;
      if (tag) checks.push((el) => tag === '*' || el.tagName === tag.toUpperCase());
      else if (cls) checks.push((el) => el.classList.contains(cls));
      else if (id) checks.push((el) => el.id === id);
      else if (attr && !op) checks.push((el) => el.hasAttribute(attr));
      else if (attr && op === '=') checks.push((el) => el.getAttribute(attr) === val);
      else if (attr) checks.push((el) => el.hasAttribute(attr));
      else if (notAttr) checks.push((el) => !el.hasAttribute(notAttr));
    }
    if (consumed !== part.length) throw new Error(`fake-dom: unsupported selector "${selector}"`);
    return (el) => checks.every((c) => c(el));
  });
  return (el) => tests.some((t) => t(el));
}

class FakeNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.parentNode = null;
    this.children = []; // element children (and text nodes, see childNodes)
    this.ownerDocument = null;
  }

  get childNodes() {
    return this.children;
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === ELEMENT_NODE ? this.parentNode : null;
  }

  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return !!(n.ownerDocument && n === n.ownerDocument.documentElement);
  }

  // The document this node is connected to, or null.
  get connectedDocument() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n.ownerDocument && n === n.ownerDocument.documentElement ? n.ownerDocument : null;
  }

  // Next sibling node (element or text).
  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    return siblings[siblings.indexOf(this) - 1] || null;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get lastChild() {
    return this.children.at(-1) || null;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  before(...nodes) {
    for (const n of nodes) this.parentNode.insertBefore(toNode(this, n), this);
  }

  after(...nodes) {
    let ref = this.nextSibling;
    for (const n of nodes) this.parentNode.insertBefore(toNode(this, n), ref);
  }

  replaceWith(...nodes) {
    const parent = this.parentNode;
    const ref = this.nextSibling;
    parent.removeChild(this);
    for (const n of nodes) parent.insertBefore(toNode(parent, n), ref);
  }
}

function toNode(context, n) {
  if (n instanceof FakeNode) return n;
  const t = new FakeText(String(n));
  t.ownerDocument = context.ownerDocument;
  return t;
}

class FakeText extends FakeNode {
  constructor(text) {
    super(TEXT_NODE);
    this.data = text;
  }

  get textContent() {
    return this.data;
  }

  set textContent(v) {
    this.data = String(v);
  }

  get nodeValue() {
    return this.data;
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super(ELEMENT_NODE);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.localName = tagName.toLowerCase();
    this.attributes = new Map();
    this._text = '';
    this._style = createStyle();
    // Every value assigned to `element.style` (as a string), in order.
    this.styleAssignments = [];
    // Layout overrides: `rect` = { x, y, width, height }; `computed` = { display: 'none', ... }.
    this.rect = null;
    this.computed = {};
    this.listeners = [];
    this.dataset = {};
    const el = this;
    const classes = () => el.className.split(/\s+/).filter(Boolean);
    this.classList = {
      add(...cls) {
        const set = new Set(classes());
        for (const c of cls) set.add(c);
        el.className = Array.from(set).join(' ');
      },
      remove(...cls) {
        el.className = classes().filter((c) => !cls.includes(c)).join(' ');
      },
      toggle(cls, force) {
        const has = classes().includes(cls);
        const want = force === undefined ? !has : !!force;
        if (want) this.add(cls);
        else this.remove(cls);
        return want;
      },
      contains(cls) {
        return classes().includes(cls);
      },
      get length() {
        return classes().length;
      },
    };
  }

  get className() {
    return this.attributes.get('class') || '';
  }

  set className(v) {
    this.attributes.set('class', String(v));
  }

  get id() {
    return this.attributes.get('id') || '';
  }

  set id(v) {
    this.attributes.set('id', String(v));
  }

  get hidden() {
    return this.attributes.has('hidden');
  }

  set hidden(v) {
    if (v) this.attributes.set('hidden', '');
    else this.attributes.delete('hidden');
  }

  setAttribute(name, value) {
    name = name.toLowerCase();
    if (name === 'style') {
      this.style = String(value);
      return;
    }
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    name = name.toLowerCase();
    if (name === 'style') return this._style.cssText || null;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    name = name.toLowerCase();
    if (name === 'style') return this._style.length > 0;
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    name = name.toLowerCase();
    if (name === 'style') this._style.cssText = '';
    else this.attributes.delete(name);
  }

  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text;
  }

  set textContent(v) {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    this._text = v === null || v === undefined ? '' : String(v);
  }

  get innerText() {
    return this.textContent;
  }

  set innerText(v) {
    this.textContent = v;
  }

  // Assigning a string to `style` sets cssText, as in a browser.
  set style(value) {
    this.styleAssignments.push(value);
    this._style.cssText = value;
  }

  get style() {
    return this._style;
  }

  // Inline style text, for convenience in tests.
  get cssText() {
    return this._style.cssText;
  }

  get elementChildren() {
    return this.children.filter((c) => c.nodeType === ELEMENT_NODE);
  }

  get firstElementChild() {
    return this.elementChildren[0] || null;
  }

  get lastElementChild() {
    return this.elementChildren.at(-1) || null;
  }

  get nextElementSibling() {
    let n = this.nextSibling;
    while (n && n.nodeType !== ELEMENT_NODE) n = n.nextSibling;
    return n;
  }

  get previousElementSibling() {
    let n = this.previousSibling;
    while (n && n.nodeType !== ELEMENT_NODE) n = n.previousSibling;
    return n;
  }

  appendChild(child) {
    if (child.nodeType === DOCUMENT_FRAGMENT_NODE) {
      for (const c of child.children.slice()) this.appendChild(c);
      return child;
    }
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    for (const n of nodes) this.appendChild(toNode(this, n));
  }

  prepend(...nodes) {
    const ref = this.firstChild;
    for (const n of nodes) this.insertBefore(toNode(this, n), ref);
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i === -1) throw new Error('removeChild: not a child');
    this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(newNode, referenceNode) {
    if (referenceNode === null || referenceNode === undefined) {
      return this.appendChild(newNode);
    }
    if (newNode.nodeType === DOCUMENT_FRAGMENT_NODE) {
      for (const c of newNode.children.slice()) this.insertBefore(c, referenceNode);
      return newNode;
    }
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    const i = this.children.indexOf(referenceNode);
    if (i === -1) throw new Error('insertBefore: reference is not a child');
    newNode.parentNode = this;
    this.children.splice(i, 0, newNode);
    return newNode;
  }

  insertAdjacentElement(position, el) {
    switch (position.toLowerCase()) {
      case 'beforebegin':
        this.parentNode.insertBefore(el, this);
        break;
      case 'afterbegin':
        this.insertBefore(el, this.firstChild);
        break;
      case 'beforeend':
        this.appendChild(el);
        break;
      case 'afterend':
        this.parentNode.insertBefore(el, this.nextSibling);
        break;
      default:
        throw new Error('insertAdjacentElement: bad position');
    }
    return el;
  }

  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  matches(selector) {
    return compileSelector(selector)(this);
  }

  closest(selector) {
    const test = compileSelector(selector);
    for (let n = this; n && n.nodeType === ELEMENT_NODE; n = n.parentNode) if (test(n)) return n;
    return null;
  }

  // Depth-first, document order (excluding this element itself). Elements only.
  descendants() {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.nodeType !== ELEMENT_NODE) continue;
        out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelectorAll(selector) {
    const test = compileSelector(selector);
    return this.descendants().filter(test);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getElementsByTagName(name) {
    const tag = name.toUpperCase();
    return this.descendants().filter((el) => tag === '*' || el.tagName === tag);
  }

  getElementsByClassName(cls) {
    return this.descendants().filter((el) => el.classList.contains(cls));
  }

  addEventListener(type, handler, options) {
    this.listeners.push({ type, handler, options });
  }

  removeEventListener(type, handler) {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.handler === handler));
  }

  // --- layout fakes ---

  defaultRect() {
    return { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height };
  }

  getBoundingClientRect() {
    const r = this.rect || this.defaultRect();
    return {
      x: r.x,
      y: r.y,
      left: r.x,
      top: r.y,
      width: r.width,
      height: r.height,
      right: r.x + r.width,
      bottom: r.y + r.height,
      toJSON() {
        return { ...this };
      },
    };
  }

  getClientRects() {
    const r = this.getBoundingClientRect();
    return r.width > 0 || r.height > 0 ? [r] : [];
  }

  get offsetWidth() {
    return this.getBoundingClientRect().width;
  }

  get offsetHeight() {
    return this.getBoundingClientRect().height;
  }

  get offsetLeft() {
    return this.getBoundingClientRect().left;
  }

  get offsetTop() {
    return this.getBoundingClientRect().top;
  }

  get offsetParent() {
    const doc = this.connectedDocument;
    if (!doc || this.tagName === 'BODY' || this.tagName === 'HTML') return null;
    return doc.body;
  }

  get clientWidth() {
    return this.getBoundingClientRect().width;
  }

  get clientHeight() {
    return this.getBoundingClientRect().height;
  }

  get scrollWidth() {
    return this.clientWidth;
  }

  get scrollHeight() {
    return this._scrollHeight === undefined ? this.clientHeight : this._scrollHeight;
  }

  set scrollHeight(v) {
    this._scrollHeight = v;
  }

  checkVisibility() {
    return true;
  }

  focus() {}

  blur() {}

  click() {}
}

class FakeAnchor extends FakeElement {
  // `href` mimics HTMLAnchorElement.href: '' when the element has no href attribute.
  // Tests pass already-absolute URLs; URL resolution is browser behavior.
  // null/undefined = no href attribute.
  constructor(href) {
    super('a');
    if (href !== undefined && href !== null) this.attributes.set('href', String(href));
  }

  get href() {
    return this.attributes.has('href') ? this.attributes.get('href') : '';
  }

  set href(v) {
    this.attributes.set('href', String(v));
  }

  defaultRect() {
    return { ...DEFAULT_LINK_RECT };
  }
}

class FakeFragment extends FakeNode {
  constructor() {
    super(DOCUMENT_FRAGMENT_NODE);
  }

  appendChild(child) {
    return FakeElement.prototype.appendChild.call(this, child);
  }

  append(...nodes) {
    for (const n of nodes) this.appendChild(toNode(this, n));
  }

  removeChild(child) {
    return FakeElement.prototype.removeChild.call(this, child);
  }

  insertBefore(newNode, ref) {
    return FakeElement.prototype.insertBefore.call(this, newNode, ref);
  }
}

// Computed style: defaults, then inline style, then `el.computed` overrides.
function computedStyleOf(el) {
  const values = new Map([
    ['display', INLINE_TAGS.has(el.tagName) ? 'inline' : 'block'],
    ['visibility', 'visible'],
    ['opacity', '1'],
    ['position', 'static'],
    ['font-size', '16px'],
    ['line-height', 'normal'],
    ['font-family', 'sans-serif'],
    ['color', 'rgb(0, 0, 0)'],
    ['background-color', 'rgba(0, 0, 0, 0)'],
    ['z-index', 'auto'],
    ['overflow', 'visible'],
    ['transform', 'none'],
    ['pointer-events', 'auto'],
    ['content-visibility', 'visible'],
  ]);
  if (el.nodeType === ELEMENT_NODE) {
    for (const [k, v] of el.style.entries()) values.set(k, v);
    for (const [k, v] of Object.entries(el.computed || {})) values.set(kebab(k), String(v));
  }
  const api = {
    getPropertyValue(name) {
      return values.get(kebab(name)) || '';
    },
  };
  return new Proxy(api, {
    get(target, key) {
      if (typeof key !== 'string' || key in target) return Reflect.get(target, key);
      return target.getPropertyValue(key);
    },
  });
}

function createFakeDocument({ scrollHeight = 5000 } = {}) {
  const listeners = [];

  const document = {
    nodeType: 9,
    readyState: 'complete',
    listeners,
    addEventListener(type, handler, options) {
      listeners.push({ type, handler, options });
    },
    removeEventListener(type, handler) {
      const i = listeners.findIndex((l) => l.type === type && l.handler === handler);
      if (i !== -1) listeners.splice(i, 1);
    },
    get links() {
      return document.documentElement
        .descendants()
        .filter((el) => (el.tagName === 'A' || el.tagName === 'AREA') && el.hasAttribute('href'));
    },
    get scrollingElement() {
      return document.documentElement;
    },
    getElementsByTagName(name) {
      return document.documentElement.getElementsByTagName(name);
    },
    getElementsByClassName(cls) {
      return document.documentElement.getElementsByClassName(cls);
    },
    getElementById(id) {
      return document.documentElement.descendants().find((el) => el.id === id) || null;
    },
    querySelectorAll(selector) {
      const test = compileSelector(selector);
      const html = document.documentElement;
      return (test(html) ? [html] : []).concat(html.querySelectorAll(selector));
    },
    querySelector(selector) {
      return document.querySelectorAll(selector)[0] || null;
    },
    createElement(tagName) {
      const el = tagName.toLowerCase() === 'a' ? new FakeAnchor() : new FakeElement(tagName);
      el.ownerDocument = document;
      return el;
    },
    createTextNode(text) {
      const t = new FakeText(String(text));
      t.ownerDocument = document;
      return t;
    },
    createDocumentFragment() {
      const f = new FakeFragment();
      f.ownerDocument = document;
      return f;
    },
    contains(node) {
      return document.documentElement.contains(node);
    },
    keydownListeners() {
      return listeners.filter((l) => l.type === 'keydown');
    },
  };

  const documentElement = document.createElement('html');
  const head = document.createElement('head');
  const body = document.createElement('body');
  documentElement.appendChild(head);
  documentElement.appendChild(body);
  body.scrollHeight = scrollHeight;
  documentElement.scrollHeight = scrollHeight;
  document.documentElement = documentElement;
  document.head = head;
  document.body = body;
  return document;
}

// Adopts an element created with `new FakeElement(...)` into `document` (sets ownerDocument).
function adopt(document, el) {
  el.ownerDocument = document;
  for (const d of el.descendants()) d.ownerDocument = document;
  return el;
}

module.exports = {
  FakeElement,
  FakeAnchor,
  FakeText,
  createFakeDocument,
  computedStyleOf,
  adopt,
  VIEWPORT,
  DEFAULT_LINK_RECT,
};
