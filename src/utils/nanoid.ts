const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** 16-char URL-safe id from a CSPRNG (~95 bits) */
export function nanoid(size = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let id = ''
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length]
  return id
}
