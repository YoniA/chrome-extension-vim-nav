'use strict';

// Minimal element tree: just enough DOM for vim-scroll.js.
// Only element nodes are modeled (no text nodes), so nextSibling is the next element.

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.textContent = '';
    this.cssText = '';
    // Every value assigned to `element.style`, in order.
    this.styleAssignments = [];
    const el = this;
    this.classList = {
      add(cls) {
        const set = new Set(el.className.split(/\s+/).filter(Boolean));
        set.add(cls);
        el.className = Array.from(set).join(' ');
      },
      contains(cls) {
        return el.className.split(/\s+/).includes(cls);
      },
    };
  }

  // vim-scroll.js assigns a string to `style`; in a browser that sets cssText.
  set style(value) {
    this.styleAssignments.push(value);
    this.cssText = value;
  }

  get style() {
    return { cssText: this.cssText };
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
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
    const i = this.children.indexOf(referenceNode);
    if (i === -1) throw new Error('insertBefore: reference is not a child');
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    newNode.parentNode = this;
    this.children.splice(i, 0, newNode);
    return newNode;
  }

  // Depth-first, document order (excluding this element itself).
  descendants() {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

class FakeAnchor extends FakeElement {
  // `href` mimics HTMLAnchorElement.href: '' when the element has no href attribute.
  // Tests pass already-absolute URLs; URL resolution is browser behavior.
  constructor(href) {
    super('a');
    this.href = href === undefined || href === null ? '' : href;
  }
}

function createFakeDocument({ scrollHeight = 5000 } = {}) {
  const documentElement = new FakeElement('html');
  const body = new FakeElement('body');
  documentElement.appendChild(body);
  body.scrollHeight = scrollHeight;

  const listeners = [];

  const document = {
    documentElement,
    body,
    listeners,
    addEventListener(type, handler, options) {
      listeners.push({ type, handler, options });
    },
    getElementsByTagName(name) {
      const tag = name.toUpperCase();
      return documentElement.descendants().filter((el) => el.tagName === tag);
    },
    getElementsByClassName(cls) {
      return documentElement.descendants().filter((el) => el.classList.contains(cls));
    },
    // Supports only a bare tag name or a single `.class` selector.
    querySelectorAll(selector) {
      if (selector.startsWith('.')) return document.getElementsByClassName(selector.slice(1));
      return document.getElementsByTagName(selector);
    },
    createElement(tagName) {
      return tagName.toLowerCase() === 'a' ? new FakeAnchor() : new FakeElement(tagName);
    },
    keydownListeners() {
      return listeners.filter((l) => l.type === 'keydown');
    },
  };
  return document;
}

module.exports = { FakeElement, FakeAnchor, createFakeDocument };
