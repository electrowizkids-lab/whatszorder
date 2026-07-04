// src/db.ts — MySQL pool with production-grade SSL
// ─────────────────────────────────────────────────────────────
// SSL: set DB_SSL_CA in the environment to the FULL contents of
// Aiven's CA certificate (Aiven console ➜ your service ➜
// Connection information ➜ CA certificate ➜ Show/Download —
// paste the whole "-----BEGIN CERTIFICATE-----…" block; Render's
// env editor accepts multi-line values).
//
// Without DB_SSL_CA we fall back to rejectUnauthorized:false so
// local dev keeps working, with a warning — do NOT rely on the
// fallback in production.
// ─────────────────────────────────────────────────────────────
import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing in .env file');
}

// CA loading, most robust first:
//   1. DB_SSL_CA_PATH — path to a cert file (use Render "Secret Files",
//      mounted at /etc/secrets/<filename>) — recommended in production.
//   2. DB_SSL_CA — inline PEM env var; we repair the common paste
//      damage (literal \n sequences; fully lost line breaks are not fixable).
function loadCaCert(): string | undefined {
    const p = process.env.DB_SSL_CA_PATH;
    if (p) {
        try {
            return fs.readFileSync(p, 'utf8');
        } catch (e: any) {
            console.error(`❌ Could not read DB_SSL_CA_PATH (${p}):`, e.message);
        }
    }
    const inline = process.env.DB_SSL_CA;
    if (inline) return inline.replace(/\\n/g, '\n').trim();
    return undefined;
}

const caCert = loadCaCert();
if (!caCert) {
    console.warn('⚠️  No DB CA certificate configured — MySQL SSL verification is OFF (fine for local dev, set DB_SSL_CA_PATH in production).');
}

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: caCert
        ? { ca: caCert }
        : { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export const testDbConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Successfully connected to MySQL database!');
        connection.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error);
    }
};

export default pool;
