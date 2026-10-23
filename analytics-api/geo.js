'use strict';
/**
 * Country resolution helpers: IANA timezone -> ISO 3166 country (from tzdb, see
 * scripts/build-tz-country.js), ISO <-> English name, and flag emoji.
 * Ambiguous zones (UTC, GMT, Etc/*) intentionally resolve to null.
 */
const { zones: TZ_ISO } = require('./tz-country.json');

const NAME_OVERRIDES = {
  HK: 'Hong Kong', MO: 'Macao', PS: 'Palestine', CZ: 'Czechia', KR: 'South Korea',
  KP: 'North Korea', US: 'United States', GB: 'United Kingdom', MM: 'Myanmar',
  CI: "Côte d'Ivoire", CG: 'Congo - Brazzaville', CD: 'Congo - Kinshasa',
};
const ALIASES = {
  USA: 'US', 'U.S.': 'US', 'U.S.A.': 'US', 'United States of America': 'US', America: 'US',
  UK: 'GB', 'U.K.': 'GB', England: 'GB', Scotland: 'GB', Wales: 'GB', 'Great Britain': 'GB', Britain: 'GB',
  'Northern Ireland': 'GB', Russia: 'RU', 'Russian Federation': 'RU', 'Korea': 'KR', 'Republic of Korea': 'KR',
  'Hong Kong SAR China': 'HK', 'Hong Kong SAR': 'HK', Vietnam: 'VN', 'Viet Nam': 'VN', UAE: 'AE',
  'Czech Republic': 'CZ', Turkey: 'TR', Türkiye: 'TR', Iran: 'IR', Taiwan: 'TW', Holland: 'NL',
  'Ivory Coast': 'CI', Burma: 'MM', Macau: 'MO', 'Macao SAR China': 'MO', 'Palestinian Territories': 'PS',
};

// Exceptionally reserved / grouping codes ICU knows but that are not countries.
const NON_COUNTRY = new Set(['UK', 'EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ']);

let display = null;
try { display = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { display = null; }

const ISO_NAME = {};
const NAME_ISO = {};
const allCodes = new Set(Object.values(TZ_ISO));
for (const a of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') for (const b of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  const code = a + b;
  if (NON_COUNTRY.has(code)) continue;
  const name = display ? display.of(code) : null;
  if (name && name !== code) allCodes.add(code);
}
for (const code of allCodes) {
  const intlName = display ? display.of(code) : null;
  const name = NAME_OVERRIDES[code] || (intlName && intlName !== code ? intlName : code);
  ISO_NAME[code] = name;
  NAME_ISO[name.toLowerCase()] = code;
  if (intlName && intlName !== code) NAME_ISO[intlName.toLowerCase()] = code;
}
for (const [alias, code] of Object.entries(ALIASES)) NAME_ISO[alias.toLowerCase()] = code;

function isoForTimezone(tz) {
  if (!tz || typeof tz !== 'string') return null;
  return TZ_ISO[tz.trim()] || null;
}

function countryNameForIso(iso) {
  if (!iso) return null;
  return ISO_NAME[String(iso).toUpperCase()] || null;
}

function countryForTimezone(tz) {
  return countryNameForIso(isoForTimezone(tz));
}

function isoForCountry(country) {
  if (!country) return null;
  const s = String(country).trim();
  if (/^[A-Za-z]{2}$/.test(s) && ISO_NAME[s.toUpperCase()]) return s.toUpperCase();
  return NAME_ISO[s.toLowerCase()] || null;
}

function flagForIso(iso) {
  if (iso == null) return '🌐';
  if (!iso || !/^[A-Z]{2}$/.test(iso)) return '🏳️';
  return String.fromCodePoint(...[...iso].map((c) => 127397 + c.charCodeAt(0)));
}

module.exports = { TZ_ISO, isoForTimezone, countryForTimezone, countryNameForIso, isoForCountry, flagForIso };
