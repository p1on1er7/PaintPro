const privateAccountHashes = new Set([
  "f042bbb7a5554b01850bad53abc5ca5fbb7184b4e2a784fa9f654a8c1b0aa99a",
  "0ff1277dba4c40f61cf1497228f73266f5b959355683363be0df35185d33c819",
]);

export async function isPrivateAccount(email: string | undefined) {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedEmail));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return privateAccountHashes.has(hash);
}
