import { getStoredAccessToken } from "@/lib/api";

/** Decode a JWT payload claim without verifying (client-side display only). */
export function getJwtClaim(claim) {
  try {
    const token = getStoredAccessToken();
    if (!token) return null;
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return json?.[claim] ?? null;
  } catch {
    return null;
  }
}

export function getCurrentTokenJti() {
  const jti = getJwtClaim("jti");
  return jti ? String(jti) : null;
}
