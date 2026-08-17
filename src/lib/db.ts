import knex from 'knex';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Supported database clients: PostgreSQL (default & recommended) and MySQL.
// PostgreSQL is the one and only default; MySQL is an explicit opt-in via
// DB_CLIENT=mysql. There is no local-file database fallback.
const requestedClient = (process.env.DB_CLIENT || '').toLowerCase();
const isMySQL = requestedClient === 'mysql' || requestedClient === 'mysql2';
const isPg = !isMySQL;

const hasExplicitPgTarget = Boolean(
  process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.PGHOST ||
    process.env.DB_HOST,
);

let knexConfig: knex.Knex.Config;

if (isPg) {
  const connectionUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  // Build a proper SSL config. In production we VERIFY the server certificate.
  //   - PGSSL_CA        : PEM contents of the CA certificate (preferred)
  //   - PGSSL_CA_PATH   : path to a CA certificate file
  //   - PGSSL_NO_VERIFY : escape hatch ("true") to skip verification (discouraged)
  // Private-network database targets (Railway's *.railway.internal, Fly's
  // *.internal, Kubernetes cluster DNS) are not routable from outside the
  // project's own network. They commonly terminate TLS with a self-signed
  // certificate, or serve plaintext only. Forcing verified TLS there breaks the
  // connection outright while adding no real confidentiality benefit, because
  // the traffic never leaves the provider's private network.
  const sslTarget =
    connectionUrl || process.env.PGHOST || process.env.DB_HOST || '';
  const isPrivateNetwork =
    /\.railway\.internal|\.flycast|\.internal(?::\d+)?(?:\/|$)|\.svc\.cluster\.local/.test(
      sslTarget,
    );

  // Explicit PGSSL=true always wins. Otherwise TLS is implied in production for
  // any publicly-routed connection URL.
  const wantsSsl =
    process.env.PGSSL === 'true' ||
    (isProduction && Boolean(connectionUrl) && !isPrivateNetwork);

  if (isProduction && isPrivateNetwork && process.env.PGSSL !== 'true') {
    console.log(
      '[db] Private-network database target detected; connecting without TLS ' +
        '(traffic stays inside the provider network).',
    );
  }
  let sslConfig: boolean | Record<string, unknown> = false;
  if (wantsSsl) {
    const caPem =
      process.env.PGSSL_CA ||
      (process.env.PGSSL_CA_PATH ? fs.readFileSync(process.env.PGSSL_CA_PATH, 'utf8') : '');
    if (caPem) {
      // Strongest: verify the chain against the supplied CA.
      sslConfig = { rejectUnauthorized: true, ca: caPem };
    } else if (process.env.PGSSL_NO_VERIFY === 'true') {
      // Explicit opt-out only.
      sslConfig = { rejectUnauthorized: false };
      console.warn(
        '\u26A0 PGSSL_NO_VERIFY=true: connecting to PostgreSQL WITHOUT certificate ' +
          'verification. Provide PGSSL_CA / PGSSL_CA_PATH to enable full verification.',
      );
    } else {
      // Encrypt in transit and verify by default.
      sslConfig = { rejectUnauthorized: true };
      if (isProduction) {
        console.warn(
          '[db] TLS enabled with default trust store. Set PGSSL_CA / PGSSL_CA_PATH ' +
            'to pin your provider\u2019s CA for the strongest verification.',
        );
      }
    }
  }

  knexConfig = {
    client: 'pg',
    connection: connectionUrl
      ? { connectionString: connectionUrl, ssl: sslConfig }
      : {
          host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
          user: process.env.PGUSER || process.env.DB_USER || 'postgres',
          password: process.env.PGPASSWORD || process.env.DB_PASSWORD || '',
          database: process.env.PGDATABASE || process.env.DB_NAME || 'ecclesia',
          port: Number(process.env.PGPORT || process.env.DB_PORT) || 5432,
          ssl: sslConfig,
        },
    pool: { min: 2, max: 10 },
  };
} else {
  // MySQL (explicit opt-in only).
  knexConfig = {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ecclesia',
      port: Number(process.env.DB_PORT) || 3306,
    },
    pool: { min: 0, max: 7 },
  };
}

// Startup diagnostics so it's always obvious which database is in use.
if (isPg) {
  const target =
    process.env.DATABASE_URL || process.env.POSTGRES_URL
      ? '(from connection URL)'
      : `${process.env.PGHOST || process.env.DB_HOST || 'localhost'}:${
          Number(process.env.PGPORT || process.env.DB_PORT) || 5432
        }/${process.env.PGDATABASE || process.env.DB_NAME || 'ecclesia'}`;
  console.log(`\u2713 Database: PostgreSQL ${target}`);
  if (!hasExplicitPgTarget) {
    console.warn(
      '[db] No DATABASE_URL / PGHOST configured \u2014 defaulting to a local ' +
        'PostgreSQL instance at localhost:5432/ecclesia. Set DATABASE_URL (or ' +
        'PGHOST/PGUSER/PGPASSWORD/PGDATABASE) in your .env to point at your database.',
    );
    if (isProduction) {
      console.error(
        '\u2717 Running in PRODUCTION without an explicit PostgreSQL target. ' +
          'Set DATABASE_URL (or PGHOST/PGUSER/PGPASSWORD/PGDATABASE).',
      );
    }
  }
} else {
  console.log(`\u2713 Database: MySQL ${process.env.DB_HOST || 'localhost'}`);
}

const db = knex(knexConfig);

export default db;
