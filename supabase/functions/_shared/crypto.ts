// Cryptographic utilities for PMP V1
// Hash functions for IP, fingerprints, and text

/**
 * Hash a string using SHA-256
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash IP address with salt
 */
export async function hashIP(ip: string, salt: string): Promise<string> {
  return sha256(ip + salt)
}

/**
 * Hash fingerprint (already hashed client-side, but we can re-hash for consistency)
 */
export async function hashFingerprint(fp: string): Promise<string> {
  return sha256(fp)
}

/**
 * Hash confession text
 */
export async function hashText(text: string): Promise<string> {
  return sha256(text.trim())
}

