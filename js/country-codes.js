(function (global) {
  'use strict';
  // IMDb/Cinemeta country name -> ISO 3166-1 alpha-2 code. Matched case-insensitively after trimming.
  const NAMES = {
    'united states': 'US', 'united states of america': 'US', 'usa': 'US', 'us': 'US',
    'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB',
    'south korea': 'KR', 'korea, south': 'KR', 'korea': 'KR',
    'north korea': 'KP', 'korea, north': 'KP',
    'russia': 'RU', 'soviet union': 'RU', 'ussr': 'RU',
    'west germany': 'DE', 'east germany': 'DE', 'germany': 'DE',
    'czechoslovakia': 'CZ', 'czech republic': 'CZ', 'czechia': 'CZ',
    'hong kong': 'HK',
    'taiwan': 'TW',
    'china': 'CN',
    'japan': 'JP',
    'france': 'FR',
    'spain': 'ES',
    'italy': 'IT',
    'canada': 'CA',
    'australia': 'AU',
    'new zealand': 'NZ',
    'ireland': 'IE',
    'india': 'IN',
    'mexico': 'MX',
    'brazil': 'BR',
    'argentina': 'AR',
    'chile': 'CL',
    'colombia': 'CO',
    'sweden': 'SE',
    'norway': 'NO',
    'denmark': 'DK',
    'finland': 'FI',
    'iceland': 'IS',
    'netherlands': 'NL',
    'belgium': 'BE',
    'austria': 'AT',
    'switzerland': 'CH',
    'poland': 'PL',
    'hungary': 'HU',
    'romania': 'RO',
    'bulgaria': 'BG',
    'greece': 'GR',
    'portugal': 'PT',
    'turkey': 'TR',
    'israel': 'IL',
    'iran': 'IR',
    'egypt': 'EG',
    'south africa': 'ZA',
    'nigeria': 'NG',
    'morocco': 'MA',
    'thailand': 'TH',
    'vietnam': 'VN',
    'philippines': 'PH',
    'indonesia': 'ID',
    'malaysia': 'MY',
    'singapore': 'SG',
    'ukraine': 'UA',
    'serbia': 'RS',
    'croatia': 'HR',
  };

  function toCode(name) {
    if (!name) return null;
    return NAMES[name.trim().toLowerCase()] || null;
  }

  const api = { toCode };
  if (typeof module !== 'undefined') module.exports = api;
  global.LBCountries = api;
})(typeof window !== 'undefined' ? window : globalThis);
