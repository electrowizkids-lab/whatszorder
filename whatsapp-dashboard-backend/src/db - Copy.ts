// src/db.ts
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing in .env file");
}

// Create a connection pool using the Aiven URI
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Changed to false to bypass the CA file requirement
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export const testDbConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Successfully connected to Aiven MySQL Database!');
        connection.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error);
    }
};

export default pool;