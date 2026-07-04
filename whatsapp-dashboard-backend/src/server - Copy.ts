// src/server.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool, { testDbConnection } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

app.use(cors({ origin: '*' }));
app.use(express.json());

// 1. ANTI-SLEEP ENDPOINT
app.get('/ping', (req: Request, res: Response) => {
    res.status(200).send('Pong! Server is awake.');
});

// 2. WHATSAPP WEBHOOK VERIFICATION (GET)
app.get('/webhook', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook Verified by Meta');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 3. WHATSAPP LIVE MESSAGES (POST)
app.post('/webhook', async (req: Request, res: Response) => {
    const body = req.body;
    
    // Always acknowledge instantly to prevent Meta from retrying
    res.status(200).send('EVENT_RECEIVED'); 

    try {
        if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const changeValue = body.entry[0].changes[0].value;
            const message = changeValue.messages[0];
            const contact = changeValue.contacts?.[0];

            if (message.type === 'text') {
                const customerPhone = message.from; 
                const customerName = contact?.profile?.name || 'Unknown Customer';
                const messageText = message.text.body;
                const whatsappMsgId = message.id;

                console.log(`\n📥 Incoming Message from ${customerName} (${customerPhone}): "${messageText}"`);

                // --- DATABASE INTEGRATION ---
                
                // A. Find or Create Customer
                const [customerRows]: any = await pool.query(
                    'SELECT id FROM customers WHERE whatsapp_id = ?', 
                    [customerPhone]
                );
                
                let customerId;
                if (customerRows.length === 0) {
                    const [insertResult]: any = await pool.query(
                        'INSERT INTO customers (whatsapp_id, name) VALUES (?, ?)', 
                        [customerPhone, customerName]
                    );
                    customerId = insertResult.insertId;
                    console.log(`👤 Created new customer profile (ID: ${customerId})`);
                } else {
                    customerId = customerRows[0].id;
                }

                // B. Save the Message
                try {
                    await pool.query(
                        'INSERT INTO chat_messages (customer_id, direction, message_text, whatsapp_msg_id) VALUES (?, ?, ?, ?)',
                        [customerId, 'inbound', messageText, whatsappMsgId]
                    );
                    console.log(`💾 Message saved to database successfully.`);
                    
                    // Future Step: Emit WebSocket event here to update React UI
                    
                } catch (dbError: any) {
                    // Error 1062 is a MySQL duplicate key error
                    if (dbError.code === 'ER_DUP_ENTRY') {
                        console.log(`⚠️ Duplicate message ignored (ID: ${whatsappMsgId})`);
                    } else {
                        throw dbError;
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error processing webhook payload:', error);
    }
});

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await testDbConnection();
});