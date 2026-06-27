import { SignJWT, jwtVerify } from 'jose';

export type Role = 'ADMIN' | 'MANAGER' | 'LEAD' | 'IM' | 'WORKER';

export interface JwtPayload {
  zNumber: string;
  role: Role;
}

const getSecret = () => Buffer.from(process.env.JWT_SECRET!, 'utf-8');

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ zNumber: payload.zNumber, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    zNumber: payload.zNumber as string,
    role: payload.role as Role,
  };
}
