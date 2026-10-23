'use strict';

/**
 * Aggregation subset used by analytics-api route tests.
 * Semantics follow MongoDB for the operators the dashboard pipelines emit.
 */

const { matches, getPath } = require('./memory-db');

const REMOVE = Symbol('remove');

function bsonType(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (value instanceof Date) return 'date';
  if (typeof value === 'number') return 'double';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'bool';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

function isNullish(value) {
  return value === null || value === undefined;
}

function valuesEqual(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (isNullish(a) && isNullish(b)) return true;
  return a === b;
}

function truthy(value) {
  return !(value === false || value === null || value === undefined || value === 0);
}

function cmp(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !(a instanceof Date) && !(b instanceof Date) && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = Object.keys(a);
    for (const key of keys) {
      const c = cmp(a[key], b[key]);
      if (c) return c;
    }
    return 0;
  }
  const rank = (value) => {
    if (isNullish(value)) return 0;
    if (typeof value === 'number') return 1;
    if (typeof value === 'string') return 2;
    if (typeof value === 'object' && !(value instanceof Date)) return 3;
    if (value instanceof Date) return 4;
    return 5;
  };
  return rank(a) - rank(b);
}

function stableKey(value) {
  if (value instanceof Date) return `d:${value.toISOString()}`;
  if (value === undefined) return 'u:';
  if (value === null) return 'n:';
  if (typeof value === 'object') return `o:${JSON.stringify(value)}`;
  return `${typeof value}:${String(value)}`;
}

function evalExpr(doc, expr, vars) {
  if (expr === null || expr === undefined) return expr ?? null;
  if (typeof expr === 'string') {
    if (expr.startsWith('$$')) {
      const name = expr.slice(2);
      if (name === 'REMOVE') return REMOVE;
      if (name === 'NOW') return new Date();
      if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
      return null;
    }
    if (expr.startsWith('$')) return getPath(doc, expr.slice(1));
    return expr;
  }
  if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
  if (expr instanceof Date) return expr;
  if (Array.isArray(expr)) return expr.map((item) => evalExpr(doc, item, vars));
  if (typeof expr !== 'object') return expr;

  const keys = Object.keys(expr);
  if (keys.length === 1 && keys[0].startsWith('$')) {
    return evalOp(doc, keys[0], expr[keys[0]], vars);
  }
  const out = {};
  for (const key of keys) {
    const value = evalExpr(doc, expr[key], vars);
    if (value !== REMOVE) out[key] = value;
  }
  return out;
}

function pair(doc, arg, vars) {
  if (!Array.isArray(arg) || arg.length < 2) {
    throw new Error('aggregation operator expects an array of two expressions');
  }
  return [evalExpr(doc, arg[0], vars), evalExpr(doc, arg[1], vars)];
}

function convertValue(input, to, onError, onNull) {
  if (input === null || input === undefined) return onNull;
  try {
    if (to === 'double' || to === 'int' || to === 'long' || to === 'decimal') {
      if (typeof input === 'string' && input.trim() === '') throw new Error('empty number');
      const n = typeof input === 'number' ? input : Number(String(input).trim());
      if (!Number.isFinite(n)) throw new Error('bad number');
      return n;
    }
    if (to === 'string') {
      if (input instanceof Date) return input.toISOString();
      if (typeof input === 'object') throw new Error('object to string');
      return String(input);
    }
    if (to === 'date') {
      if (input instanceof Date) {
        if (Number.isNaN(input.getTime())) throw new Error('bad date');
        return input;
      }
      if (typeof input === 'number') {
        const d = new Date(input);
        if (Number.isNaN(d.getTime())) throw new Error('bad date');
        return d;
      }
      if (typeof input === 'string') {
        const d = new Date(input);
        if (Number.isNaN(d.getTime())) throw new Error('bad date');
        return d;
      }
      throw new Error('bad date');
    }
    if (to === 'bool') return Boolean(input);
    throw new Error(`unsupported $convert to ${to}`);
  } catch (err) {
    if (onError !== undefined) return onError;
    throw err;
  }
}

function formatDate(date, format) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const map = {
    '%Y': String(date.getUTCFullYear()),
    '%m': pad(date.getUTCMonth() + 1),
    '%d': pad(date.getUTCDate()),
    '%H': pad(date.getUTCHours()),
    '%M': pad(date.getUTCMinutes()),
    '%S': pad(date.getUTCSeconds()),
  };
  return format.replace(/%Y|%m|%d|%H|%M|%S/g, (token) => map[token]);
}

function evalOp(doc, op, arg, vars) {
  switch (op) {
    case '$literal':
      return arg;
    case '$ifNull': {
      const list = Array.isArray(arg) ? arg : [arg];
      for (let i = 0; i < list.length - 1; i += 1) {
        const value = evalExpr(doc, list[i], vars);
        if (!isNullish(value)) return value;
      }
      return evalExpr(doc, list[list.length - 1], vars);
    }
    case '$cond': {
      if (Array.isArray(arg)) {
        return truthy(evalExpr(doc, arg[0], vars))
          ? evalExpr(doc, arg[1], vars)
          : evalExpr(doc, arg[2], vars);
      }
      return truthy(evalExpr(doc, arg.if, vars))
        ? evalExpr(doc, arg.then, vars)
        : evalExpr(doc, arg.else, vars);
    }
    case '$switch': {
      for (const branch of arg.branches || []) {
        if (truthy(evalExpr(doc, branch.case, vars))) return evalExpr(doc, branch.then, vars);
      }
      if (Object.prototype.hasOwnProperty.call(arg, 'default')) return evalExpr(doc, arg.default, vars);
      return null;
    }
    case '$let': {
      const computed = { ...vars };
      for (const [name, valueExpr] of Object.entries(arg.vars || {})) {
        computed[name] = evalExpr(doc, valueExpr, vars);
      }
      return evalExpr(doc, arg.in, computed);
    }
    case '$and':
      return (arg || []).every((item) => truthy(evalExpr(doc, item, vars)));
    case '$or':
      return (arg || []).some((item) => truthy(evalExpr(doc, item, vars)));
    case '$not':
      return !truthy(evalExpr(doc, Array.isArray(arg) ? arg[0] : arg, vars));
    case '$eq': {
      const [a, b] = pair(doc, arg, vars);
      return valuesEqual(a, b);
    }
    case '$ne': {
      const [a, b] = pair(doc, arg, vars);
      return !valuesEqual(a, b);
    }
    case '$gt': {
      const [a, b] = pair(doc, arg, vars);
      if (isNullish(a) || isNullish(b)) return false;
      return cmp(a, b) > 0;
    }
    case '$gte': {
      const [a, b] = pair(doc, arg, vars);
      if (isNullish(a) || isNullish(b)) return false;
      return cmp(a, b) >= 0;
    }
    case '$lt': {
      const [a, b] = pair(doc, arg, vars);
      if (isNullish(a) || isNullish(b)) return false;
      return cmp(a, b) < 0;
    }
    case '$lte': {
      const [a, b] = pair(doc, arg, vars);
      if (isNullish(a) || isNullish(b)) return false;
      return cmp(a, b) <= 0;
    }
    case '$in': {
      const needle = evalExpr(doc, arg[0], vars);
      const hay = evalExpr(doc, arg[1], vars);
      return Array.isArray(hay) && hay.some((item) => valuesEqual(item, needle));
    }
    case '$type':
      return bsonType(evalExpr(doc, arg, vars));
    case '$toString':
      return convertValue(evalExpr(doc, arg, vars), 'string', undefined, null);
    case '$toDouble':
      return convertValue(evalExpr(doc, arg, vars), 'double', undefined, null);
    case '$toDate':
      return convertValue(evalExpr(doc, arg, vars), 'date', undefined, null);
    case '$toLower': {
      const value = evalExpr(doc, arg, vars);
      if (isNullish(value)) return null;
      return String(value).toLowerCase();
    }
    case '$trim': {
      const input = evalExpr(doc, arg.input, vars);
      if (isNullish(input)) return null;
      return String(input).trim();
    }
    case '$strLenCP': {
      const value = evalExpr(doc, arg, vars);
      if (typeof value !== 'string') throw new Error('$strLenCP requires a string');
      return [...value].length;
    }
    case '$concat': {
      const parts = [];
      for (const item of arg) {
        const value = evalExpr(doc, item, vars);
        if (isNullish(value)) return null;
        parts.push(String(value));
      }
      return parts.join('');
    }
    case '$convert': {
      const input = evalExpr(doc, arg.input, vars);
      const onError = Object.prototype.hasOwnProperty.call(arg, 'onError') ? arg.onError : undefined;
      const onNull = Object.prototype.hasOwnProperty.call(arg, 'onNull') ? arg.onNull : null;
      return convertValue(input, arg.to, onError, onNull);
    }
    case '$regexMatch': {
      const input = evalExpr(doc, arg.input, vars);
      if (input == null) return false;
      if (typeof input !== 'string') throw new Error('$regexMatch requires a string input');
      const flags = String(arg.options || '').includes('i') ? 'i' : '';
      return new RegExp(arg.regex, flags).test(input);
    }
    case '$dateToString': {
      const date = evalExpr(doc, arg.date, vars);
      return formatDate(date, arg.format || '%Y-%m-%d');
    }
    case '$dayOfWeek': {
      const date = evalExpr(doc, arg, vars);
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
      return date.getUTCDay() + 1;
    }
    case '$dateTrunc': {
      const date = evalExpr(doc, arg.date, vars);
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
      if (arg.unit === 'day') {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      }
      if (arg.unit === 'hour') {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()));
      }
      throw new Error(`unsupported $dateTrunc unit ${arg.unit}`);
    }
    case '$dateSubtract': {
      const start = evalExpr(doc, arg.startDate, vars);
      const amount = evalExpr(doc, arg.amount, vars);
      if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
      const next = new Date(start.getTime());
      if (arg.unit === 'day') next.setUTCDate(next.getUTCDate() - Number(amount || 0));
      else if (arg.unit === 'hour') next.setUTCHours(next.getUTCHours() - Number(amount || 0));
      else throw new Error(`unsupported $dateSubtract unit ${arg.unit}`);
      return next;
    }
    case '$add':
      return (arg || []).reduce((sum, item) => sum + Number(evalExpr(doc, item, vars) || 0), 0);
    case '$subtract': {
      const [a, b] = pair(doc, arg, vars);
      if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
      if (a instanceof Date && typeof b === 'number') return new Date(a.getTime() - b);
      return Number(a) - Number(b);
    }
    case '$multiply':
      return (arg || []).reduce((product, item) => product * Number(evalExpr(doc, item, vars)), 1);
    case '$divide': {
      const [a, b] = pair(doc, arg, vars);
      return Number(a) / Number(b);
    }
    case '$split': {
      const [value, sep] = pair(doc, arg, vars);
      if (value == null) return null;
      return String(value).split(String(sep));
    }
    case '$arrayElemAt': {
      const [arr, index] = pair(doc, arg, vars);
      if (!Array.isArray(arr)) return null;
      const i = index < 0 ? arr.length + index : index;
      return arr[i];
    }
    case '$substrCP': {
      const value = evalExpr(doc, arg[0], vars);
      const start = evalExpr(doc, arg[1], vars);
      const len = evalExpr(doc, arg[2], vars);
      if (value == null) return null;
      return [...String(value)].slice(start, start + len).join('');
    }
    default:
      throw new Error(`unsupported aggregation operator ${op}`);
  }
}

function initAcc(spec) {
  const op = Object.keys(spec)[0];
  if (op === '$sum') return { op, sum: 0 };
  if (op === '$avg') return { op, sum: 0, n: 0 };
  if (op === '$min' || op === '$max') return { op, value: undefined, set: false };
  if (op === '$first') return { op, value: undefined, set: false };
  if (op === '$last') return { op, value: undefined, set: false };
  if (op === '$push') return { op, items: [] };
  if (op === '$addToSet') return { op, items: [], keys: new Set() };
  throw new Error(`unsupported accumulator ${op}`);
}

function numericAcc(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function updateAcc(state, spec, doc) {
  const op = Object.keys(spec)[0];
  const value = evalExpr(doc, spec[op], {});
  if (op === '$sum') {
    if (numericAcc(value)) state.sum += value;
    return;
  }
  if (op === '$avg') {
    if (numericAcc(value)) {
      state.sum += value;
      state.n += 1;
    }
    return;
  }
  if (op === '$min' || op === '$max') {
    if (isNullish(value) || value === REMOVE) return;
    if (!state.set || (op === '$min' ? cmp(value, state.value) < 0 : cmp(value, state.value) > 0)) {
      state.value = value;
      state.set = true;
    }
    return;
  }
  if (op === '$first') {
    if (!state.set && value !== REMOVE) {
      state.value = value;
      state.set = true;
    }
    return;
  }
  if (op === '$last') {
    if (value !== REMOVE) {
      state.value = value;
      state.set = true;
    }
    return;
  }
  if (op === '$push') {
    if (value !== REMOVE) state.items.push(value);
    return;
  }
  if (op === '$addToSet') {
    if (value === REMOVE || isNullish(value)) return;
    const key = stableKey(value);
    if (!state.keys.has(key)) {
      state.keys.add(key);
      state.items.push(value);
    }
  }
}

function finalizeAcc(state) {
  if (state.op === '$sum') return state.sum;
  if (state.op === '$avg') return state.n ? state.sum / state.n : null;
  if (state.op === '$min' || state.op === '$max' || state.op === '$first' || state.op === '$last') {
    return state.set ? state.value : null;
  }
  if (state.op === '$push' || state.op === '$addToSet') return state.items;
  return null;
}

function cmpSort(a, b) {
  if (isNullish(a) && isNullish(b)) return 0;
  if (isNullish(a)) return -1;
  if (isNullish(b)) return 1;
  return cmp(a, b);
}

function applyStage(rows, stage) {
  const op = Object.keys(stage)[0];
  const spec = stage[op];
  if (op === '$match') return rows.filter((doc) => matches(doc, spec));
  if (op === '$addFields' || op === '$set') {
    return rows.map((doc) => {
      const extra = {};
      for (const [key, expr] of Object.entries(spec)) {
        const value = evalExpr(doc, expr, {});
        if (value !== REMOVE) extra[key] = value;
      }
      return { ...doc, ...extra };
    });
  }
  if (op === '$group') {
    const groups = new Map();
    const fields = Object.keys(spec).filter((key) => key !== '_id');
    for (const doc of rows) {
      const idVal = evalExpr(doc, spec._id, {});
      const key = stableKey(idVal);
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = { _id: idVal, acc: {} };
        for (const field of fields) bucket.acc[field] = initAcc(spec[field]);
        groups.set(key, bucket);
      }
      for (const field of fields) updateAcc(bucket.acc[field], spec[field], doc);
    }
    return [...groups.values()].map((bucket) => {
      const out = { _id: bucket._id };
      for (const field of fields) out[field] = finalizeAcc(bucket.acc[field]);
      return out;
    });
  }
  if (op === '$sort') {
    const entries = Object.entries(spec);
    const copy = rows.slice();
    copy.sort((a, b) => {
      for (const [field, dir] of entries) {
        const c = cmpSort(getPath(a, field), getPath(b, field));
        if (c) return dir < 0 ? -c : c;
      }
      return 0;
    });
    return copy;
  }
  if (op === '$skip') return rows.slice(Number(spec) || 0);
  if (op === '$limit') return rows.slice(0, Number(spec) || 0);
  if (op === '$count') {
    if (!rows.length) return [];
    return [{ [spec]: rows.length }];
  }
  if (op === '$facet') {
    const out = {};
    for (const [name, pipeline] of Object.entries(spec)) {
      out[name] = runPipeline(rows, pipeline);
    }
    return [out];
  }
  if (op === '$project') {
    return rows.map((doc) => {
      const out = {};
      const keys = Object.keys(spec);
      const inclusion = keys.every((key) => spec[key] === 1 || spec[key] === 0 || key === '_id');
      if (inclusion && keys.some((key) => spec[key] === 1)) {
        for (const key of keys) {
          if (spec[key] === 1) out[key] = getPath(doc, key);
        }
        return out;
      }
      for (const [key, expr] of Object.entries(spec)) {
        if (expr === 0) continue;
        out[key] = expr === 1 ? getPath(doc, key) : evalExpr(doc, expr, {});
      }
      return out;
    });
  }
  if (op === '$unwind') {
    const path = typeof spec === 'string' ? spec : spec.path;
    const preserve = typeof spec === 'object' && spec.preserveNullAndEmptyArrays;
    const field = path.replace(/^\$/, '');
    const out = [];
    for (const doc of rows) {
      const value = getPath(doc, field);
      if (Array.isArray(value) && value.length) {
        for (const item of value) out.push({ ...doc, [field]: item });
      } else if (preserve) out.push({ ...doc, [field]: null });
    }
    return out;
  }
  throw new Error(`unsupported aggregation stage ${op}`);
}

function runPipeline(docs, pipeline) {
  let rows = docs;
  for (const stage of pipeline) rows = applyStage(rows, stage);
  return rows;
}

module.exports = { runPipeline, bsonType, evalExpr };
