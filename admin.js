// admin.js — Admin Dashboard (authenticated)

const TOKEN_KEY = 'akana_admin_token';

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

function authHeaders() {
    return { 'Content-Type': 'application/json', 'x-admin-token': getToken() || '' };
}

// On load: if already have a valid token, hide login screen
document.addEventListener('DOMContentLoaded', async () => {
    const token = getToken();
    if (token) {
        // Verify token is still valid by probing a protected endpoint
        try {
            const res = await fetch('/api/admin/orders', { headers: { 'x-admin-token': token } });
            if (res.ok) {
                hideLockScreen();
                loadOrders();
                return;
            }
        } catch (_) {}
    }
    // Show login screen (default state)
    document.getElementById('adminPassword')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });
});

// ─── Login ────────────────────────────────────────────────────────────────────
async function doLogin() {
    const pwInput  = document.getElementById('adminPassword');
    const errorEl  = document.getElementById('loginError');
    const btn      = document.getElementById('loginBtn');
    const btnText  = document.getElementById('loginBtnText');

    const password = pwInput?.value?.trim();
    if (!password) { showLoginError('Please enter your password.'); return; }

    // Loading state
    btn.disabled = true;
    btnText.innerHTML = '<div class="spinner-sm"></div> Verifying...';
    errorEl.classList.remove('show');
    pwInput.classList.remove('error');

    try {
        const res  = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (data.success) {
            setToken(data.token);
            hideLockScreen();
            loadOrders();
        } else {
            showLoginError(data.message || 'Incorrect password.');
        }
    } catch (err) {
        showLoginError('Cannot connect to server. Is it running?');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Login to Dashboard';
    }
}

function showLoginError(msg) {
    const errorEl = document.getElementById('loginError');
    const pwInput = document.getElementById('adminPassword');
    if (errorEl) { errorEl.textContent = msg; errorEl.classList.add('show'); }
    if (pwInput) { pwInput.classList.add('error'); pwInput.focus(); }
}

function hideLockScreen() {
    const screen = document.getElementById('loginScreen');
    if (screen) { screen.classList.add('hidden'); }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function doLogout() {
    try { await fetch('/api/admin/logout', { method: 'POST', headers: authHeaders() }); } catch (_) {}
    clearToken();
    location.reload();
}

// ─── Page navigation ──────────────────────────────────────────────────────────
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    document.getElementById('page' + cap)?.classList.add('active');
    document.getElementById('nav'  + cap)?.classList.add('active');
    if (name === 'orders') loadOrders();
    if (name === 'inventory') loadInventory();
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'show' + (type ? ' ' + type : '');
    setTimeout(() => { t.className = ''; }, 3200);
}

// ─── Helper: handle 401 → back to login ──────────────────────────────────────
async function apiFetch(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
    if (res.status === 401) { clearToken(); location.reload(); throw new Error('Session expired'); }
    return res;
}

// ─── Orders ───────────────────────────────────────────────────────────────────
async function loadOrders() {
    document.getElementById('ordersLastRefresh').textContent = 'Refreshing…';
    try {
        const res    = await apiFetch('/api/admin/orders');
        const data   = await res.json();
        const orders = data.orders || [];

        // Stats
        const revenue   = orders.reduce((s, o) => s + o.totalAmount, 0);
        const pending   = orders.filter(o => o.status === 'Pending').length;
        const delivered = orders.filter(o => o.status === 'Delivered').length;
        document.getElementById('statTotal').textContent     = orders.length;
        document.getElementById('statRevenue').textContent   = '₹' + revenue.toLocaleString('en-IN');
        document.getElementById('statPending').textContent   = pending;
        document.getElementById('statDelivered').textContent = delivered;

        const tbody = document.getElementById('ordersTableBody');
        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted)">
                No orders yet! Share your store link to start selling. 🚀</td></tr>`;
            document.getElementById('ordersLastRefresh').textContent = 'No orders yet.';
            return;
        }

        tbody.innerHTML = orders.map(o => `
            <tr>
                <td><strong style="color:var(--primary)">${o.orderNumber}</strong></td>
                <td style="color:var(--muted);font-size:0.85rem;white-space:nowrap">${o.date}</td>
                <td>
                    <div style="font-weight:600">${o.shipping.fullName}</div>
                    <div style="font-size:0.78rem;color:var(--muted)">${o.shipping.email}</div>
                    <div style="font-size:0.78rem;color:var(--muted)">${o.shipping.phone || ''}</div>
                    <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">${o.shipping.cityStatePin || ''}</div>
                </td>
                <td style="font-size:0.85rem">
                    ${o.items.map(i => `<div>${i.name} <strong>×${i.quantity}</strong></div>`).join('')}
                </td>
                <td style="font-weight:700;color:var(--primary);white-space:nowrap">₹${o.totalAmount}</td>
                <td style="font-size:0.75rem;color:var(--muted);max-width:120px;word-break:break-all">${o.razorpayPaymentId || '–'}</td>
                <td><span class="badge badge-${(o.status||'pending').toLowerCase()}">${o.status}</span></td>
                <td>
                    <select class="select-sm" onchange="updateStatus('${o.orderNumber}', this.value)">
                        <option value="Pending"   ${o.status==='Pending'   ?'selected':''}>Pending</option>
                        <option value="Shipped"   ${o.status==='Shipped'   ?'selected':''}>Shipped</option>
                        <option value="Delivered" ${o.status==='Delivered' ?'selected':''}>Delivered</option>
                        <option value="Cancelled" ${o.status==='Cancelled' ?'selected':''}>Cancelled</option>
                    </select>
                </td>
            </tr>`).join('');

        document.getElementById('ordersLastRefresh').textContent =
            `${orders.length} order(s) · Last updated: ${new Date().toLocaleTimeString('en-IN')}`;
    } catch (err) {
        if (err.message !== 'Session expired') {
            showToast('Failed to load orders.', 'error');
            document.getElementById('ordersLastRefresh').textContent = 'Error loading orders.';
        }
    }
}

async function updateStatus(orderNumber, status) {
    try {
        const res  = await apiFetch(`/api/admin/orders/${orderNumber}/status`, {
            method: 'PATCH', body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ Order ${orderNumber} → ${status}`, 'success-toast');
            loadOrders();
        } else {
            showToast(data.message || 'Update failed.', 'error');
        }
    } catch (err) {
        if (err.message !== 'Session expired') showToast('Network error.', 'error');
    }
}

// ─── Inventory ────────────────────────────────────────────────────────────────
async function loadInventory() {
    try {
        const res      = await fetch('/api/products');
        const data     = await res.json();
        const products = data.products || [];
        const tbody    = document.getElementById('inventoryTableBody');

        tbody.innerHTML = products.map(p => `
            <tr id="row-${p.id}">
                <td>
                    <div class="product-row">
                        <img src="${p.image}" alt="${p.name}">
                        <div class="product-row-info">
                            <div class="name">${p.name}</div>
                            <div class="desc">${p.description}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div style="display:flex;align-items:center;gap:6px">
                        <span style="color:var(--muted)">₹</span>
                        <input type="number" id="price-${p.id}" class="input-sm" value="${p.price}" min="1" max="9999">
                    </div>
                </td>
                <td>
                    <div style="display:flex;align-items:center;gap:6px">
                        <span style="color:var(--muted)">₹</span>
                        <input type="number" id="origPrice-${p.id}" class="input-sm" value="${p.originalPrice}" min="1" max="9999">
                    </div>
                </td>
                <td>
                    <div class="toggle-wrap">
                        <label class="toggle">
                            <input type="checkbox" id="stock-${p.id}" ${p.inStock?'checked':''} onchange="toggleStock('${p.id}',this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span id="stockLabel-${p.id}" style="font-size:0.85rem;font-weight:600;color:${p.inStock?'var(--success)':'var(--error)'}">
                            ${p.inStock ? 'In Stock' : 'Out of Stock'}
                        </span>
                    </div>
                </td>
                <td>
                    <button class="btn btn-accent btn-sm" onclick="saveProduct('${p.id}')">Save</button>
                </td>
            </tr>`).join('');
    } catch (err) {
        showToast('Failed to load products.', 'error');
    }
}

async function saveProduct(id) {
    const price         = parseFloat(document.getElementById(`price-${id}`)?.value);
    const originalPrice = parseFloat(document.getElementById(`origPrice-${id}`)?.value);
    if (isNaN(price) || price <= 0) { showToast('Enter a valid price.', 'error'); return; }
    try {
        const res  = await apiFetch(`/api/admin/products/${id}`, {
            method: 'PATCH', body: JSON.stringify({ price, originalPrice })
        });
        const data = await res.json();
        if (data.success) showToast(`✅ ${data.product.name} → ₹${data.product.price}`, 'success-toast');
        else showToast(data.message || 'Update failed.', 'error');
    } catch (err) {
        if (err.message !== 'Session expired') showToast('Network error.', 'error');
    }
}

async function toggleStock(id, inStock) {
    const label = document.getElementById(`stockLabel-${id}`);
    if (label) { label.textContent = inStock ? 'In Stock' : 'Out of Stock'; label.style.color = inStock ? 'var(--success)' : 'var(--error)'; }
    try {
        const res  = await apiFetch(`/api/admin/products/${id}`, {
            method: 'PATCH', body: JSON.stringify({ inStock })
        });
        const data = await res.json();
        if (data.success) showToast(`✅ ${data.product.name} → ${inStock ? 'In Stock' : 'Out of Stock'}`, 'success-toast');
    } catch (err) {
        if (err.message !== 'Session expired') showToast('Failed to update stock.', 'error');
    }
}
