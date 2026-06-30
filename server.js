// server.js — Akana Naturals Full-Stack E-Commerce Backend
// Features: Admin auth, Razorpay payment, order management, email alerts

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const Razorpay   = require('razorpay');
const db         = require('./db');

const app  = express();
const PORT = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Razorpay Instance ────────────────────────────────────────────────────────
const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID     || 'rzp_test_placeholder',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret'
});

// ─── Nodemailer Transporter ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

// ─── Admin Token Store (in-memory, resets on server restart) ─────────────────
const adminTokens = new Set();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware: protect all /api/admin/* routes
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
            <p style="margin:0 0 12px 0;color:#1A3A2B;font-weight:700">Order #${order.orderNumber} | ${order.date}</p>
            <table style="width:100%;border-collapse:collapse">${itemRows}
                <tr><td style="padding:12px 8px 0;font-weight:700;color:#1A3A2B">Total Paid</td>
                    <td style="padding:12px 8px 0;font-weight:700;color:#1A3A2B;text-align:right">₹${order.totalAmount}</td></tr>
            </table>
        </div>
        <p style="color:#555">Estimated delivery: <strong>3–5 business days</strong></p>
        <div style="background:#fff;border-radius:8px;padding:16px;border:1px solid #e3e8e5">
            <strong style="color:#1A3A2B">Shipping to:</strong><br>
            <span style="color:#555">${order.shipping.fullName}, ${order.shipping.address}, ${order.shipping.cityStatePin}</span>
        </div>
        <p style="color:#aaa;font-size:12px;margin-top:20px;text-align:center">FSSAI Lic. No. 22726241000098 | akananaturals.com</p>
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
        console.log(`[EMAIL] Sent to ${order.shipping.email} + merchant alert`);
    } catch (err) {
        console.warn('[EMAIL] Could not send (check .env SMTP settings):', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/products — Public product catalog
app.get('/api/products', async (req, res) => {
    res.json({ success: true, products: await db.getAllProducts() });
});

// GET /api/razorpay-key — Expose public key to frontend safely
app.get('/api/razorpay-key', (req, res) => {
    res.json({ keyId: process.env.RAZORPAY_KEY_ID || '' });
});

// POST /api/payment/create-order — Step 1: Create Razorpay order before showing popup
app.post('/api/payment/create-order', async (req, res) => {
    const { items } = req.body;
    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }

    // Server-side price calculation (never trust client amounts)
    const products = await db.getAllProducts();
    let totalAmount = 0;
    for (const cartItem of items) {
        const product = products.find(p => p.id === cartItem.id);
        if (!product) return res.status(400).json({ success: false, message: `Unknown product: ${cartItem.id}` });
        if (!product.inStock) return res.status(400).json({ success: false, message: `${product.name} is out of stock.` });
        totalAmount += product.price * (parseInt(cartItem.quantity) || 1);
    }

    try {
        // If keys are placeholder, don't even try to call Razorpay
        const isPlaceholder = !process.env.RAZORPAY_KEY_ID || 
                              process.env.RAZORPAY_KEY_ID.includes('placeholder') || 
                              process.env.RAZORPAY_KEY_ID.includes('PASTE_YOUR_KEY');
        
        if (isPlaceholder && !isProduction) {
            console.log('[PAYMENT] Local bypass to test mode (placeholder key in development)');
            return res.json({ success: true, razorpayOrderId: 'test_order_' + Date.now(), amount: totalAmount, testMode: true });
        }

        const razorpayOrder = await razorpay.orders.create({
            amount:   totalAmount * 100,  // Razorpay uses paise (1 INR = 100 paise)
            currency: 'INR',
            receipt:  'rcpt_' + Date.now()
        });
        res.json({ success: true, razorpayOrderId: razorpayOrder.id, amount: totalAmount });
    } catch (err) {
        console.error('[RAZORPAY] Failed to create order:', err.message);
        // Graceful fallback: if keys not configured, allow test mode ONLY in non-production
        if (!isProduction) {
            console.log('[PAYMENT] Graceful fallback to local test mode in development after error');
            res.json({ success: true, razorpayOrderId: 'test_order_' + Date.now(), amount: totalAmount, testMode: true });
        } else {
            res.status(500).json({ success: false, message: 'Payment gateway error. Please try again.' });
        }
    }
});

// POST /api/orders — Step 2: Verify payment + save order
app.post('/api/orders', async (req, res) => {
    const { items, shipping, razorpayPaymentId, razorpayOrderId, razorpaySignature, testMode } = req.body;

    if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'Cart is empty.' });
    if (!shipping?.email || !shipping?.fullName) return res.status(400).json({ success: false, message: 'Shipping details missing.' });

    // ── Verify Razorpay signature ──
    if (testMode) {
        if (isProduction) {
            return res.status(400).json({ success: false, message: 'Test mode is disabled in production.' });
        }
    } else {
        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            return res.status(400).json({ success: false, message: 'Payment verification data missing.' });
        }
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ success: false, message: 'Payment verification failed. Please contact support.' });
        }
    }

    // ── Server-side price verification ──
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

    // ── Save order ──
    const order = {
        orderNumber:        'AKN-' + Math.floor(100000 + Math.random() * 900000),
        date:               new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }),
        createdAt:          new Date().toISOString(),
        items:              verifiedItems,
        totalAmount,
        status:             'Pending',
        razorpayPaymentId:  razorpayPaymentId || 'TEST_MODE',
        razorpayOrderId:    razorpayOrderId   || 'TEST_MODE',
        shipping
    };

    const saved = await db.saveOrder(order);
    if (!saved) {
        return res.status(500).json({ success: false, message: 'Database error saving your order. Please contact support.' });
    }

    console.log(`[ORDER] ✅ ${order.orderNumber} | ₹${order.totalAmount} | ${shipping.fullName} | Payment: ${order.razorpayPaymentId}`);

    sendOrderEmails(order); // Non-blocking

    res.json({ success: true, order });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTH ROUTES (public — no token required)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }
    const token = generateToken();
    adminTokens.add(token);
    // Token expires after 8 hours
    setTimeout(() => adminTokens.delete(token), 8 * 60 * 60 * 1000);
    res.json({ success: true, token });
});

// POST /api/admin/logout
app.post('/api/admin/logout', (req, res) => {
    const token = req.headers['x-admin-token'];
    if (token) adminTokens.delete(token);
    res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PROTECTED ROUTES (require token)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/admin/orders
app.get('/api/admin/orders', requireAdminAuth, async (req, res) => {
    res.json({ success: true, orders: await db.getAllOrders() });
});

// PATCH /api/admin/orders/:orderNumber/status
app.patch('/api/admin/orders/:orderNumber/status', requireAdminAuth, async (req, res) => {
    const { status } = req.body;
    const order = await db.updateOrderStatus(req.params.orderNumber, status);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    res.json({ success: true, order });
});

// PATCH /api/admin/products/:id
app.patch('/api/admin/products/:id', requireAdminAuth, async (req, res) => {
    const updated = await db.updateProduct(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, product: updated });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function startServer() {
    await db.init();
    app.listen(PORT, () => {
        console.log(`\n✅  Akana Naturals server running at http://localhost:${PORT}`);
        console.log(`   🛒  Shop:    http://localhost:${PORT}/index.html`);
        console.log(`   ⚙️   Admin:   http://localhost:${PORT}/admin.html`);
        console.log(`   🔑  Admin password: set in .env → ADMIN_PASSWORD`);
        console.log(`\n   Press Ctrl+C to stop.\n`);
    });
}

startServer();
