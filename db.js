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

        // Test connection
        await redis.ping();
        console.log('[DB] Connected to Upstash Redis ✅');

        // Seed products on first run if not present
        const existing = await redis.get('products');
        if (!existing) {
            const defaults = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
            // @upstash/redis auto-serializes, so pass the array directly
            await redis.set('products', defaults);
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
        try {
            const data = await redis.get('products');
            if (!data) return readJSON(PRODUCTS_FILE);
            // @upstash/redis auto-deserializes JSON, so data is already an array
            if (Array.isArray(data)) return data;
            // Safety fallback: if it came back as string, parse it
            if (typeof data === 'string') return JSON.parse(data);
            return readJSON(PRODUCTS_FILE);
        } catch (err) {
            console.error('[DB] Redis getAllProducts error:', err.message);
            return readJSON(PRODUCTS_FILE);
        }
    }
    return readJSON(PRODUCTS_FILE);
}

async function updateProduct(id, updates) {
    const allowed = ['price', 'originalPrice', 'inStock', 'name', 'description', 'badge'];
    const clean   = {};
    allowed.forEach(f => { if (updates[f] !== undefined) clean[f] = updates[f]; });

    if (useRedis) {
        try {
            const products = await getAllProducts();
            const idx = products.findIndex(p => p.id === id);
            if (idx === -1) return null;
            Object.assign(products[idx], clean);
            // Pass array directly — @upstash/redis auto-serializes
            await redis.set('products', products);
            console.log(`[DB] Product ${id} updated in Redis ✅`);
            return products[idx];
        } catch (err) {
            console.error('[DB] Redis updateProduct error:', err.message);
            return null;
        }
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
        try {
            const data = await redis.get('all_orders');
            if (!data) return [];
            if (Array.isArray(data)) return data;
            if (typeof data === 'string') return JSON.parse(data);
            return [];
        } catch (err) {
            console.error('[DB] Redis getAllOrders error:', err.message);
            return [];
        }
    }
    return readJSON(ORDERS_FILE);
}

async function saveOrder(order) {
    if (useRedis) {
        try {
            const orders = await getAllOrders();
            orders.unshift(order);
            await redis.set('all_orders', orders);
            console.log(`[DB] Order ${order.orderNumber} saved to Redis ✅`);
            return order;
        } catch (err) {
            console.error('[DB] Redis saveOrder error:', err.message);
            return order;
        }
    }
    const orders = readJSON(ORDERS_FILE);
    orders.unshift(order);
    writeJSON(ORDERS_FILE, orders);
    return order;
}

async function updateOrderStatus(orderNumber, status) {
    if (useRedis) {
        try {
            const orders = await getAllOrders();
            const idx = orders.findIndex(o => o.orderNumber === orderNumber);
            if (idx === -1) return null;
            orders[idx].status = status;
            await redis.set('all_orders', orders);
            return orders[idx];
        } catch (err) {
            console.error('[DB] Redis updateOrderStatus error:', err.message);
            return null;
        }
    }
    const orders = readJSON(ORDERS_FILE);
    const order  = orders.find(o => o.orderNumber === orderNumber);
    if (!order) return null;
    order.status = status;
    writeJSON(ORDERS_FILE, orders);
    return order;
}

module.exports = { init, getAllProducts, updateProduct, getAllOrders, saveOrder, updateOrderStatus };
