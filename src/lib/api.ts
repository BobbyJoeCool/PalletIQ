export interface AuthUser {
  zNumber: string;
  firstName: string;
  lastName: string;
  role: string;
}

export async function identify(zNumber: string): Promise<{ firstName: string; lastName: string }> {
  const res = await fetch('/api/auth/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zNumber }),
  });
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('REQUEST_FAILED');
  return res.json() as Promise<{ firstName: string; lastName: string }>;
}

export async function loginWithPin(
  zNumber: string,
  pin: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zNumber, pin }),
  });
  if (res.status === 401) throw new Error('INVALID_PIN');
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error('REQUEST_FAILED');
  return res.json() as Promise<{ token: string; user: AuthUser }>;
}
