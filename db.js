// db.js — Database controller
// Uses Upstash Redis when UPSTASH env vars are set (production/Vercel)
// Falls back to JSON files for local development

const fs   = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE   = path.join(__dirname, 'data', 'orders.json');

let redis      = null;
let useRedis   = false;
let initDone   = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    if (initDone) return;
    initDone = true;

    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.log('[DB] No Upstash config — using local JSON files (dev mode).');
        return;
    }

    try {
        const { Redis } = require('@upstash/redis');
        redis    = new Redis({ url, token });
        useRedis = true;
        console.log('[DB] Connected to Upstash Redis ✅');

        // Seed products on first run if not present
        const existing = await redis.get('products');
        if (!existing) {
            const defaults = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
            await redis.set('products', JSON.stringify(defaults));
            console.log('[DB] Products seeded to Upstash.');
        }
    } catch (err) {
        console.error('[DB] Upstash connection failed:', err.message);
        useRedis = false;
    }
}

// ─── File helpers (local dev only) ───────────────────────────────────────────
function readJSON(filepath) {
    try {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch {
        return [];
    }
}

function writeJSON(filepath, data) {
    try {
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.warn('[DB] writeJSON failed:', err.message);
        return false;
    }
}

// ─── Products ────────────────────────────────────────────────────────────────
async function getAllProducts() {
    if (useRedis) {
        const raw = await redis.get('products');
        if (!raw) return readJSON(PRODUCTS_FILE); // fallback to bundled file
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    return readJSON(PRODUCTS_FILE);
}

async function updateProduct(id, updates) {
    const allowed = ['price', 'originalPrice', 'inStock', 'name', 'description', 'badge'];
    const clean   = {};
    allowed.forEach(f => { if (updates[f] !== undefined) clean[f] = updates[f]; });

    if (useRedis) {
        const products = await getAllProducts();
        const idx = products.findIndex(p => p.id === id);
        if (idx === -1) return null;
        Object.assign(products[idx], clean);
        await redis.set('products', JSON.stringify(products));
        return products[idx];
    }

    const products = readJSON(PRODUCTS_FILE);
    const idx      = products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    Object.assign(products[idx], clean);
    writeJSON(PRODUCTS_FILE, products);
    return products[idx];
}

// ─── Orders ──────────────────────────────────────────────────────────────────
async function getAllOrders() {
    if (useRedis) {
        const raw = await redis.lrange('orders', 0, -1);
        if (!raw || raw.length === 0) return [];
        return raw.map(item => typeof item === 'string' ? JSON.parse(item) : item);
    }
    return readJSON(ORDERS_FILE);
}

async function saveOrder(order) {
    if (useRedis) {
        await redis.lpush('orders', JSON.stringify(order));
        return order;
    }
    const orders = readJSON(ORDERS_FILE);
    orders.unshift(order);
    writeJSON(ORDERS_FILE, orders);
    return order;
}

async function updateOrderStatus(orderNumber, status) {
    if (useRedis) {
        // Get all orders, update the matching one, rewrite the list
        const allOrders = await getAllOrders();
        const idx = allOrders.findIndex(o => o.orderNumber === orderNumber);
        if (idx === -1) return null;
        allOrders[idx].status = status;
        // Clear and rewrite the list
        await redis.del('orders');
        for (const o of allOrders) {
            await redis.rpush('orders', JSON.stringify(o));
        }
        return allOrders[idx];
    }
    const orders = readJSON(ORDERS_FILE);
    const order  = orders.find(o => o.orderNumber === orderNumber);
    if (!order) return null;
    order.status = status;
    writeJSON(ORDERS_FILE, orders);
    return order;
}

module.exports = { init, getAllProducts, updateProduct, getAllOrders, saveOrder, updateOrderStatus };
