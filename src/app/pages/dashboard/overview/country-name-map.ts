/**
 * Maps backend country names (from timezoneCountryMap.js / IP lookup)
 * to the exact names used in public/world.geojson.
 *
 * Only entries that DIFFER are listed here — countries that match exactly
 * (e.g. "Canada", "Germany", "France") need no entry.
 *
 * Small island nations / territories not present in the GeoJSON at all
 * are mapped to their nearest sovereign state so they still light up the map.
 */
export const COUNTRY_NAME_TO_GEOJSON: Record<string, string> = {

  // ── Direct renames (different name in GeoJSON) ──────────────────────────
  'United States':                    'USA',
  'United Kingdom':                   'England',
  'Tanzania':                         'United Republic of Tanzania',
  'Serbia':                           'Republic of Serbia',
  'North Macedonia':                  'Macedonia',
  'Eswatini':                         'Swaziland',
  'Timor-Leste':                      'East Timor',
  'Guinea-Bissau':                    'Guinea Bissau',
  'Bahamas':                          'The Bahamas',
  'Palestine':                        'West Bank',

  // ── Territories → sovereign state (not in GeoJSON as own polygon) ───────

  // UK territories
  'Anguilla':                         'England',
  'Bermuda':                          'England',
  'British Indian Ocean Territory':   'England',
  'British Virgin Islands':           'England',
  'Cayman Islands':                   'England',
  'Falkland Islands':                 'Falkland Islands',   // IS in GeoJSON
  'Gibraltar':                        'England',
  'Guernsey':                         'England',
  'Isle of Man':                      'England',
  'Jersey':                           'England',
  'Montserrat':                       'England',
  'Pitcairn Islands':                 'England',
  'Saint Helena':                     'England',
  'Turks and Caicos Islands':         'England',

  // US territories
  'Guam':                             'USA',
  'Northern Mariana Islands':         'USA',
  'Puerto Rico':                      'Puerto Rico',        // IS in GeoJSON
  'U.S. Virgin Islands':              'USA',
  'Wake Island':                      'USA',

  // French territories
  'French Guiana':                    'France',
  'French Polynesia':                 'France',
  'French Southern Territories':      'French Southern and Antarctic Lands',
  'Guadeloupe':                       'France',
  'Martinique':                       'France',
  'Mayotte':                          'France',
  'New Caledonia':                    'New Caledonia',      // IS in GeoJSON
  'Réunion':                          'France',
  'Saint Barthelemy':                 'France',
  'Saint Martin':                     'France',
  'Wallis and Futuna':                'France',

  // Dutch territories
  'Aruba':                            'Netherlands',
  'Bonaire':                          'Netherlands',
  'Curaçao':                          'Netherlands',
  'Sint Maarten':                     'Netherlands',

  // Micro-states / island nations not in GeoJSON
  'Andorra':                          'Spain',              // tiny enclave
  'Antigua and Barbuda':              'Trinidad and Tobago',
  'Bahrain':                          'Qatar',              // nearest Gulf state polygon
  'Barbados':                         'Trinidad and Tobago',
  'Cape Verde':                       'Senegal',            // nearest mainland
  'Christmas Island':                 'Australia',
  'Cocos Islands':                    'Australia',
  'Comoros':                          'Mozambique',
  'Cook Islands':                     'New Zealand',
  'Dominica':                         'Trinidad and Tobago',
  'Faroe Islands':                    'Denmark',
  'Grenada':                          'Trinidad and Tobago',
  'Hong Kong':                        'China',
  'Kiribati':                         'Papua New Guinea',
  'Liechtenstein':                    'Switzerland',
  'Macau':                            'China',
  'Maldives':                         'Sri Lanka',
  'Malta':                            'Italy',
  'Marshall Islands':                 'Papua New Guinea',
  'Mauritius':                        'Madagascar',
  'Micronesia':                       'Papua New Guinea',
  'Monaco':                           'France',
  'Nauru':                            'Papua New Guinea',
  'Niue':                             'New Zealand',
  'Palau':                            'Philippines',
  'Saint Kitts and Nevis':            'Trinidad and Tobago',
  'Saint Lucia':                      'Trinidad and Tobago',
  'Saint Vincent and the Grenadines': 'Trinidad and Tobago',
  'Samoa':                            'Vanuatu',
  'San Marino':                       'Italy',
  'Seychelles':                       'Madagascar',
  'Singapore':                        'Malaysia',
  'Tonga':                            'Vanuatu',
  'Tuvalu':                           'Papua New Guinea',
  'Vanuatu':                          'Vanuatu',            // IS in GeoJSON
  'Vatican City':                     'Italy',

  // South Atlantic / Antarctic
  'South Georgia':                    'Falkland Islands',

  // Åland Islands → Finland
  'Åland Islands':                    'Finland',
};
