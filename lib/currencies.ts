// Client-safe currency catalog. `notion` is the Notion number-property format
// used when the app formats the Amount column (falls back to plain numbers for
// currencies Notion has no native format for, e.g. BDT).

export type Currency = { code: string; symbol: string; label: string; notion: string };

export const CURRENCIES: Currency[] = [
  { code: "TRY", symbol: "₺", label: "Turkish Lira", notion: "lira" },
  { code: "USD", symbol: "$", label: "US Dollar", notion: "dollar" },
  { code: "EUR", symbol: "€", label: "Euro", notion: "euro" },
  { code: "GBP", symbol: "£", label: "British Pound", notion: "pound" },
  { code: "BDT", symbol: "৳", label: "Bangladeshi Taka", notion: "number_with_commas" },
  { code: "INR", symbol: "₹", label: "Indian Rupee", notion: "rupee" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen", notion: "yen" },
];

export const DEFAULT_CURRENCY = "TRY";

export function currencyByCode(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

export function symbolFor(code: string): string {
  return currencyByCode(code).symbol;
}
