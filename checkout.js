// checkout.js — Razorpay payment flow

let cart = [];

document.addEventListener('DOMContentLoaded', () => {
    loadCheckoutSummary();
    setupInputFormatting();
});

// ─── Load cart summary ────────────────────────────────────────────────────────
function loadCheckoutSummary() {
    try { cart = JSON.parse(localStorage.getItem('akana_cart') || '[]'); } catch { cart = []; }

    if (cart.length === 0) {
        alert('Your cart is empty. Redirecting to shop.');
        window.location.href = 'index.html'; return;
    }

    const list    = document.getElementById('summaryList');
    const subEl   = document.getElementById('summarySubtotal');
    const totalEl = document.getElementById('summaryGrandTotal');
    const payBtn  = document.getElementById('payBtn');

    list.innerHTML = '';
    let total = 0;
    cart.forEach(item => {
        total += item.price * item.quantity;
        const div = document.createElement('div');
        div.className = 'summary-item';
        div.innerHTML = `<span class="summary-item-name">${item.name} <strong style="color:var(--white)">×${item.quantity}</strong></span><span style="font-weight:600">₹${item.price * item.quantity}</span>`;
        list.appendChild(div);
    });

    if (subEl)   subEl.textContent   = `₹${total}`;
    if (totalEl) totalEl.textContent = `₹${total}`;
    if (payBtn)  payBtn.textContent  = `Pay ₹${total} with Razorpay`;
}

// ─── Input formatting ─────────────────────────────────────────────────────────
function setupInputFormatting() {
    document.getElementById('phone')?.addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });
    document.getElementById('postalCode')?.addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
}

// ─── Validation ───────────────────────────────────────────────────────────────
function clearErrors() { document.querySelectorAll('.form-control').forEach(c => c.classList.remove('invalid')); }

function validateForm() {
    clearErrors();
    let ok = true;

    const checks = [
        ['email',      v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)],
        ['phone',      v => /^[6-9]\d{9}$/.test(v)],
        ['firstName',  v => v.trim().length > 0],
        ['lastName',   v => v.trim().length > 0],
        ['address',    v => v.trim().length > 0],
        ['city',       v => v.trim().length > 0],
        ['postalCode', v => /^\d{6}$/.test(v)],
        ['state',      v => v.length > 0],
    ];

    for (const [id, test] of checks) {
        const el = document.getElementById(id);
        if (!el || !test(el.value || '')) {
            el?.classList.add('invalid');
            ok = false;
        }
    }

    if (!ok) {
        document.querySelector('.form-control.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
}

// ─── Step 1: Validate form + create Razorpay order ───────────────────────────
async function startPayment() {
    if (!validateForm()) return;

    const payBtn = document.getElementById('payBtn');
    payBtn.disabled = true;
    payBtn.textContent = 'Preparing Payment…';

    try {
        // Ask server to create a Razorpay order (server verifies prices)
        const createRes = await fetch('/api/payment/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cart })
        });
        const createData = await createRes.json();

        if (!createData.success) {
            alert(createData.message || 'Could not initiate payment. Please try again.');
            payBtn.disabled = false;
            payBtn.textContent = `Pay ₹${getCartTotal()} with Razorpay`;
            return;
        }

        // Test mode fallback (no real Razorpay keys yet)
        if (createData.testMode) {
            await placeOrderDirect(createData.razorpayOrderId, 'test_pay_' + Date.now(), null, true);
            return;
        }

        // ── Step 2: Open Razorpay checkout popup ──
        const keyRes  = await fetch('/api/razorpay-key');
        const keyData = await keyRes.json();

        const shipping = getShippingDetails();

        const options = {
            key:         keyData.keyId,
            amount:      createData.amount * 100,  // paise
            currency:    'INR',
            name:        'Akana Naturals',
            description: 'Premium Makhana Order',
            order_id:    createData.razorpayOrderId,
            prefill: {
                name:    shipping.fullName,
                email:   shipping.email,
                contact: shipping.phone
            },
            theme:   { color: '#1A3A2B' },
            modal: {
                ondismiss: () => {
                    payBtn.disabled = false;
                    payBtn.textContent = `Pay ₹${createData.amount} with Razorpay`;
                }
            },
            // ── Step 3: Payment success callback ──
            handler: async (response) => {
                await placeOrderDirect(
                    response.razorpay_order_id,
                    response.razorpay_payment_id,
                    response.razorpay_signature,
                    false
                );
            }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', (response) => {
            alert(`Payment failed: ${response.error.description}. Please try again.`);
            payBtn.disabled = false;
            payBtn.textContent = `Pay ₹${createData.amount} with Razorpay`;
        });

        rzp.open();

    } catch (err) {
        console.error(err);
        alert('A network error occurred. Please try again.');
        payBtn.disabled = false;
        payBtn.textContent = `Pay ₹${getCartTotal()} with Razorpay`;
    }
}

// ─── Step 4: Submit order to our server for verification + saving ─────────────
async function placeOrderDirect(razorpayOrderId, razorpayPaymentId, razorpaySignature, testMode) {
    const loader = document.getElementById('paymentLoader');
    if (loader) loader.classList.add('active');

    try {
        const res  = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items:             cart,
                shipping:          getShippingDetails(),
                razorpayOrderId,
                razorpayPaymentId,
                razorpaySignature,
                testMode
            })
        });
        const data = await res.json();

        if (!data.success) {
            if (loader) loader.classList.remove('active');
            alert(`Order error: ${data.message}`);
            return;
        }

        // Success — save and redirect
        localStorage.setItem('akana_placed_order', JSON.stringify(data.order));
        localStorage.removeItem('akana_cart');
        window.location.href = 'success.html';

    } catch (err) {
        if (loader) loader.classList.remove('active');
        alert('Network error saving order. Please contact support with your payment ID: ' + razorpayPaymentId);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getShippingDetails() {
    return {
        fullName:    `${document.getElementById('firstName')?.value} ${document.getElementById('lastName')?.value}`.trim(),
        address:     document.getElementById('address')?.value || '',
        cityStatePin:`${document.getElementById('city')?.value}, ${document.getElementById('state')?.value} – ${document.getElementById('postalCode')?.value}`,
        email:       document.getElementById('email')?.value || '',
        phone:       document.getElementById('phone')?.value || ''
    };
}

function getCartTotal() {
    return cart.reduce((s, i) => s + i.price * i.quantity, 0);
}
