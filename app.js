// app.js — Landing page logic (dynamic API version)

let cart = [];

document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    fetchAndRenderProducts();

    // Header scroll effect
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 50);
    });

    // Hamburger menu
    document.getElementById('menuToggle')?.addEventListener('click', () => {
        document.getElementById('mobileNav')?.classList.toggle('open');
    });

    // FAQ accordion
    document.querySelectorAll('.faq-question').forEach(q => {
        q.addEventListener('click', () => {
            const item = q.parentElement;
            document.querySelectorAll('.faq-item').forEach(i => { if (i !== item) i.classList.remove('open'); });
            item.classList.toggle('open');
        });
    });

    // Cart drawer
    document.getElementById('cartToggle')?.addEventListener('click', openCart);
    document.getElementById('cartClose')?.addEventListener('click', closeCart);
    document.getElementById('cartOverlay')?.addEventListener('click', closeCart);

    // Carousel
    initReviewsCarousel();
});

function toggleMobileMenu() {
    document.getElementById('mobileNav')?.classList.remove('open');
}

// ─── Products ─────────────────────────────────────────────────────────────────
async function fetchAndRenderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">Loading flavors…</div>`;

    try {
        const res      = await fetch('/api/products');
        const data     = await res.json();
        const products = data.products || [];

        grid.innerHTML = products.map(p => `
            <div class="product-card" data-id="${p.id}">
                <span class="product-card-badge" style="background-color:${p.badgeColor || 'var(--primary)'}${p.badgeColor === '#D4AF37' ? ';color:var(--primary)' : ''}">${p.badge}</span>
                <div class="product-img-wrapper">
                    <img src="${p.image}" alt="${p.name}" loading="lazy">
                </div>
                <div class="product-info">
                    <h3 class="product-title">${p.name}</h3>
                    <p class="product-desc">${p.description}</p>
                    <div class="stars">${'⭐'.repeat(Math.round(p.rating))} <span>(${p.rating}) · ${p.reviews} reviews</span></div>
                    <div class="product-meta">
                        <div class="product-price"><span>₹${p.originalPrice}</span>₹${p.price}</div>
                        ${p.inStock
                            ? `<button class="btn-add-to-cart" onclick="addToCart('${p.id}','${p.name}',${p.price},'${p.image}')">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Add
                               </button>`
                            : `<span style="font-size:0.85rem;font-weight:700;color:var(--error);padding:8px 12px;background:#FFEBEE;border-radius:6px;">Out of Stock</span>`
                        }
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--error)">Could not load products. Please refresh.</div>`;
    }
}

// ─── Carousel ─────────────────────────────────────────────────────────────────
function initReviewsCarousel() {
    const track = document.getElementById('testimonialTrack');
    const slides = document.querySelectorAll('.testimonial-slide');
    if (!track || slides.length === 0) return;
    let idx = 0;
    const update = () => { track.style.transform = `translateX(-${idx * slides[0].clientWidth}px)`; };
    document.getElementById('nextReview')?.addEventListener('click', () => { idx = (idx + 1) % slides.length; update(); });
    document.getElementById('prevReview')?.addEventListener('click', () => { idx = (idx - 1 + slides.length) % slides.length; update(); });
    window.addEventListener('resize', update);
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
function openCart() {
    document.getElementById('cartDrawer')?.classList.add('open');
    document.getElementById('cartOverlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeCart() {
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('cartOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
}

function addToCart(id, name, price, image) {
    const existing = cart.find(i => i.id === id);
    if (existing) { existing.quantity++; } 
    else { cart.push({ id, name, price, image, quantity: 1 }); }
    saveCart(); renderCart(); openCart();
}

function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    saveCart(); renderCart();
}

function updateQuantity(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) removeFromCart(id);
    else { saveCart(); renderCart(); }
}

function saveCart() { localStorage.setItem('akana_cart', JSON.stringify(cart)); }
function loadCart() {
    try { cart = JSON.parse(localStorage.getItem('akana_cart') || '[]'); } catch { cart = []; }
    renderCart();
}

function renderCart() {
    const container   = document.getElementById('cartItemsContainer');
    const badge       = document.getElementById('cartBadgeCount');
    const subtotalEl  = document.getElementById('cartSubtotal');
    const grandTotalEl= document.getElementById('cartGrandTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!container) return;

    let totalItems = 0, total = 0;
    container.innerHTML = '';

    if (cart.length === 0) {
        container.innerHTML = `<div class="cart-empty-message">Your cart is empty. Add some flavors!</div>`;
        if (checkoutBtn) { checkoutBtn.style.pointerEvents = 'none'; checkoutBtn.style.opacity = '0.5'; }
    } else {
        if (checkoutBtn) { checkoutBtn.style.pointerEvents = 'auto'; checkoutBtn.style.opacity = '1'; }
        cart.forEach(item => {
            totalItems += item.quantity;
            total += item.price * item.quantity;
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <img class="cart-item-img" src="${item.image}" alt="${item.name}">
                <div class="cart-item-details">
                    <div>
                        <div class="cart-item-title">${item.name}</div>
                        <div class="cart-item-price">₹${item.price}</div>
                    </div>
                    <div class="cart-item-actions">
                        <div class="quantity-controls">
                            <button class="qty-btn" onclick="updateQuantity('${item.id}',-1)">-</button>
                            <span class="qty-val">${item.quantity}</span>
                            <button class="qty-btn" onclick="updateQuantity('${item.id}',1)">+</button>
                        </div>
                        <button class="btn-remove-item" onclick="removeFromCart('${item.id}')">Remove</button>
                    </div>
                </div>`;
            container.appendChild(div);
        });
    }

    if (badge) badge.textContent = totalItems;
    if (subtotalEl) subtotalEl.textContent = `₹${total}`;
    if (grandTotalEl) grandTotalEl.textContent = `₹${total}`;
}
