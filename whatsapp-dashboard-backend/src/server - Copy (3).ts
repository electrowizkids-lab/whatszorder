// src/server.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool, { testDbConnection } from './db';
import axios from 'axios';

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
				// After saving the inbound message successfully...

// Send an automatic acknowledgement back to the customer
try {
    const metaApiUrl = `https://graph.facebook.com/v21.0/${process.env.META_PHONE_ID}/messages`;
    const ackText = "Your order has been received and we are working on it. 🙏";

    await axios.post(metaApiUrl, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: customerPhone,          // the number that just messaged us
        type: "text",
        text: { preview_url: false, body: ackText }
    }, {
        headers: {
            Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
        }
    });

    // Save our acknowledgement to the DB too, so it shows in the dashboard
    await pool.query(
        'INSERT INTO chat_messages (customer_id, direction, message_text) VALUES (?, ?, ?)',
        [customerId, 'outbound', ackText]
    );

    console.log(`🤖 Auto-acknowledgement sent to ${customerPhone}`);
} catch (ackError: any) {
    console.error('❌ Failed to send acknowledgement:', ackError.response?.data?.error?.message || ackError.message);
}
            }
        }
    } catch (error) {
        console.error('❌ Error processing webhook payload:', error);
    }
});

// --- FRONTEND API ENDPOINTS ---

// 1. Get all customers (For the left sidebar)
app.get('/api/customers', async (req: Request, res: Response) => {
    try {
        const [customers]: any = await pool.query(
            'SELECT id, name, whatsapp_id, created_at FROM customers ORDER BY created_at DESC'
        );
        res.json(customers);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// 2. Get chat history for a specific customer (For the right pane)
app.get('/api/chat/:customerId', async (req: Request, res: Response) => {
    const customerId = req.params.customerId;
    try {
        const [messages]: any = await pool.query(
            'SELECT id, direction, message_text, timestamp FROM chat_messages WHERE customer_id = ? ORDER BY timestamp ASC',
            [customerId]
        );
        res.json(messages);
    } catch (error) {
        console.error('Error fetching chat:', error);
        res.status(500).json({ error: 'Failed to fetch chat history' });
    }
});

// 4. ORDERS BOARD — each customer + their latest message = one "order"
app.get('/api/orders', async (req: Request, res: Response) => {
    try {
        const [rows]: any = await pool.query(`
            SELECT
                c.id,
                c.name,
                c.whatsapp_id,
                c.status,
                c.created_at,
                lm.message_text AS latest_message,
                lm.timestamp    AS latest_time,
                (SELECT COUNT(*) FROM chat_messages
                   WHERE customer_id = c.id AND direction = 'inbound') AS inbound_count
            FROM customers c
            LEFT JOIN (
                SELECT cm.customer_id, cm.message_text, cm.timestamp
                FROM chat_messages cm
                INNER JOIN (
                    SELECT customer_id, MAX(timestamp) AS mx
                    FROM chat_messages GROUP BY customer_id
                ) latest ON cm.customer_id = latest.customer_id AND cm.timestamp = latest.mx
            ) lm ON lm.customer_id = c.id
            ORDER BY lm.timestamp DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// 5. UPDATE ORDER STATUS
app.patch('/api/orders/:id/status', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pending', 'processing', 'fulfilled'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    try {
        await pool.query('UPDATE customers SET status = ? WHERE id = ?', [status, id]);
        console.log(`🔄 Order ${id} status → ${status}`);
        res.json({ success: true, status });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// 3. Send a new message from the Dashboard (Outbound)
// Add axios to your imports at the top of server.ts
//import axios from 'axios';

// ... existing code ...

// 3. Send a new message from the Dashboard (Outbound)
app.post('/api/chat/send', async (req: Request, res: Response) => {
    const { customerId, text } = req.body;
    
    try {
        // Step A: We need the customer's WhatsApp ID (phone number) to send the message
        const [customerRows]: any = await pool.query(
            'SELECT whatsapp_id FROM customers WHERE id = ?',
            [customerId]
        );
        
        if (customerRows.length === 0) {
            return res.status(404).json({ error: "Customer not found." });
        }
        const recipientPhone = customerRows[0].whatsapp_id;

        // Step B: Save your outbound message to the database immediately
        await pool.query(
            'INSERT INTO chat_messages (customer_id, direction, message_text) VALUES (?, ?, ?)',
            [customerId, 'outbound', text]
        );

        // Step C: Send the message via WhatsApp Meta API
        const metaApiUrl = `https://graph.facebook.com/v21.0/${process.env.META_PHONE_ID}/messages`;
        
        await axios.post(metaApiUrl, {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: recipientPhone,
            type: "text",
            text: { preview_url: false, body: text }
        }, {
            headers: {
                Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        console.log(`📤 Outbound message sent to ${recipientPhone}`);
        res.json({ success: true, message: "Message saved and sent." });

    } catch (error: any) {
        // Log the specific error message from Meta if it fails
        const errorDetail = error.response?.data?.error?.message || error.message;
        console.error('❌ Error sending message to Meta:', errorDetail);
        res.status(500).json({ error: 'Failed to send message', details: errorDetail });
    }
});

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await testDbConnection();
});