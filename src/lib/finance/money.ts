import Decimal from "decimal.js";

/**
 * Money is always handled as integer minor units (paise, cents, ...).
 * Conversions to/from user input go through decimal.js — never through
 * binary floating point arithmetic.
 */

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  exponent: number;
  locale: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee", exponent: 2, locale: "en-IN" },
  USD: { code: "USD", symbol: "$", name: "US Dollar", exponent: 2, locale: "en-US" },
  EUR: { code: "EUR", symbol: "€", name: "Euro", exponent: 2, locale: "en-IE" },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", exponent: 2, locale: "en-GB" },
  AED: { code: "AED", symbol: "د.إ", name: "UAE Dirham", exponent: 2, locale: "en-AE" },
  SGD: { code: "SGD", symbol: "S$", name: "Singapore Dollar", exponent: 2, locale: "en-SG" },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", exponent: 2, locale: "en-AU" },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar", exponent: 2, locale: "en-CA" },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen", exponent: 0, locale: "ja-JP" },
  KWD: { code: "KWD", symbol: "KD", name: "Kuwaiti Dinar", exponent: 3, locale: "en-KW" },
  NPR: { code: "NPR", symbol: "रू", name: "Nepalese Rupee", exponent: 2, locale: "en-NP" },
  LKR: { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee", exponent: 2, locale: "en-LK" },
};

export const DEFAULT_CURRENCY = "INR";
export const DEFAULT_LOCALE = "en-IN";

export function currencyInfo(code: string | null | undefined): CurrencyInfo {
  return CURRENCIES[(code ?? DEFAULT_CURRENCY).toUpperCase()] ?? CURRENCIES[DEFAULT_CURRENCY];
}

const MAX_MINOR = 1_000_000_000_000_000; // matches DB domain money_minor

export class MoneyError extends Error {}

/** Parse a user-entered amount ("1,80,000.50", "1800", 12.5) into minor units. */
export function toMinor(input: string | number, currency = DEFAULT_CURRENCY): number {
  const { exponent } = currencyInfo(currency);
  const raw = typeof input === "number" ? input.toString() : input.trim().replace(/[,\s_]/g, "");
  if (raw === "" || !/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new MoneyError("Enter a valid amount");
  }
  const d = new Decimal(raw);
  if (d.decimalPlaces() > exponent) {
    throw new MoneyError(exponent === 0 ? "This currency has no decimal places" : `Use at most ${exponent} decimal places`);
  }
  const minor = d.mul(Decimal.pow(10, exponent));
  if (minor.abs().gt(MAX_MINOR)) throw new MoneyError("Amount is too large");
  return minor.toNumber();
}

/** Minor units -> major-unit decimal string (exact). */
export function fromMinor(minor: number, currency = DEFAULT_CURRENCY): string {
  const { exponent } = currencyInfo(currency);
  return new Decimal(minor).div(Decimal.pow(10, exponent)).toFixed(exponent);
}

/** Minor units -> number in major units (for charts only; never for arithmetic). */
export function toMajorNumber(minor: number, currency = DEFAULT_CURRENCY): number {
  const { exponent } = currencyInfo(currency);
  return new Decimal(minor).div(Decimal.pow(10, exponent)).toNumber();
}

export interface FormatOptions {
  locale?: string;
  compact?: boolean;
  /** Show minor digits even when the amount is whole. Default: only when needed. */
  forceDecimals?: boolean;
  signDisplay?: "auto" | "always" | "exceptZero" | "never";
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function getFormatter(locale: string, currency: string, opts: Intl.NumberFormatOptions) {
  const key = `${locale}|${currency}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatMoney(minor: number, currency = DEFAULT_CURRENCY, options: FormatOptions = {}): string {
  const info = currencyInfo(currency);
  const locale = options.locale ?? info.locale;
  const major = new Decimal(minor).div(Decimal.pow(10, info.exponent));
  const isWhole = major.isInteger();
  const opts: Intl.NumberFormatOptions = { signDisplay: options.signDisplay ?? "auto" };
  if (options.compact) {
    opts.notation = "compact";
    opts.maximumFractionDigits = 1;
  } else if (!options.forceDecimals && isWhole) {
    opts.minimumFractionDigits = 0;
    opts.maximumFractionDigits = 0;
  } else {
    opts.minimumFractionDigits = info.exponent;
    opts.maximumFractionDigits = info.exponent;
  }
  // Intl accepts strings for exact decimal formatting in modern runtimes.
  return getFormatter(locale, info.code, opts).format(major.toString() as unknown as number);
}

/** Plain-text money for PDFs (avoids glyphs missing from standard PDF fonts). */
export function formatMoneyPlain(minor: number, currency = DEFAULT_CURRENCY, locale?: string): string {
  const info = currencyInfo(currency);
  const major = new Decimal(minor).div(Decimal.pow(10, info.exponent));
  const n = new Intl.NumberFormat(locale ?? info.locale, {
    minimumFractionDigits: info.exponent,
    maximumFractionDigits: info.exponent,
  }).format(major.toString() as unknown as number);
  return `${info.code} ${n}`;
}

export function sumMinor(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  if (!Number.isSafeInteger(total)) throw new MoneyError("Sum overflow");
  return total;
}

/** Percentage (0-100+) with 2dp precision, safe for zero denominators. */
export function percent(part: number, whole: number, dp = 2): number {
  if (!whole) return 0;
  return new Decimal(part).div(whole).mul(100).toDecimalPlaces(dp).toNumber();
}

/** Divide minor units and round half-up to an integer minor unit. */
export function divideMinor(minor: number, divisor: number | Decimal, mode: "round" | "ceil" | "floor" = "round"): number {
  const d = new Decimal(divisor);
  if (d.isZero()) return 0;
  const q = new Decimal(minor).div(d);
  const r = mode === "ceil" ? q.ceil() : mode === "floor" ? q.floor() : q.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return r.toNumber();
}
