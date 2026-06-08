/**
 * Shared currency formatting helpers.
 *
 * `money` formats an optional price string from the API (returns a friendly
 * "Price open" placeholder when empty). `formatMoney` formats a numeric total
 * (e.g. summed income/expenditure) and always renders a figure.
 */
export function money(value?: string | null, currency = "EUR"): string {
  if (!value) return "Price open";
  return `${currency === "EUR" ? "€" : `${currency} `}${value}`;
}

/** Format a numeric amount as currency (whole numbers stay clean, else 2dp). */
export function formatMoney(amount: number, currency = "EUR"): string {
  const rounded = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${currency === "EUR" ? "€" : `${currency} `}${rounded}`;
}
