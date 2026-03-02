export type CurrencyCode = 'USD' | 'EUR' | 'AUD' | 'KRW';

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'KRW', label: 'South Korean Won', symbol: '₩' },
];

export function getCurrencySymbol(code: CurrencyCode): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol ?? code;
}

// --- FX Rates ---

const RATES_KEY = 'consulting_pm_fx_rates';
const RATES_DATE_KEY = 'consulting_pm_fx_date';

export interface FxRates {
  base: string;
  rates: Record<string, number>;
}

// Fallback rates in case API fails
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  AUD: 1.55,
  KRW: 1320,
};

export function loadFxRates(): FxRates {
  const raw = localStorage.getItem(RATES_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch { /* fall through */ }
  }
  return { base: 'USD', rates: FALLBACK_RATES };
}

function saveFxRates(rates: FxRates): void {
  localStorage.setItem(RATES_KEY, JSON.stringify(rates));
  localStorage.setItem(RATES_DATE_KEY, new Date().toISOString().slice(0, 10));
}

function shouldRefresh(): boolean {
  const lastDate = localStorage.getItem(RATES_DATE_KEY);
  if (!lastDate) return true;
  return lastDate !== new Date().toISOString().slice(0, 10);
}

export async function refreshFxRates(): Promise<FxRates> {
  if (!shouldRefresh()) return loadFxRates();

  try {
    const symbols = SUPPORTED_CURRENCIES.map(c => c.code).join(',');
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${symbols}`);
    if (!res.ok) throw new Error('FX fetch failed');
    const json = await res.json();
    const rates: FxRates = {
      base: 'USD',
      rates: { USD: 1, ...json.rates },
    };
    saveFxRates(rates);
    return rates;
  } catch {
    return loadFxRates();
  }
}

/**
 * Convert an amount from one currency to another using stored rates.
 * All rates are stored relative to USD.
 */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates?: FxRates
): number {
  if (from === to) return amount;
  const r = rates ?? loadFxRates();
  const fromRate = r.rates[from] ?? 1;
  const toRate = r.rates[to] ?? 1;
  // Convert: from → USD → to
  return (amount / fromRate) * toRate;
}

/**
 * Format a monetary amount with currency symbol.
 */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  const symbol = getCurrencySymbol(currency);
  // KRW has no decimals
  if (currency === 'KRW') {
    return `${symbol}${Math.round(amount).toLocaleString()}`;
  }
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Format amount with currency code only (e.g. "30,000 USD") for display where wording is only in dropdowns. */
export function formatMoneyWithCode(amount: number, currency: CurrencyCode): string {
  const rounded = Math.round(amount);
  return `${rounded.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`;
}

// --- Base currency setting ---

const BASE_CURRENCY_KEY = 'consulting_pm_base_currency';

export function getBaseCurrency(): CurrencyCode {
  return (localStorage.getItem(BASE_CURRENCY_KEY) as CurrencyCode) || 'USD';
}

export function setBaseCurrency(code: CurrencyCode): void {
  localStorage.setItem(BASE_CURRENCY_KEY, code);
}
