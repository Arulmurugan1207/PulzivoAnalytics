'use strict';
/**
 * Turn the Angular marketing templates into static HTML for no-JS crawlers.
 *
 * The page templates and the class fields they bind (plans, FAQs, feature
 * lists, docs sections) stay the source of truth. This expands @for/@if,
 * interpolations and router links against that data, so the prerendered body
 * tracks the live copy instead of a second handwritten snapshot.
 *
 * Angular clears <app-root> on bootstrap, same as the blog article prerender,
 * so this markup is not left on screen after the app starts.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const POSTS = require('../src/app/pages/blog/posts.json');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const DROP_ATTRS = new Set([
  'routerLink', 'fragment', 'queryParams', 'label', 'icon', 'iconPos', 'severity', 'size',
  'styleClass', 'outlined', 'pButton', 'pInputText', 'pTemplate', 'ngModel', 'fluid',
  'text', 'rounded', 'raised', 'plain', 'loading', 'ngClass',
]);

const exprJs = new Map();
const exprFn = new Map();

function transpileExpr(expr) {
  const key = expr.trim();
  if (exprJs.has(key)) return exprJs.get(key);
  let js = ts.transpile(`(${key})`, { target: ts.ScriptTarget.ES2022 });
  js = js.replace(/^\s*["']use strict["'];\s*/g, '').trim();
  if (js.endsWith(';')) js = js.slice(0, -1).trim();
  exprJs.set(key, js);
  return js;
}

function functionFor(expr) {
  const key = expr.trim();
  if (exprFn.has(key)) return exprFn.get(key);
  const js = transpileExpr(key);
  const fn = new Function('scope', `with (scope) { return (${js}); }`);
  exprFn.set(key, fn);
  return fn;
}

function proxy(scope) {
  return new Proxy(scope, {
    has(target, key) {
      if (typeof key === 'symbol') return false;
      return key in target;
    },
    get(target, key, receiver) {
      return Reflect.get(target, key, receiver);
    },
  });
}

function evalInScope(expr, scope) {
  try {
    return functionFor(expr)(proxy(scope));
  } catch (err) {
    throw new Error(`Could not evaluate \`${expr.trim()}\`: ${err.message}`);
  }
}

function signal(initial) {
  function read() { return read._v; }
  read._v = initial;
  read.set = (v) => { read._v = v; };
  read.update = (fn) => { read._v = fn(read._v); };
  return read;
}

function loadHelperModule(file) {
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', js)(module.exports, require, module);
  const out = {};
  for (const [key, value] of Object.entries(module.exports)) {
    if (typeof value === 'function') out[key] = value;
  }
  return out;
}

const componentCache = new Map();

function loadComponent(file, helperFiles = []) {
  const cacheKey = `${file}::${helperFiles.join(',')}`;
  if (componentCache.has(cacheKey)) return componentCache.get(cacheKey);

  const helpers = { trackConversion() {} };
  for (const helper of helperFiles) Object.assign(helpers, loadHelperModule(helper));

  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const scope = {
    authService: {
      isAuthenticated() { return false; },
      getUserData() { return null; },
    },
  };
  const bindings = { signal, posts: POSTS, blogPosts: POSTS, ...helpers };
  const methods = [];
  const getters = [];

  function visit(node) {
    if (!ts.isClassDeclaration(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    for (const member of node.members) {
      if (ts.isConstructorDeclaration(member) || ts.isSetAccessor(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;
      const name = member.name.text;
      if (ts.isPropertyDeclaration(member) && member.initializer) {
        const init = member.initializer.getText(sf);
        try {
          scope[name] = evalInitializer(init, scope, bindings);
        } catch (err) {
          throw new Error(`${path.relative(ROOT, file)} field ${name}: ${err.message}`);
        }
      } else if (ts.isMethodDeclaration(member) && member.body) {
        methods.push(member);
      } else if (ts.isGetAccessor(member) && member.body) {
        getters.push(member);
      }
    }
  }
  visit(sf);

  for (const member of methods) {
    const name = member.name.text;
    const params = member.parameters.map((p) => p.name.getText(sf)).join(', ');
    try {
      scope[name] = compileFunction(name, params, member.body.getText(sf), helpers).bind(scope);
    } catch (err) {
      scope[name] = () => { throw new Error(`${name} could not be compiled: ${err.message}`); };
    }
  }
  for (const member of getters) {
    const name = member.name.text;
    try {
      const fn = compileFunction(name, '', member.body.getText(sf), helpers);
      Object.defineProperty(scope, name, {
        get() { return fn.call(scope); },
        enumerable: true,
        configurable: true,
      });
    } catch (err) {
      Object.defineProperty(scope, name, {
        get() { throw new Error(`${name} could not be compiled: ${err.message}`); },
        enumerable: true,
        configurable: true,
      });
    }
  }

  componentCache.set(cacheKey, scope);
  return scope;
}

function evalInitializer(expr, scope, bindings) {
  const js = transpileExpr(expr);
  const names = Object.keys(bindings);
  const fn = new Function(...names, `return (${js});`);
  return fn.apply(scope, names.map((n) => bindings[n]));
}

function compileFunction(name, params, body, helpers) {
  const src = `function ${name}(${params}) ${body}`;
  let js = ts.transpile(src, { target: ts.ScriptTarget.ES2022 });
  js = js.replace(/^\s*["']use strict["'];\s*/g, '');
  const names = Object.keys(helpers);
  const factory = new Function(...names, `${js}\nreturn ${name};`);
  return factory(...names.map((n) => helpers[n]));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// mode 'js' is a binding or @if/@for header. mode 'html' is a template body:
// apostrophes in copy ("You're") are not string quotes, but quotes inside tags
// and {{ }} still are.
function matchDelim(src, openIdx, mode = 'html') {
  const opens = { '(': ')', '{': '}', '[': ']' };
  const close = opens[src[openIdx]];
  if (!close) throw new Error(`expected a group at ${src.slice(openIdx, openIdx + 20)}`);
  const stack = [close];
  let quote = null;
  let inTag = false;
  let interp = 0;
  for (let j = openIdx + 1; j < src.length; j++) {
    const c = src[j];
    const quoting = mode === 'js' || inTag || interp > 0;
    if (quote) {
      if (c === '\\') { j++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (quoting && (c === '"' || c === "'" || c === '`')) { quote = c; continue; }
    if (mode !== 'js') {
      if (!inTag && c === '<' && /[A-Za-z/!]/.test(src[j + 1] || '')) { inTag = true; continue; }
      if (inTag && c === '>') { inTag = false; continue; }
      if (!inTag && c === '{' && src[j + 1] === '{') { interp++; j++; continue; }
      if (!inTag && interp && c === '}' && src[j + 1] === '}') { interp--; j++; continue; }
    }
    if (opens[c]) { stack.push(opens[c]); continue; }
    if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return j;
    }
  }
  throw new Error(`unclosed ${src[openIdx]} near ${src.slice(openIdx, openIdx + 80).replace(/\n/g, '\\n')}`);
}

function splitTop(src, sep) {
  const parts = [];
  let start = 0;
  let quote = null;
  const stack = [];
  const opens = { '(': ')', '{': '}', '[': ']' };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (opens[c]) { stack.push(opens[c]); continue; }
    if (stack.length && c === stack[stack.length - 1]) { stack.pop(); continue; }
    if (!stack.length && c === sep) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts;
}

function skipWs(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

function parseFor(src, i, scope) {
  const open = src.indexOf('(', i);
  const close = matchDelim(src, open, 'js');
  const header = src.slice(open + 1, close);
  const parts = splitTop(header, ';').map((p) => p.trim());
  const ofMatch = parts[0].match(/^([A-Za-z_$][\w$]*)\s+of\s+([\s\S]+)$/);
  if (!ofMatch) throw new Error(`bad @for (${header})`);
  const lets = [];
  for (const part of parts.slice(1)) {
    if (part.startsWith('track ') || part === 'track') continue;
    const lm = part.match(/^let\s+([A-Za-z_$][\w$]*)\s*=\s*(\$[A-Za-z]+)$/);
    if (!lm) throw new Error(`unsupported @for clause \`${part}\``);
    lets.push([lm[1], lm[2]]);
  }
  let k = skipWs(src, close + 1);
  if (src[k] !== '{') throw new Error('expected { after @for');
  const bodyEnd = matchDelim(src, k, 'html');
  const body = src.slice(k + 1, bodyEnd);
  const items = evalInScope(ofMatch[2], scope);
  if (!Array.isArray(items)) throw new Error(`@for ${ofMatch[2].trim()} did not return an array`);
  let html = '';
  items.forEach((item, index) => {
    const child = Object.create(scope);
    child[ofMatch[1]] = item;
    child.$index = index;
    child.$first = index === 0;
    child.$last = index === items.length - 1;
    child.$even = index % 2 === 0;
    child.$odd = index % 2 !== 0;
    child.$count = items.length;
    for (const [name, key] of lets) child[name] = child[key];
    html += renderNodes(body, child);
  });
  return { html, index: bodyEnd + 1 };
}

function parseIf(src, i, scope) {
  const branches = [];
  let k = i;
  const readBranch = (kind) => {
    let cond = 'true';
    if (kind !== 'else') {
      const open = src.indexOf('(', k);
      const close = matchDelim(src, open, 'js');
      cond = src.slice(open + 1, close);
      k = close + 1;
    } else {
      k += '@else'.length;
    }
    k = skipWs(src, k);
    if (src[k] !== '{') throw new Error(`expected { after @${kind}`);
    const bodyEnd = matchDelim(src, k, 'html');
    branches.push({ cond, body: src.slice(k + 1, bodyEnd) });
    k = bodyEnd + 1;
  };
  readBranch('if');
  for (;;) {
    const j = skipWs(src, k);
    if (src.startsWith('@else if', j)) { k = j; readBranch('else if'); continue; }
    if (src.startsWith('@else', j)) { k = j; readBranch('else'); continue; }
    break;
  }
  for (const branch of branches) {
    if (evalInScope(branch.cond, scope)) return { html: renderNodes(branch.body, scope), index: k };
  }
  return { html: '', index: k };
}

function readInterpolation(src, i) {
  let quote = null;
  for (let j = i + 2; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === '\\') { j++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '}' && src[j + 1] === '}') return { expr: src.slice(i + 2, j), after: j + 2 };
  }
  throw new Error(`unclosed interpolation near ${src.slice(i, i + 40)}`);
}

function readQuoted(src, i) {
  const q = src[i];
  let out = '';
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { out += src[j + 1] || ''; j++; continue; }
    if (src[j] === q) return { value: out, index: j + 1 };
    out += src[j];
  }
  throw new Error(`unclosed attribute near ${src.slice(i, i + 40)}`);
}

function parseStartTag(src, i) {
  const nameMatch = src.slice(i + 1).match(/^([A-Za-z][\w:-]*)/);
  if (!nameMatch) throw new Error(`bad tag near ${src.slice(i, i + 40)}`);
  const name = nameMatch[1];
  let j = i + 1 + name.length;
  const tag = {
    name,
    staticAttrs: {},
    bound: {},
    classBinds: {},
    attrBinds: {},
    events: {},
    ngClass: null,
    classExpr: null,
    lets: [],
    selfClosing: false,
    end: j,
  };
  while (j < src.length) {
    j = skipWs(src, j);
    if (src.startsWith('/>', j)) { tag.selfClosing = true; tag.end = j + 2; return tag; }
    if (src[j] === '>') { tag.end = j + 1; return tag; }
    if (src[j] === '#') {
      j++;
      while (j < src.length && !/[\s>=/]/.test(src[j])) j++;
      if (src[j] === '=') { const q = readQuoted(src, skipWs(src, j + 1)); j = q.index; }
      continue;
    }
    if (src[j] === '*') {
      j++;
      while (j < src.length && /[\w-]/.test(src[j])) j++;
      j = skipWs(src, j);
      if (src[j] === '=') { const q = readQuoted(src, skipWs(src, j + 1)); j = q.index; }
      continue;
    }
    if (src[j] === '[' || src[j] === '(') {
      const twoWay = src[j] === '[' && src[j + 1] === '(';
      const start = twoWay ? j + 2 : j + 1;
      const endChar = twoWay ? ')' : src[j] === '[' ? ']' : ')';
      const end = src.indexOf(twoWay ? ')]' : endChar, start);
      if (end === -1) throw new Error(`bad binding near ${src.slice(j, j + 40)}`);
      const raw = src.slice(start, end);
      j = end + (twoWay ? 2 : 1);
      j = skipWs(src, j);
      if (src[j] !== '=') throw new Error(`expected = after ${raw}`);
      const quoted = readQuoted(src, skipWs(src, j + 1));
      j = quoted.index;
      if (twoWay) { tag.bound[raw] = quoted.value; continue; }
      if (endChar === ')') { tag.events[raw] = quoted.value; continue; }
      if (raw === 'ngClass') { tag.ngClass = quoted.value; continue; }
      if (raw === 'class') { tag.classExpr = quoted.value; continue; }
      if (raw.startsWith('class.')) { tag.classBinds[raw.slice(6)] = quoted.value; continue; }
      if (raw.startsWith('attr.')) { tag.attrBinds[raw.slice(5)] = quoted.value; continue; }
      tag.bound[raw] = quoted.value;
      continue;
    }
    const attr = src.slice(j).match(/^([^\s=>/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/);
    if (!attr) throw new Error(`bad attribute near ${src.slice(j, j + 40)}`);
    const attrName = attr[1];
    const hasValue = attr[0].includes('=');
    j += attr[0].length;
    if (attrName.startsWith('let-')) {
      tag.lets.push({ name: attrName.slice(4), local: hasValue ? (attr[3] ?? attr[4] ?? attr[5]) : '$implicit' });
      continue;
    }
    tag.staticAttrs[attrName] = hasValue ? (attr[3] ?? attr[4] ?? attr[5] ?? '') : true;
  }
  throw new Error(`unclosed tag <${name}>`);
}

function findEndTag(src, contentStart, tagName) {
  let i = contentStart;
  let depth = 1;
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src[i] !== '<') { i++; continue; }
    if (src.startsWith('</', i)) {
      const m = src.slice(i + 2).match(/^([A-Za-z][\w:-]*)\s*>/);
      if (!m) throw new Error(`bad end tag near ${src.slice(i, i + 40)}`);
      const next = i + 2 + m[0].length;
      if (m[1].toLowerCase() === tagName) {
        depth--;
        if (depth === 0) return { innerEnd: i, end: next };
      }
      i = next;
      continue;
    }
    if (!/[A-Za-z]/.test(src[i + 1] || '')) { i++; continue; }
    const tag = parseStartTag(src, i);
    const lower = tag.name.toLowerCase();
    if (lower === tagName && !tag.selfClosing && !VOID.has(lower)) depth++;
    i = tag.end;
  }
  throw new Error(`missing </${tagName}>`);
}

function classFromNg(value) {
  if (!value) return [];
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(classFromNg);
  if (typeof value === 'object') return Object.keys(value).filter((k) => value[k]);
  return [];
}

function queryString(value) {
  if (!value || typeof value !== 'object') return '';
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) {
    if (item != null && item !== '') params.set(key, String(item));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

function linkFrom(tag, scope) {
  let href = null;
  if (tag.bound.routerLink != null || tag.staticAttrs.routerLink != null) {
    const rl = tag.bound.routerLink != null ? evalInScope(tag.bound.routerLink, scope) : tag.staticAttrs.routerLink;
    if (Array.isArray(rl)) href = `/${rl.map((p) => String(p).replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
    else if (rl != null) href = String(rl);
  } else if (tag.bound.href != null) {
    href = String(evalInScope(tag.bound.href, scope));
  } else if (typeof tag.staticAttrs.href === 'string') {
    href = tag.staticAttrs.href;
  }
  if (href != null && tag.bound.queryParams) href += queryString(evalInScope(tag.bound.queryParams, scope));
  if (href != null && (tag.bound.fragment || tag.staticAttrs.fragment)) {
    const frag = tag.bound.fragment ? evalInScope(tag.bound.fragment, scope) : tag.staticAttrs.fragment;
    if (frag) href += `#${frag}`;
  }
  if (href == null && tag.events.click) {
    const click = tag.events.click.trim();
    const scroll = click.match(/^scrollTo\('([^']+)'\)$/);
    const nav = click.match(/^trackNavClick\(([\s\S]+)\)$/);
    const plan = click.match(/^selectPlan\((\w+)\)$/);
    if (scroll) href = `#${scroll[1]}`;
    else if (nav) href = `#${evalInScope(nav[1], scope)}`;
    else if (plan) {
      const chosen = evalInScope(plan[1], scope);
      href = `/signup?plan=${encodeURIComponent(chosen.type)}`;
    }
  }
  return href;
}

function attrList(tag, scope, extras = {}) {
  const classes = [];
  if (typeof tag.staticAttrs.class === 'string') classes.push(tag.staticAttrs.class);
  if (typeof tag.staticAttrs.styleClass === 'string') classes.push(tag.staticAttrs.styleClass);
  for (const [name, expr] of Object.entries(tag.classBinds)) {
    if (evalInScope(expr, scope)) classes.push(name);
  }
  if (tag.classExpr) {
    const value = evalInScope(tag.classExpr, scope);
    if (typeof value === 'string' && value) classes.push(value);
  }
  if (tag.ngClass) classes.push(...classFromNg(evalInScope(tag.ngClass, scope)));
  if (extras.class) classes.push(extras.class);

  const parts = [];
  if (classes.length) parts.push(` class="${escapeHtml(classes.join(' '))}"`);
  for (const [name, value] of Object.entries(tag.staticAttrs)) {
    if (DROP_ATTRS.has(name) || name === 'class' || name === 'href' || name === 'target' || name === 'rel') continue;
    if (value === true) parts.push(` ${name}`);
    else parts.push(` ${name}="${value}"`);
  }
  for (const [name, expr] of Object.entries(tag.attrBinds)) {
    const value = evalInScope(expr, scope);
    if (value != null && value !== false) parts.push(` ${name}="${escapeHtml(value)}"`);
  }
  if (extras.href != null) parts.push(` href="${escapeHtml(extras.href)}"`);
  if (tag.bound.target || tag.staticAttrs.target) {
    const target = tag.bound.target ? evalInScope(tag.bound.target, scope) : tag.staticAttrs.target;
    if (target) parts.push(` target="${escapeHtml(target)}"`);
  }
  if (tag.bound.rel || tag.staticAttrs.rel) {
    const rel = tag.bound.rel ? evalInScope(tag.bound.rel, scope) : tag.staticAttrs.rel;
    if (rel) parts.push(` rel="${escapeHtml(rel)}"`);
  }
  return parts.join('');
}

function labelOf(tag, scope) {
  if (tag.bound.label != null) return String(evalInScope(tag.bound.label, scope) ?? '');
  if (typeof tag.staticAttrs.label === 'string') return tag.staticAttrs.label;
  if (tag.bound.value != null) return String(evalInScope(tag.bound.value, scope) ?? '');
  if (typeof tag.staticAttrs.value === 'string') return tag.staticAttrs.value;
  return '';
}

function renderBreakdown(tag, scope) {
  const title = tag.staticAttrs.title || 'Breakdown';
  const metric = tag.staticAttrs.metric || '';
  const rows = tag.bound.rows ? evalInScope(tag.bound.rows, scope) : [];
  const items = (rows || []).map((row) => `<li>${escapeHtml(row.label)}${row.secondary ? ` <span>${escapeHtml(row.secondary)}</span>` : ''} <span>${escapeHtml(row.value)}</span></li>`).join('');
  return `<section><h3>${escapeHtml(title)}</h3>${metric ? `<p>${escapeHtml(metric)}</p>` : ''}<ul>${items}</ul></section>`;
}

function renderTable(inner, scope) {
  const templates = [];
  let i = 0;
  while (i < inner.length) {
    if (inner.startsWith('<!--', i)) {
      const end = inner.indexOf('-->', i + 4);
      i = end === -1 ? inner.length : end + 3;
      continue;
    }
    if (inner.startsWith('<ng-template', i)) {
      const tag = parseStartTag(inner, i);
      const closed = findEndTag(inner, tag.end, 'ng-template');
      templates.push({ tag, body: inner.slice(tag.end, closed.innerEnd) });
      i = closed.end;
      continue;
    }
    i++;
  }
  let html = '<table>';
  for (const tpl of templates) {
    const slot = tpl.tag.staticAttrs.pTemplate;
    if (slot === 'header') html += `<thead>${renderNodes(tpl.body, scope)}</thead>`;
    if (slot === 'body') {
      const rows = scope.__tableRows || [];
      const implicit = tpl.tag.lets.find((item) => item.local === '$implicit');
      const varName = implicit ? implicit.name : 'row';
      html += '<tbody>';
      for (const row of rows) {
        const child = Object.create(scope);
        child[varName] = row;
        html += renderNodes(tpl.body, child);
      }
      html += '</tbody>';
    }
  }
  return `${html}</table>`;
}

function renderElement(src, i, scope) {
  const tag = parseStartTag(src, i);
  const name = tag.name.toLowerCase();
  if (tag.selfClosing || VOID.has(name)) {
    if (name === 'br') return { html: '<br>', index: tag.end };
    if (name === 'hr') return { html: '<hr>', index: tag.end };
    if (name === 'img' || name === 'input') return { html: `<${name}${attrList(tag, scope)}>`, index: tag.end };
    return { html: `<${name}${attrList(tag, scope)}>`, index: tag.end };
  }
  const closed = findEndTag(src, tag.end, name);
  const inner = src.slice(tag.end, closed.innerEnd);

  if (name === 'p-divider') return { html: '<hr>', index: closed.end };
  if (name === 'app-breakdown-card') return { html: renderBreakdown(tag, scope), index: closed.end };
  if (name === 'p-table') {
    const child = Object.create(scope);
    child.__tableRows = tag.bound.value ? evalInScope(tag.bound.value, scope) : [];
    return { html: renderTable(inner, child), index: closed.end };
  }
  if (name === 'ng-template') return { html: renderNodes(inner, scope), index: closed.end };
  if (name === 'p-tag' || name === 'p-button') {
    return { html: `<span${attrList(tag, scope)}>${escapeHtml(labelOf(tag, scope))}</span>`, index: closed.end };
  }

  const innerHtml = renderNodes(inner, scope);
  if (name === 'a' || name === 'button') {
    const href = linkFrom(tag, scope);
    const text = innerHtml.trim() ? innerHtml : escapeHtml(labelOf(tag, scope));
    if (href) {
      if (name === 'button') delete tag.staticAttrs.type;
      return { html: `<a${attrList(tag, scope, { href })}>${text}</a>`, index: closed.end };
    }
    if (name === 'button') return { html: `<span${attrList(tag, scope)}>${text}</span>`, index: closed.end };
    return { html: `<a${attrList(tag, scope)}>${text}</a>`, index: closed.end };
  }

  const mapped = name === 'p-card' || name === 'p-accordion' || name === 'p-accordion-panel' || name === 'p-accordion-content' || name === 'p-accordion-header'
    ? 'div'
    : name;
  return { html: `<${mapped}${attrList(tag, scope)}>${innerHtml}</${mapped}>`, index: closed.end };
}

function renderNodes(src, scope) {
  let i = 0;
  let out = '';
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith('@for', i) && !/[\w$]/.test(src[i + 4] || '')) {
      const block = parseFor(src, i, scope);
      out += block.html;
      i = block.index;
      continue;
    }
    if (src.startsWith('@if', i) && !/[\w$]/.test(src[i + 3] || '')) {
      const block = parseIf(src, i, scope);
      out += block.html;
      i = block.index;
      continue;
    }
    if (src.startsWith('{{', i)) {
      const interp = readInterpolation(src, i);
      const value = evalInScope(interp.expr, scope);
      out += value == null ? '' : escapeHtml(value);
      i = interp.after;
      continue;
    }
    if (src[i] === '<' && /[A-Za-z/]/.test(src[i + 1] || '')) {
      const el = renderElement(src, i, scope);
      out += el.html;
      i = el.index;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

const PAGES = {
  '': {
    template: 'src/app/pages/home/home.html',
    component: 'src/app/pages/home/home.ts',
    after(scope) {
      if (!scope.chartArea) scope.chartArea = '';
      if (!scope.chartLine) scope.chartLine = '';
      if (!scope.chartEnd) scope.chartEnd = [0, 0];
    },
  },
  pricing: {
    template: 'src/app/pages/pricing/pricing.html',
    component: 'src/app/pages/pricing/pricing.ts',
    helpers: ['src/app/pages/pricing/pricing-cta.ts'],
  },
  features: {
    template: 'src/app/pages/features/features.html',
    component: 'src/app/pages/features/features.ts',
  },
  docs: {
    template: 'src/app/pages/docs/docs.html',
    component: 'src/app/pages/docs/docs.ts',
  },
  'why-pulzivo': {
    template: 'src/app/pages/why-pulzivo/why-pulzivo.html',
    component: 'src/app/pages/why-pulzivo/why-pulzivo.ts',
  },
  'use-cases': {
    template: 'src/app/pages/use-cases/use-cases.html',
    component: 'src/app/pages/use-cases/use-cases.ts',
  },
  blog: {
    template: 'src/app/pages/blog/blog.html',
    component: 'src/app/pages/blog/blog.ts',
  },
  contact: {
    template: 'src/app/pages/contact/contact.html',
    component: 'src/app/pages/contact/contact.ts',
  },
  privacy: { template: 'src/app/pages/privacy/privacy.html' },
  terms: { template: 'src/app/pages/terms/terms.html' },
};

const pageCache = new Map();

function pageScope(routePath) {
  const page = PAGES[routePath];
  if (!page || !page.component) return null;
  const scope = loadComponent(
    path.join(ROOT, page.component),
    (page.helpers || []).map((file) => path.join(ROOT, file)),
  );
  if (page.after) page.after(scope);
  return scope;
}

function renderMarketingPage(routePath) {
  if (!Object.prototype.hasOwnProperty.call(PAGES, routePath)) return null;
  if (pageCache.has(routePath)) return pageCache.get(routePath);
  const page = PAGES[routePath];
  const template = fs.readFileSync(path.join(ROOT, page.template), 'utf8');
  const scope = page.component ? pageScope(routePath) : {};
  let html;
  try {
    html = `<div class="prerendered">${renderNodes(template, scope)}</div>`;
  } catch (err) {
    throw new Error(`prerender /${routePath}: ${err.message}`);
  }
  pageCache.set(routePath, html);
  return html;
}

module.exports = { renderMarketingPage, pageScope, PAGES };
