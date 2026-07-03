import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

/**
 * Shared Prisma client singleton for Azure Functions.
 * Created once at module load time and reused across warm invocations to avoid
 * connection exhaustion from repeated cold-start client creation. The MSSQL
 * adapter connects via the DATABASE_URL environment variable.
 */
const adapter = new PrismaMssql(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

export default prisma;
