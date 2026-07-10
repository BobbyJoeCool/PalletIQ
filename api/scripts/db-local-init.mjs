// Waits for the local Docker SQL Server (see docker-compose.yml) to accept connections, then
// creates the `palletiq-db` database if it doesn't exist yet. azure-sql-edge doesn't ship
// sqlcmd, so this uses the `mssql` package (already a devDependency) instead of an in-container
// healthcheck. Run via `npm run db:local:init` after `npm run db:local:up`.
import sql from 'mssql';

const config = {
  server: 'localhost',
  port: 1433,
  user: 'sa',
  password: 'PalletIQ-Local-Dev-2026!',
  database: 'master',
  options: { encrypt: true, trustServerCertificate: true },
};

const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;

async function waitForServer() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const pool = await sql.connect(config);
      return pool;
    } catch {
      process.stdout.write(`Waiting for local SQL Server... (${attempt}/${MAX_ATTEMPTS})\n`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error('Local SQL Server did not become ready in time — check `docker compose logs sqlserver`.');
}

const pool = await waitForServer();
console.log('Connected to local SQL Server.');

const result = await pool.request().query("SELECT database_id FROM sys.databases WHERE name = 'palletiq-db'");
if (result.recordset.length === 0) {
  await pool.request().query('CREATE DATABASE [palletiq-db]');
  console.log('Created database palletiq-db.');
} else {
  console.log('Database palletiq-db already exists.');
}

await pool.close();
console.log('Local SQL Server is ready — run `npm run db:local:push` next.');
