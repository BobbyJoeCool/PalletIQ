import prisma from './prisma.js';

const PID_MIN = 10_000_000;
const PID_MAX = 99_999_999;
const MAX_ATTEMPTS = 20;

/**
 * Generates a random 8-digit Pallet ID, checking the database for a collision on each
 * attempt (mirrors `api/prisma/seed.ts`'s `genPid`, which instead tracks uniqueness with
 * an in-memory Set since it runs as a single script — an API endpoint has no such
 * persistent state across requests, so it has to check the DB directly).
 *
 * @throws 500 PID_GENERATION_FAILED if no unused ID is found within MAX_ATTEMPTS —
 *   astronomically unlikely given ~90M possible values, but bounded for safety.
 */
export async function generateUniquePid(): Promise<number> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const pid = Math.floor(Math.random() * (PID_MAX - PID_MIN + 1)) + PID_MIN;
    const existing = await prisma.pallet.findUnique({ where: { pid }, select: { pid: true } });
    if (!existing) return pid;
  }
  throw Object.assign(new Error('PID_GENERATION_FAILED'), { status: 500 });
}
