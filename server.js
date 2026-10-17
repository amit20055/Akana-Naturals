// server.js — Akana Naturals Backend (Vercel + Local compatible)
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const Razorpay   = require('razorpay');
const db         = require('./db');

const app = express();

// ─── DB Init (runs once on cold start) ───────────────────────────────────────
let dbReady = false;
let dbInitPromise = null;

function ensureDb(req, res, next) {
    if (dbReady) return next();
    if (!dbInitPromise) {
        dbInitPromise = db.init().then(() => { dbReady = true; }).catch(() => { dbReady = true; });
    }
    dbInitPromise.then(next);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(ensureDb); // Ensure DB is ready before handling requests

// ─── Razorpay ─────────────────────────────────────────────────────────────────
const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID     || 'rzp_test_placeholder',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret'
});

// ─── Nodemailer ───────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

// ─── Admin Token Store ────────────────────────────────────────────────────────
const adminTokens = new Set();

function generateToken() { return crypto.randomBytes(32).toString('hex'); }

function requireAdminAuth(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token || !adminTokens.has(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
    }
    next();
}

// ─── Email Helper ─────────────────────────────────────────────────────────────
async function sendOrderEmails(order) {
    const itemRows = order.items.map(i =>
        `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee">${i.name} ×${i.quantity}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₹${i.price * i.quantity}</td>
        </tr>`
    ).join('');

    const customerHtml = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#faf8f5;padding:30px;border-radius:12px">
        <div style="background:#1A3A2B;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px">
            <h1 style="color:#D4AF37;margin:0;font-size:24px">Akana Naturals</h1>
        </div>
        <h2 style="color:#1A3A2B">Order Confirmed! 🎉</h2>
        <p>Hi <strong>${order.shipping.fullName}</strong>, thank you for your order!</p>
        <div style="background:#fff;border-radius:8px;padding:20px;border:1px solid #e3e8e5;margin:20px 0">
            <p style="margin:0 0 12px;color:#1A3A2B;font-weight:700">Order #${order.orderNumber} | ${order.date}</p>
            <table style="width:100%;border-collapse:collapse">${itemRows}
                <tr><td style="padding:12px 8px 0;font-weight:700;color:#1A3A2B">Total Paid</td>
                    <td style="padding:12px 8px 0;font-weight:700;color:#1A3A2B;text-align:right">₹${order.totalAmount}</td>
                </tr>
            </table>
        </div>
        <p>Estimated delivery: <strong>3–5 business days</strong></p>
        <div style="background:#fff;border-radius:8px;padding:16px;border:1px solid #e3e8e5">
            <strong style="color:#1A3A2B">Shipping to:</strong><br>
            <span style="color:#555">${order.shipping.fullName}, ${order.shipping.address}, ${order.shipping.cityStatePin}</span>
        </div>
        <p style="color:#aaa;font-size:12px;margin-top:20px;text-align:center">FSSAI Lic. No. 10022026000109 | akananaturals.com</p>
    </div>`;

    const merchantHtml = `
    <div style="font-family:Inter,sans-serif;max-width:500px;padding:24px;background:#fff;border-radius:8px;border:2px solid #D4AF37">
        <h2 style="color:#1A3A2B">🛒 New Order Received!</h2>
        <p><strong>Order:</strong> #${order.orderNumber} | <strong>Total:</strong> ₹${order.totalAmount}</p>
        <p><strong>Payment ID:</strong> ${order.razorpayPaymentId || 'N/A'}</p>
        <hr style="border:1px solid #eee;margin:12px 0">
        <p><strong>Customer:</strong> ${order.shipping.fullName}</p>
        <p><strong>Email:</strong> ${order.shipping.email}</p>
        <p><strong>Phone:</strong> ${order.shipping.phone}</p>
        <p><strong>Address:</strong> ${order.shipping.address}, ${order.shipping.cityStatePin}</p>
        <hr style="border:1px solid #eee;margin:12px 0">
        <ul>${order.items.map(i => `<li>${i.name} × ${i.quantity} = ₹${i.price * i.quantity}</li>`).join('')}</ul>
        <p style="font-size:18px;font-weight:700;color:#1A3A2B">Grand Total: ₹${order.totalAmount}</p>
    </div>`;

    try {
        await transporter.sendMail({
            from: `"Akana Naturals" <${process.env.SMTP_USER}>`,
            to: order.shipping.email,
            subject: `✅ Order Confirmed #${order.orderNumber} | Akana Naturals`,
            html: customerHtml
        });
        await transporter.sendMail({
            from: `"Akana Naturals System" <${process.env.SMTP_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `🛒 New Order #${order.orderNumber} – ₹${order.totalAmount} from ${order.shipping.fullName}`,
            html: merchantHtml
        });
        console.log(`[EMAIL] Sent to ${order.shipping.email}`);
    } catch (err) {
        console.warn('[EMAIL] Could not send (check .env SMTP settings):', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/products', async (req, res) => {
    try {
        const products = await db.getAllProducts();
        res.json({ success: true, products });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not load products.' });
    }
});

app.get('/api/razorpay-key', (req, res) => {
    res.json({ keyId: process.env.RAZORPAY_KEY_ID || '' });
});

app.post('/api/payment/create-order', async (req, res) => {
    const { items } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Cart is empty.' });

    const products = await db.getAllProducts();
    let totalAmount = 0;
    for (const cartItem of items) {
        const product = products.find(p => p.id === cartItem.id);
        if (!product) return res.status(400).json({ success: false, message: `Unknown product: ${cartItem.id}` });
        if (!product.inStock) return res.status(400).json({ success: false, message: `${product.name} is out of stock.` });
        totalAmount += product.price * (parseInt(cartItem.quantity) || 1);
    }

    try {
        const razorpayOrder = await razorpay.orders.create({
            amount: totalAmount * 100,
            currency: 'INR',
            receipt: 'rcpt_' + Date.now()
        });
        res.json({ success: true, razorpayOrderId: razorpayOrder.id, amount: totalAmount });
    } catch (err) {
        console.error('[RAZORPAY]', err.message);
        // Test mode fallback when keys not configured yet
        if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes('placeholder')) {
            return res.json({ success: true, razorpayOrderId: 'test_' + Date.now(), amount: totalAmount, testMode: true });
        }
        res.status(500).json({ success: false, message: 'Payment gateway error. Please try again.' });
    }
});

app.post('/api/orders', async (req, res) => {
    const { items, shipping, razorpayPaymentId, razorpayOrderId, razorpaySignature, testMode } = req.body;

    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Cart is empty.' });
    if (!shipping?.email || !shipping?.fullName) return res.status(400).json({ success: false, message: 'Shipping details missing.' });

    // Verify Razorpay signature (skip in test mode)
    if (!testMode) {
        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            return res.status(400).json({ success: false, message: 'Payment verification data missing.' });
        }
        const expectedSig = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');
        if (expectedSig !== razorpaySignature) {
            return res.status(400).json({ success: false, message: 'Payment verification failed.' });
        }
    }

    // Server-side price verification
    const products = await db.getAllProducts();
    let totalAmount = 0;
    const verifiedItems = [];
    for (const cartItem of items) {
        const product = products.find(p => p.id === cartItem.id);
        if (!product) return res.status(400).json({ success: false, message: `Unknown product: ${cartItem.id}` });
        if (!product.inStock) return res.status(400).json({ success: false, message: `${product.name} is out of stock.` });
        const qty = parseInt(cartItem.quantity) || 1;
        verifiedItems.push({ id: product.id, name: product.name, price: product.price, image: product.image, quantity: qty });
        totalAmount += product.price * qty;
    }

    const order = {
        orderNumber:       'AKN-' + Math.floor(100000 + Math.random() * 900000),
        date:              new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }),
        createdAt:         new Date().toISOString(),
        items:             verifiedItems,
        totalAmount,
        status:            'Pending',
        razorpayPaymentId: razorpayPaymentId || 'TEST_MODE',
        razorpayOrderId:   razorpayOrderId   || 'TEST_MODE',
        shipping
    };

    await db.saveOrder(order);
    console.log(`[ORDER] ✅ ${order.orderNumber} | ₹${order.totalAmount} | ${shipping.fullName}`);

    sendOrderEmails(order); // Non-blocking
    res.json({ success: true, order });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }
    const token = generateToken();
    adminTokens.add(token);
    setTimeout(() => adminTokens.delete(token), 8 * 60 * 60 * 1000); // 8hr expiry
    res.json({ success: true, token });
});

app.post('/api/admin/logout', (req, res) => {
    const token = req.headers['x-admin-token'];
    if (token) adminTokens.delete(token);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PROTECTED ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/orders', requireAdminAuth, async (req, res) => {
    try {
        const orders = await db.getAllOrders();
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not load orders.' });
    }
});

app.patch('/api/admin/orders/:orderNumber/status', requireAdminAuth, async (req, res) => {
    try {
        const order = await db.updateOrderStatus(req.params.orderNumber, req.body.status);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not update order status.' });
    }
});

app.patch('/api/admin/products/:id', requireAdminAuth, async (req, res) => {
    try {
        const updated = await db.updateProduct(req.params.id, req.body);
        if (!updated) return res.status(404).json({ success: false, message: 'Product not found.' });
        res.json({ success: true, product: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not update product.' });
    }
});

// ─── Export for Vercel / Local ────────────────────────────────────────────────
if (require.main === module) {
    // Running locally with: node server.js
    const PORT = process.env.PORT || 8080;
    db.init().then(() => {
        app.listen(PORT, () => {
            console.log(`\n✅  Akana Naturals running at http://localhost:${PORT}`);
            console.log(`   🛒  Shop:   http://localhost:${PORT}/index.html`);
            console.log(`   ⚙️   Admin:  http://localhost:${PORT}/admin.html\n`);
        });
    });
} else {
    // Exported for Vercel serverless
    module.exports = app;
}
