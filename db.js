// db.js - Database controller supporting MongoDB with JSON flat-file fallback
// Reads and writes products.json and orders.json in the data/ folder by default.
// If MONGODB_URI env variable is configured, connects to MongoDB.

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE   = path.join(__dirname, 'data', 'orders.json');

let client = null;
let database = null;
let useMongo = false;

// Initialize connection. Called during server startup.
async function init() {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
        console.log('[DB] Connecting to MongoDB...');
        try {
            // Setup connection with a 5-second timeout to fail fast if DB is down
            client = new MongoClient(mongoUri, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000
            });
            await client.connect();
            database = client.db();
            useMongo = true;
            console.log('[DB] Connected successfully to MongoDB.');

            // Seed default products if database collection is empty
            const productsCol = database.collection('products');
            const count = await productsCol.countDocuments();
            if (count === 0) {
                console.log('[DB] Products collection is empty. Seeding defaults from products.json...');
                const defaultProducts = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
                await productsCol.insertMany(defaultProducts);
                console.log('[DB] Seeding completed.');
            }
        } catch (err) {
            console.error('[DB] Failed to connect to MongoDB. Falling back to local files:', err.message);
            useMongo = false;
        }
    } else {
        console.log('[DB] No MONGODB_URI configured. Operating in local JSON flat-file mode.');
    }
}

// Check database mode
function isMongo() {
    return useMongo;
}

// --- Generic flat-file helpers ---
function readJSON(filepath) {
    try {
        const raw = fs.readFileSync(filepath, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`[DB] Error reading ${filepath}:`, err.message);
        return [];
    }
}

// Using sync writing is fine for local fallback operations
function writeJSON(filepath, data) {
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error(`[DB] Error writing ${filepath}:`, err.message);
        return false;
    }
}

// --- Products ---
async function getAllProducts() {
    if (useMongo) {
        try {
            return await database.collection('products').find({}).toArray();
        } catch (err) {
            console.error('[DB] Error getting products from MongoDB:', err.message);
            return [];
        }
    } else {
        return readJSON(PRODUCTS_FILE);
    }
}

async function updateProduct(id, updates) {
    const allowed = ['price', 'originalPrice', 'inStock', 'name', 'description', 'badge'];
    const cleanUpdates = {};
    allowed.forEach(field => {
        if (updates[field] !== undefined) {
            cleanUpdates[field] = updates[field];
        }
    });

    if (useMongo) {
        try {
            await database.collection('products').updateOne(
                { id: id },
                { $set: cleanUpdates }
            );
            return await database.collection('products').findOne({ id: id });
        } catch (err) {
            console.error('[DB] Error updating product in MongoDB:', err.message);
            return null;
        }
    } else {
        const products = await getAllProducts();
        const index = products.findIndex(p => p.id === id);
        if (index === -1) return null;

        allowed.forEach(field => {
            if (updates[field] !== undefined) {
                products[index][field] = updates[field];
            }
        });

        writeJSON(PRODUCTS_FILE, products);
        return products[index];
    }
}

// --- Orders ---
async function getAllOrders() {
    if (useMongo) {
        try {
            return await database.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
        } catch (err) {
            console.error('[DB] Error getting orders from MongoDB:', err.message);
            return [];
        }
    } else {
        return readJSON(ORDERS_FILE);
    }
}

async function saveOrder(order) {
    if (useMongo) {
        try {
            await database.collection('orders').insertOne(order);
            return order;
        } catch (err) {
            console.error('[DB] Error saving order to MongoDB:', err.message);
            return null;
        }
    } else {
        const orders = await getAllOrders();
        orders.unshift(order); // Newest first
        writeJSON(ORDERS_FILE, orders);
        return order;
    }
}

async function getOrderById(orderNumber) {
    if (useMongo) {
        try {
            return await database.collection('orders').findOne({ orderNumber: orderNumber });
        } catch (err) {
            console.error('[DB] Error getting order from MongoDB:', err.message);
            return null;
        }
    } else {
        const orders = await getAllOrders();
        return orders.find(o => o.orderNumber === orderNumber) || null;
    }
}

async function updateOrderStatus(orderNumber, status) {
    if (useMongo) {
        try {
            await database.collection('orders').updateOne(
                { orderNumber: orderNumber },
                { $set: { status: status } }
            );
            return await database.collection('orders').findOne({ orderNumber: orderNumber });
        } catch (err) {
            console.error('[DB] Error updating order status in MongoDB:', err.message);
            return null;
        }
    } else {
        const orders = await getAllOrders();
        const order = orders.find(o => o.orderNumber === orderNumber);
        if (!order) return null;
        order.status = status;
        writeJSON(ORDERS_FILE, orders);
        return order;
    }
}

module.exports = {
    init,
    isMongo,
    getAllProducts,
    updateProduct,
    getAllOrders,
    saveOrder,
    getOrderById,
    updateOrderStatus
};
