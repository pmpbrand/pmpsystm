// Ticket code generation utilities

// Base32 alphabet without I, O, 0, 1 (to avoid confusion)
const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Generate a random ticket code: PMP-XXXX-XXXX
 * Format: 8 characters total, hyphenated as PMP-XXXX-XXXX
 */
export function generateTicketCode(): string {
  let code = 'PMP-'
  
  // Generate 4 characters
  for (let i = 0; i < 4; i++) {
    code += BASE32_ALPHABET[Math.floor(Math.random() * BASE32_ALPHABET.length)]
  }
  
  code += '-'
  
  // Generate another 4 characters
  for (let i = 0; i < 4; i++) {
    code += BASE32_ALPHABET[Math.floor(Math.random() * BASE32_ALPHABET.length)]
  }
  
  return code
}

/**
 * Validate ticket code format
 */
export function validateTicketCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false
  }
  
  const trimmed = code.trim()
  const pattern = /^PMP-[A-Z2-9]{4}-[A-Z2-9]{4}$/
  return pattern.test(trimmed)
}

