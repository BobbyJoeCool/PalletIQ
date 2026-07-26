import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/**
 * Shared Prisma client singleton for Azure Functions.
 * Created once at module load time and reused across warm invocations to avoid
 * connection exhaustion from repeated cold-start client creation. The MariaDB
 * adapter (MySQL-compatible) connects via the DATABASE_URL environment variable.
 */
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

export default prisma;
