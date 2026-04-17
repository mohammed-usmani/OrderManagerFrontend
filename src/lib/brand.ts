/**
 * Restaurant brand constants.
 *
 * Display-only metadata (name, address, cuisine, agent persona). Bill policy
 * — service charge, GST rates — lives on the backend in `server/config.py`
 * (`BILL_CHARGES`) and is included in every order payload (`subtotal`,
 * `charges`, `total`). Don't duplicate those rates here.
 *
 * If you change name, address, hours, or cuisine, update
 * `server/agent/brain.py`'s SYSTEM_PROMPT too so the agent quotes matching
 * info to customers.
 */

export const BRAND = {
  name: "Saffron & Smoke",
  tagline: "Modern Indian · Bandra West, Mumbai",
  address: {
    line1: "14, Hill Road",
    line2: "Bandra West, Mumbai 400050",
    short: "Hill Road, Bandra West, Mumbai",
    mapsQuery: "Saffron+and+Smoke+14+Hill+Road+Bandra+West+Mumbai",
  },
  phone: "+91 22 2640 1234",
  gstin: "27AABCS1234Z1Z5",
  fssai: "11520003000987",
  website: "saffronandsmoke.com",
  hours: "Lunch 11–3 · Dinner 6–11 (IST) · Closed Mondays",
  cuisine: "Modern Indian",
  currency: {
    code: "INR",
    symbol: "₹",
  },
  // Agent's persona. The voice agent introduces themselves as Arjun.
  agentName: "Arjun",
  agentTitle: "Front-of-house",
};

/** Format a price in restaurant currency. */
export function formatPrice(amount: number): string {
  return `${BRAND.currency.symbol}${amount.toFixed(2)}`;
}
