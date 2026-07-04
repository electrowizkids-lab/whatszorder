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
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing in .env file');
}

const caCert = process.env.DB_SSL_CA;
if (!caCert) {
    console.warn('⚠️  DB_SSL_CA not set — MySQL SSL certificate verification is OFF (fine for local dev, set it in production).');
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
