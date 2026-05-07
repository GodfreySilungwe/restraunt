/**
 * Format price in cents to MWK (Malawi Kwacha)
 * @param {number} priceCents - Price in cents
 * @returns {string} Formatted price with MWK symbol
 */
export function formatMWK(priceCents) {
  const kwacha = Number(priceCents / 100).toFixed(2)
  const formatted = Number(kwacha).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `MK${formatted}`
}

/**
 * Get just the numeric value in MWK
 * @param {number} priceCents - Price in cents
 * @returns {string} Numeric value
 */
export function getMWKValue(priceCents) {
  return (priceCents / 100).toFixed(2)
}
