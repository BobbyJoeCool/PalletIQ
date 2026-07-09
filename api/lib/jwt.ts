import { SignJWT, jwtVerify } from 'jose';

export type Role = 'ADMIN' | 'MANAGER' | 'LEAD' | 'IM' | 'WORKER';

export interface JwtPayload {
  zNumber: string;
  role: Role;
}

/** Reads the JWT signing secret from the environment as a Buffer for jose to consume. */
const getSecret = () => Buffer.from(process.env.JWT_SECRET!, 'utf-8');

/**
 * Signs an HS256 JWT containing the user's zNumber and role.
 * Token expiry is 12 hours — long enough to outlast any real kiosk shift.
 * The actual session-length enforcement is the 15-minute idle timeout in
 * AuthContext.tsx (client-side); this expiry is just a backstop, not the
 * mechanism that ends active sessions.
 *
 * @param payload - `{ zNumber, role }` to embed in the token claims
 * @returns Signed JWT string
 */
export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ zNumber: payload.zNumber, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
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
