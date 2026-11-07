/**
 * Choices of the video chat's public profile (architecture 4.7): countries (ISO 3166-1 alpha-2)
 * and languages (ISO 639-1), named in the reader's language by Intl. Shared by server and client.
 */

const COUNTRIES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR ' +
  'BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ ' +
  'EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW ' +
  'GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY ' +
  'KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV ' +
  'MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
  'QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG ' +
  'TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

const LANGUAGES = (
  'ar bg bn ca cs da de el en es et eu fa fi fr ga gl he hi hr hu id it ja ko lt lv ms nl no pl ' +
  'pt ro ru sk sl sq sr sv sw th tl tr uk ur vi zh'
).split(' ');

type Option = { value: string; label: string };

function sorted(codes: string[], name: (code: string) => string, locale: string): Option[] {
  const collator = new Intl.Collator(locale);
  return codes
    .map((value) => ({ value, label: name(value) }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

export function countryName(code: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
}

export function languageName(code: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
}

export function countryOptions(locale: string): Option[] {
  return sorted(COUNTRIES, (code) => countryName(code, locale), locale);
}

export function languageOptions(locale: string): Option[] {
  return sorted(LANGUAGES, (code) => languageName(code, locale), locale);
}

export function isCountry(code: string): boolean {
  return COUNTRIES.includes(code);
}

export function isLanguage(code: string): boolean {
  return LANGUAGES.includes(code);
}

/** The country's flag as emoji (regional indicator letters). */
export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1a5 + letter.charCodeAt(0)));
}
