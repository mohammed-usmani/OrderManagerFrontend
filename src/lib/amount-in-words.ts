/**
 * Convert a rupee amount to Indian-English words.
 *
 * Uses the Indian numbering system (lakh / crore) that's standard on Indian
 * invoices. Paise go after "and". Example:
 *   1663.50 → "Rupees One Thousand Six Hundred Sixty Three and Fifty Paise Only"
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return TENS[tens] + (ones ? " " + ONES[ones] : "");
}

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(ONES[hundreds] + " Hundred");
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

function integerToIndianWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  const hundred = n;

  if (crore) parts.push(integerToIndianWords(crore) + " Crore");
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  const negative = amount < 0;
  // Work in integer paise to avoid floating-point carry (e.g. 9.995 → 100 paise).
  const totalPaise = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise  = totalPaise % 100;

  let out = (negative ? "Minus " : "") + `Rupees ${integerToIndianWords(rupees) || "Zero"}`;
  if (paise > 0) {
    out += ` and ${twoDigits(paise)} Paise`;
  }
  out += " Only";
  return out;
}
