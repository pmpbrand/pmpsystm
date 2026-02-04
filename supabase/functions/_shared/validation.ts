// Validation utilities for confessions

/**
 * Validate confession text
 * Returns { valid: boolean, error?: string }
 */
export function validateConfession(text: string): { valid: boolean; error?: string } {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Confession text is required' }
  }

  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return { valid: false, error: 'Confession text cannot be empty' }
  }

  // Minimum length: 120 characters
  if (trimmed.length < 120) {
    return { valid: false, error: 'Confession must be at least 120 characters long' }
  }

  // Check for excessive repetition (same character ratio > 0.6)
  const charCounts: Record<string, number> = {}
  for (const char of trimmed) {
    charCounts[char] = (charCounts[char] || 0) + 1
  }
  const maxCount = Math.max(...Object.values(charCounts))
  const repetitionRatio = maxCount / trimmed.length
  if (repetitionRatio > 0.6) {
    return { valid: false, error: 'Confession contains too much repetition' }
  }

  // Check if text is mostly emojis or whitespace
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu
  const emojiCount = (trimmed.match(emojiRegex) || []).length
  const nonWhitespaceLength = trimmed.replace(/\s/g, '').length
  if (nonWhitespaceLength > 0 && emojiCount / nonWhitespaceLength > 0.7) {
    return { valid: false, error: 'Confession cannot be mostly emojis' }
  }

  // Check if text is mostly whitespace
  const whitespaceRatio = (trimmed.match(/\s/g) || []).length / trimmed.length
  if (whitespaceRatio > 0.7) {
    return { valid: false, error: 'Confession cannot be mostly whitespace' }
  }

  return { valid: true }
}

/**
 * Basic email validation
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false
  }
  const trimmed = email.trim()
  if (trimmed.length === 0) {
    return false
  }
  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

/**
 * Basic Instagram handle validation
 */
export function validateInstagram(instagram: string): boolean {
  if (!instagram || typeof instagram !== 'string') {
    return false
  }
  const trimmed = instagram.trim().replace(/^@/, '') // Remove @ if present
  if (trimmed.length === 0 || trimmed.length > 30) {
    return false
  }
  // Instagram handle: alphanumeric, periods, underscores, 1-30 chars
  const instagramRegex = /^[a-zA-Z0-9._]{1,30}$/
  return instagramRegex.test(trimmed)
}

