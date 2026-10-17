// db.js — Database controller
// Uses MongoDB when MONGODB_URI is set (production/Vercel)
// Falls back to JSON files for local development

const fs   = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE   = path.join(__dirname, 'data', 'orders.json');

let client   = null;
let database = null;
let useMongo = false;
let initDone = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    if (initDone) return;
    initDone = true;

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.log('[DB] No MONGODB_URI — using local JSON files (dev mode).');
        return;
    }

    try {
        // Lazy-require so missing package doesn't crash local dev
        const { MongoClient } = require('mongodb');
        client   = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        database = client.db('akana');
        useMongo = true;
        console.log('[DB] Connected to MongoDB Atlas ✅');

        // Seed products on first run if collection is empty
        const col   = database.collection('products');
        const count = await col.countDocuments();
        if (count === 0) {
            const defaults = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
            await col.insertMany(defaults);
            console.log('[DB] Products seeded to MongoDB.');
        }
    } catch (err) {
        console.error('[DB] MongoDB connection failed:', err.message);
        useMongo = false;
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
        // Ensure data/ directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.warn('[DB] writeJSON failed (expected on Vercel):', err.message);
        return false;
    }
}

// ─── Products ────────────────────────────────────────────────────────────────
async function getAllProducts() {
    if (useMongo) {
        return database.collection('products').find({}, { projection: { _id: 0 } }).toArray();
    }
    return readJSON(PRODUCTS_FILE);
}

async function updateProduct(id, updates) {
    const allowed = ['price', 'originalPrice', 'inStock', 'name', 'description', 'badge'];
    const clean   = {};
    allowed.forEach(f => { if (updates[f] !== undefined) clean[f] = updates[f]; });

    if (useMongo) {
        await database.collection('products').updateOne({ id }, { $set: clean });
        return database.collection('products').findOne({ id }, { projection: { _id: 0 } });
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
    if (useMongo) {
        return database.collection('orders').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    }
    return readJSON(ORDERS_FILE);
}

async function saveOrder(order) {
    if (useMongo) {
        await database.collection('orders').insertOne(order);
        return order;
    }
    const orders = readJSON(ORDERS_FILE);
    orders.unshift(order);
    writeJSON(ORDERS_FILE, orders);
    return order;
}

async function updateOrderStatus(orderNumber, status) {
    if (useMongo) {
        await database.collection('orders').updateOne({ orderNumber }, { $set: { status } });
        return database.collection('orders').findOne({ orderNumber }, { projection: { _id: 0 } });
    }
    const orders = readJSON(ORDERS_FILE);
    const order  = orders.find(o => o.orderNumber === orderNumber);
    if (!order) return null;
    order.status = status;
    writeJSON(ORDERS_FILE, orders);
    return order;
}

module.exports = { init, getAllProducts, updateProduct, getAllOrders, saveOrder, updateOrderStatus };
