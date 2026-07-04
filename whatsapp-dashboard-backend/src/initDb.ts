// src/initDb.ts
import pool from './db';

const createTables = async () => {
    try {
        console.log('⏳ Starting database initialization...');

        // 1. Customers Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                whatsapp_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Customers table created or verified.');

        // 2. Orders Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NOT NULL,
                items TEXT NOT NULL,
                total_amount DECIMAL(10, 2) NOT NULL,
                status ENUM('pending', 'processing', 'fulfilled', 'cancelled') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
            );
        `);
        console.log('✅ Orders table created or verified.');

        // 3. Chat Messages Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NOT NULL,
                direction ENUM('inbound', 'outbound') NOT NULL,
                message_text TEXT NOT NULL,
                whatsapp_msg_id VARCHAR(255) UNIQUE,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
            );
        `);
        console.log('✅ Chat Messages table created or verified.');

        console.log('🎉 Database schema is fully initialized and ready for production!');
        
        // Close the connection pool so the script exits cleanly
        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating tables:', error);
        process.exit(1);
    }
};

createTables();