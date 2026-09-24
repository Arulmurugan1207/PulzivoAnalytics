'use strict';

/**
 * Minimal in-memory Mongo stand-in for route tests.
 * Supports find / count / distinct / insert / aggregate used by ingest + metrics.
 */

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value), (key, val) => {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return val;
  });
}

function getPath(doc, path) {
  if (!path) return doc;
  return String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), doc);
}

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && value.trim() !== '') return toMs(n);
    const d = Date.parse(value);
    return Number.isNaN(d) ? null : d;
  }
  return null;
}

function kind(value) {
  if (value instanceof Date) return 'date';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'string') return 'string';
  return typeof value;
}

function compareGte(docVal, filterVal) {
  if (kind(docVal) !== kind(filterVal)) return false;
  const a = toMs(docVal);
  const b = toMs(filterVal);
  if (a != null && b != null) return a >= b;
  return docVal >= filterVal;
}

function compareLte(docVal, filterVal) {
  if (kind(docVal) !== kind(filterVal)) return false;
  const a = toMs(docVal);
  const b = toMs(filterVal);
  if (a != null && b != null) return a <= b;
  return docVal <= filterVal;
}

function mongoTypeMatches(value, want) {
  const actual = value instanceof Date ? 'date'
    : value === null ? 'null'
      : value === undefined ? 'missing'
        : typeof value === 'number' ? 'double'
          : typeof value === 'string' ? 'string'
            : typeof value === 'boolean' ? 'bool'
              : Array.isArray(value) ? 'array'
                : typeof value === 'object' ? 'object'
                  : 'unknown';
  if (want === 'number') return actual === 'double' || actual === 'int' || actual === 'long' || actual === 'decimal';
  return actual === want;
}

function matchOp(docVal, op) {
  if (op instanceof RegExp) return typeof docVal === 'string' && op.test(docVal);
  if (op && typeof op === 'object' && !Array.isArray(op) && !(op instanceof Date)) {
    if (op.$regex) {
      const rx = op.$regex instanceof RegExp ? op.$regex : new RegExp(op.$regex, op.$options || '');
      return typeof docVal === 'string' && rx.test(docVal);
    }
    if (Object.prototype.hasOwnProperty.call(op, '$in')) {
      return (op.$in || []).some((v) => (v instanceof RegExp ? v.test(String(docVal ?? '')) : v === docVal));
    }
    if (Object.prototype.hasOwnProperty.call(op, '$nin')) {
      if (docVal == null || docVal === '') return !(op.$nin || []).includes(docVal);
      return !(op.$nin || []).includes(docVal);
    }
    if (Object.prototype.hasOwnProperty.call(op, '$ne')) return docVal !== op.$ne;
    if (Object.prototype.hasOwnProperty.call(op, '$exists')) {
      return op.$exists ? docVal !== undefined : docVal === undefined;
    }
    let ok = true;
    if (Object.prototype.hasOwnProperty.call(op, '$gte')) ok = ok && compareGte(docVal, op.$gte);
    if (Object.prototype.hasOwnProperty.call(op, '$lte')) ok = ok && compareLte(docVal, op.$lte);
    if (Object.prototype.hasOwnProperty.call(op, '$gt')) ok = ok && (toMs(docVal) ?? docVal) > (toMs(op.$gt) ?? op.$gt);
    if (Object.prototype.hasOwnProperty.call(op, '$lt')) ok = ok && (toMs(docVal) ?? docVal) < (toMs(op.$lt) ?? op.$lt);
    if (Object.prototype.hasOwnProperty.call(op, '$type')) ok = ok && mongoTypeMatches(docVal, op.$type);
    return ok;
  }
  return docVal === op;
}

function matches(doc, filter) {
  if (!filter || !Object.keys(filter).length) return true;
  if (filter.$and) return filter.$and.every((part) => matches(doc, part));
  if (filter.$or) return filter.$or.some((part) => matches(doc, part));
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$and') return value.every((part) => matches(doc, part));
    if (key === '$or') return value.some((part) => matches(doc, part));
    if (value && typeof value === 'object' && value.$elemMatch) {
      const arr = getPath(doc, key);
      return Array.isArray(arr) && arr.some((item) => matches({ [key]: item, ...item }, value.$elemMatch));
    }
    return matchOp(getPath(doc, key), value);
  });
}

class MemoryCollection {
  constructor(docs = []) {
    this.docs = docs.map((d) => ({ ...d }));
  }

  async insertMany(docs) {
    this.docs.push(...docs.map((d) => ({ ...d })));
    return { insertedCount: docs.length };
  }

  async findOne(filter = {}) {
    return this.docs.find((d) => matches(d, filter)) || null;
  }

  async countDocuments(filter = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }

  async distinct(field, filter = {}) {
    const values = new Set();
    for (const doc of this.docs.filter((d) => matches(d, filter))) {
      const value = getPath(doc, field);
      if (value != null) values.add(value);
    }
    return [...values];
  }

  find(filter = {}) {
    let rows = this.docs.filter((d) => matches(d, filter)).map((d) => ({ ...d }));
    const cursor = {
      sort(spec = {}) {
        const entries = Object.entries(spec);
        rows.sort((a, b) => {
          for (const [field, dir] of entries) {
            const av = toMs(getPath(a, field)) ?? getPath(a, field);
            const bv = toMs(getPath(b, field)) ?? getPath(b, field);
            if (av < bv) return dir < 0 ? 1 : -1;
            if (av > bv) return dir < 0 ? -1 : 1;
          }
          return 0;
        });
        return cursor;
      },
      skip(n) {
        rows = rows.slice(n);
        return cursor;
      },
      limit(n) {
        rows = rows.slice(0, n);
        return cursor;
      },
      project() {
        return cursor;
      },
      async toArray() {
        return rows.map(clone);
      },
    };
    return cursor;
  }

  aggregate(pipeline) {
    const { runPipeline } = require('./memory-agg');
    const rows = runPipeline(this.docs.map((doc) => clone(doc)), pipeline);
    return {
      async toArray() {
        return rows.map((doc) => clone(doc));
      },
    };
  }

  async createIndex(key, options = {}) {
    if (!this.indexes) this.indexes = [];
    this.indexes.push({ key, name: options.name || null });
    return options.name || 'index';
  }
}

function createMemoryDb(seed = {}) {
  const cols = {};
  for (const [name, docs] of Object.entries(seed)) {
    cols[name] = new MemoryCollection(docs);
  }
  return {
    collection(name) {
      if (!cols[name]) cols[name] = new MemoryCollection();
      return cols[name];
    },
  };
}

module.exports = { MemoryCollection, createMemoryDb, matches, getPath, clone };
