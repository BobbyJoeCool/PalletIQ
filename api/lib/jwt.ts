import { SignJWT, jwtVerify } from 'jose';

export type Role = 'ADMIN' | 'MANAGER' | 'LEAD' | 'IM' | 'WORKER';

export interface JwtPayload {
  zNumber: string;
  role: Role;
}

const getSecret = () => Buffer.from(process.env.JWT_SECRET!, 'utf-8');

/**
 * Signs a short-lived HS256 JWT containing the user's zNumber and role.
 * Token expiry is 15 minutes, matching the session idle timeout enforced client-side.
 *
 * @param payload - `{ zNumber, role }` to embed in the token claims
 * @returns Signed JWT string
 */
export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ zNumber: payload.zNumber, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret());
}

/**
 * Verifies an HS256 JWT and returns the decoded payload.
 * Uses the shared secret from the JWT_SECRET environment variable.
 *
 * @param token - JWT string to verify
 * @returns Decoded `{ zNumber, role }` payload
 * @throws If the token is expired, tampered with, or otherwise invalid
 */
export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    zNumber: payload.zNumber as string,
    role: payload.role as Role,
  };
}
