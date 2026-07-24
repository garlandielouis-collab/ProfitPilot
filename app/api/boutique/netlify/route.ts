import { NextRequest, NextResponse } from 'next/server';
import { zipSync, strToU8 } from 'fflate';
import { getSupabaseServer } from '../../../../lib/supabaseServerClient';
import { getSupabaseService } from '../../../../lib/supabaseServiceClient';

// ── Generate the static store HTML ───────────────────────────────────────────

function isValidCSSColor(c: unknown): boolean {
  if (typeof c !== 'string' || !c) return false;
  return /^#[0-9a-fA-F]{3,8}$/.test(c) || /^(rgb|hsl)a?\(/.test(c) || /^[a-z]+$/i.test(c);
}

function generateStoreHTML(settings: any, products: any[]): string {
  const primary   = isValidCSSColor(settings.primary_color)   ? settings.primary_color   : '#001F3F';
  const secondary = isValidCSSColor(settings.secondary_color) ? settings.secondary_color : '#50C878';
  const name      = settings.store_name      ?? 'Ma Boutique';
  const tagline   = settings.tagline         ?? '';
  const currency  = settings.currency        ?? 'HTG';
  const showPrice = settings.show_prices     !== false;
  const showStock = settings.show_stock      === true;

  const fmt = (n: number) =>
    new Intl.NumberFormat('fr-HT', { minimumFractionDigits: 0 }).format(n) + ' ' + currency;

  const productCards = products.map((p) => {
    const price      = p.sale_price ?? p.price;
    const hasDisc    = p.sale_price !== null && p.sale_price < p.price;
    const outOfStock = p.stock_quantity <= 0;
    const discPct    = hasDisc ? Math.round((1 - p.sale_price / p.price) * 100) : 0;
    const img        = p.image_url
      ? `<img src="${p.image_url}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;">`
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:3rem;color:#cbd5e1;">📦</div>`;

    const priceLine = showPrice
      ? `<div style="margin-top:8px;display:flex;align-items:baseline;gap:8px;">
           <span style="font-size:1.1rem;font-weight:700;color:${primary};">${fmt(price)}</span>
           ${hasDisc ? `<span style="font-size:.75rem;color:#94a3b8;text-decoration:line-through;">${fmt(p.price)}</span>` : ''}
         </div>` : '';

    const stockLine = showStock
      ? `<p style="font-size:.7rem;font-weight:600;margin-top:4px;color:${p.stock_quantity > 5 ? '#10b981' : p.stock_quantity > 0 ? '#f59e0b' : '#ef4444'};">
           ${p.stock_quantity > 0 ? p.stock_quantity + ' en stock' : 'Épuisé'}
         </p>` : '';

    const discBadge = hasDisc
      ? `<span style="position:absolute;top:8px;left:8px;background:#ef4444;color:#fff;font-size:.6rem;font-weight:700;padding:2px 6px;border-radius:6px;">-${discPct}%</span>`
      : '';

    const outBadge = outOfStock
      ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
           <span style="background:rgba(255,255,255,.9);padding:4px 12px;border-radius:8px;font-size:.75rem;font-weight:700;color:#374151;">Épuisé</span>
         </div>` : '';

    return `
    <div class="product-card" style="border-radius:16px;border:1px solid #e2e8f0;background:#fff;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .2s;" onmouseover="this.style.boxShadow='0 4px 24px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow='none'">
      <div style="position:relative;aspect-ratio:1/1;background:#f1f5f9;overflow:hidden;">
        ${img}${discBadge}${outBadge}
      </div>
      <div style="padding:12px;flex:1;display:flex;flex-direction:column;">
        ${p.category ? `<p style="font-size:.7rem;color:#94a3b8;margin:0 0 2px;">${p.category}</p>` : ''}
        <p style="font-size:.9rem;font-weight:600;color:#1e293b;margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${p.name}</p>
        ${priceLine}${stockLine}
        <button
          onclick="addToCart('${p.id}','${p.name.replace(/'/g, "\\'")}',${price})"
          ${outOfStock ? 'disabled' : ''}
          style="margin-top:auto;padding-top:12px;background:${primary};color:#fff;border:none;border-radius:10px;padding:8px;font-size:.78rem;font-weight:700;cursor:pointer;width:100%;opacity:${outOfStock ? '.4' : '1'};"
        >${outOfStock ? 'Épuisé' : '+ Ajouter au panier'}</button>
      </div>
    </div>`;
  }).join('\n');

  const paymentMethods = (settings.payment_methods ?? ['cash']).map((m: string) => {
    const labels: Record<string, string> = { cash: '💵 Paiement à la livraison', moncash: '📱 MonCash', natcash: '📱 NatCash', card: '💳 Carte bancaire' };
    return `<span style="display:inline-block;background:#f1f5f9;border-radius:8px;padding:4px 12px;font-size:.8rem;color:#374151;margin:4px;">${labels[m] ?? m}</span>`;
  }).join('');

  const shippingModes = (settings.shipping_modes ?? []).map((m: any) =>
    `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;">
       <span style="font-size:.85rem;color:#374151;">${m.label}</span>
       <span style="font-size:.85rem;color:#64748b;">${m.days} — ${m.price === 0 ? 'Gratuit' : m.price + ' ' + currency}</span>
     </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${settings.meta_title ?? name}</title>
  <meta name="description" content="${settings.meta_description ?? tagline}">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b}
    nav{background:${primary};padding:12px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(0,0,0,.15)}
    .cart-btn{background:${secondary};color:#fff;border:none;border-radius:10px;padding:8px 16px;font-weight:700;cursor:pointer;font-size:.85rem}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
    @media(max-width:640px){.grid{grid-template-columns:repeat(2,1fr);gap:10px}}
    #cart-drawer{position:fixed;right:-400px;top:0;bottom:0;width:360px;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.15);z-index:200;transition:right .3s;padding:24px;display:flex;flex-direction:column;gap:16px;overflow-y:auto}
    #cart-drawer.open{right:0}
    #overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:190}
    #overlay.open{display:block}
  </style>
</head>
<body>
  <!-- Nav -->
  <nav>
    <div style="display:flex;align-items:center;gap:12px;">
      ${settings.logo_url ? `<img src="${settings.logo_url}" alt="logo" style="height:36px;border-radius:8px;">` : ''}
      <span style="color:#fff;font-weight:800;font-size:1.1rem;">${name}</span>
    </div>
    <button class="cart-btn" onclick="toggleCart()">
      🛒 Panier (<span id="cart-count">0</span>)
    </button>
  </nav>

  <!-- Hero -->
  <section style="background:${settings.banner_url ? `url(${settings.banner_url}) center/cover no-repeat` : `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`};min-height:260px;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px 24px;position:relative;">
    ${settings.banner_url ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,.35);"></div>' : ''}
    <div style="position:relative;z-index:1;">
      <h1 style="color:#fff;font-size:2.5rem;font-weight:900;text-shadow:0 2px 8px rgba(0,0,0,.3);">${name}</h1>
      ${tagline ? `<p style="color:rgba(255,255,255,.9);margin-top:12px;font-size:1.1rem;">${tagline}</p>` : ''}
    </div>
  </section>

  <!-- Products -->
  <main style="max-width:1200px;margin:0 auto;padding:40px 24px;">
    <h2 style="font-size:1.4rem;font-weight:800;color:#1e293b;margin-bottom:24px;">Nos produits (${products.length})</h2>
    ${products.length === 0
      ? `<div style="text-align:center;padding:80px;color:#94a3b8;"><p style="font-size:3rem;">📦</p><p style="margin-top:12px;font-size:1.1rem;">Aucun produit disponible</p></div>`
      : `<div class="grid">${productCards}</div>`
    }

    <!-- Payment & Shipping info -->
    <div style="margin-top:64px;display:grid;grid-template-columns:1fr 1fr;gap:24px;" class="info-grid">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:24px;">
        <h3 style="font-weight:700;margin-bottom:12px;color:#1e293b;">💳 Paiement</h3>
        <div>${paymentMethods || '<span style="color:#94a3b8;font-size:.85rem;">Non configuré</span>'}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:24px;">
        <h3 style="font-weight:700;margin-bottom:12px;color:#1e293b;">🚚 Livraison</h3>
        ${shippingModes || '<p style="color:#94a3b8;font-size:.85rem;">Non configuré</p>'}
      </div>
    </div>

    ${settings.contact_email || settings.contact_phone ? `
    <div style="margin-top:32px;background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:24px;">
      <h3 style="font-weight:700;margin-bottom:12px;color:#1e293b;">📞 Contact</h3>
      ${settings.contact_email ? `<p style="font-size:.9rem;color:#374151;">✉️ ${settings.contact_email}</p>` : ''}
      ${settings.contact_phone ? `<p style="font-size:.9rem;color:#374151;margin-top:6px;">📱 ${settings.contact_phone}</p>` : ''}
      ${settings.contact_address ? `<p style="font-size:.9rem;color:#374151;margin-top:6px;">📍 ${settings.contact_address}</p>` : ''}
    </div>` : ''}
  </main>

  <style>@media(max-width:640px){.info-grid{grid-template-columns:1fr!important}}</style>

  <!-- Footer -->
  <footer style="background:${primary};color:rgba(255,255,255,.7);text-align:center;padding:24px;margin-top:48px;font-size:.8rem;">
    <p>© ${new Date().getFullYear()} ${name} — Propulsé par <strong style="color:#fff;">ProfitPilot</strong></p>
  </footer>

  <!-- Cart Drawer -->
  <div id="overlay" onclick="toggleCart()"></div>
  <div id="cart-drawer">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h2 style="font-weight:800;">🛒 Mon Panier</h2>
      <button onclick="toggleCart()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:#64748b;">✕</button>
    </div>
    <div id="cart-items" style="flex:1;"></div>
    <div id="cart-total" style="border-top:2px solid #e2e8f0;padding-top:16px;"></div>
    <button id="checkout-btn" onclick="checkout()" style="background:${primary};color:#fff;border:none;border-radius:12px;padding:14px;font-weight:700;cursor:pointer;font-size:1rem;width:100%;">
      Commander →
    </button>
  </div>

  <!-- Checkout Modal -->
  <div id="checkout-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;align-items:center;justify-content:center;">
    <div style="background:#fff;border-radius:20px;padding:32px;width:90%;max-width:480px;max-height:90vh;overflow-y:auto;">
      <h2 style="font-weight:800;margin-bottom:20px;">Finaliser la commande</h2>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <input id="o-name"    placeholder="Nom complet *"   style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-size:.9rem;outline:none;">
        <input id="o-phone"   placeholder="Téléphone *"     style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-size:.9rem;outline:none;">
        <input id="o-email"   placeholder="Email"           style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-size:.9rem;outline:none;">
        <input id="o-address" placeholder="Adresse livraison *" style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-size:.9rem;outline:none;">
        <textarea id="o-notes" placeholder="Notes (optionnel)" rows="2" style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-size:.9rem;resize:none;outline:none;"></textarea>
      </div>
      <div id="checkout-total" style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:12px;font-weight:700;font-size:1.1rem;text-align:center;"></div>
      <div style="display:flex;gap:12px;margin-top:16px;">
        <button onclick="submitOrder()" style="flex:1;background:${primary};color:#fff;border:none;border-radius:12px;padding:14px;font-weight:700;cursor:pointer;">✅ Confirmer</button>
        <button onclick="document.getElementById('checkout-modal').style.display='none'" style="flex:1;background:#f1f5f9;color:#374151;border:none;border-radius:12px;padding:14px;font-weight:700;cursor:pointer;">Annuler</button>
      </div>
    </div>
  </div>

  <script>
    const STORE_BUSINESS_ID = '${settings.business_id}';
    const CURRENCY = '${currency}';
    let cart = [];

    function fmt(n){ return new Intl.NumberFormat('fr-HT',{minimumFractionDigits:0}).format(n)+' '+CURRENCY; }

    function addToCart(id, name, price){
      const existing = cart.find(i=>i.id===id);
      if(existing){ existing.qty++; }
      else{ cart.push({id, name, price, qty:1}); }
      renderCart();
      if(!document.getElementById('cart-drawer').classList.contains('open')) toggleCart();
    }

    function renderCart(){
      const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
      document.getElementById('cart-count').textContent = cart.reduce((s,i)=>s+i.qty,0);
      document.getElementById('cart-items').innerHTML = cart.length === 0
        ? '<p style="color:#94a3b8;text-align:center;padding:32px 0;">Panier vide</p>'
        : cart.map(i=>\`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f1f5f9;">
            <div style="flex:1;">
              <p style="font-size:.9rem;font-weight:600;">\${i.name}</p>
              <p style="font-size:.8rem;color:#64748b;">\${fmt(i.price)} × \${i.qty}</p>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button onclick="changeQty('\${i.id}',-1)" style="background:#f1f5f9;border:none;width:26px;height:26px;border-radius:6px;cursor:pointer;font-weight:700;">−</button>
              <span style="font-weight:700;">\${i.qty}</span>
              <button onclick="changeQty('\${i.id}',1)" style="background:#f1f5f9;border:none;width:26px;height:26px;border-radius:6px;cursor:pointer;font-weight:700;">+</button>
            </div>
          </div>\`).join('');
      document.getElementById('cart-total').innerHTML = \`<div style="display:flex;justify-content:space-between;font-weight:700;font-size:1rem;"><span>Total</span><span style="color:${primary};">\${fmt(total)}</span></div>\`;
    }

    function changeQty(id, delta){
      const i = cart.find(x=>x.id===id);
      if(!i) return;
      i.qty += delta;
      if(i.qty <= 0) cart = cart.filter(x=>x.id!==id);
      renderCart();
    }

    function toggleCart(){
      document.getElementById('cart-drawer').classList.toggle('open');
      document.getElementById('overlay').classList.toggle('open');
    }

    function checkout(){
      if(cart.length===0) return;
      const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
      document.getElementById('checkout-total').textContent = 'Total : '+fmt(total);
      document.getElementById('checkout-modal').style.display='flex';
      toggleCart();
    }

    async function submitOrder(){
      const name    = document.getElementById('o-name').value.trim();
      const phone   = document.getElementById('o-phone').value.trim();
      const email   = document.getElementById('o-email').value.trim();
      const address = document.getElementById('o-address').value.trim();
      const notes   = document.getElementById('o-notes').value.trim();
      if(!name||!phone||!address){ alert('Veuillez remplir les champs obligatoires.'); return; }
      const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
      const body = {
        business_id: STORE_BUSINESS_ID,
        customer_name: name, customer_phone: phone, customer_email: email||'',
        shipping_address: { line1: address, city:'', country:'Haiti' },
        shipping_mode: 'standard', payment_method: 'cash', notes,
        items: cart.map(i=>({ product_id:i.id, product_name:i.name, product_image:null, quantity:i.qty, unit_price:i.price })),
        subtotal: total, shipping_amount: 0, discount_amount: 0, total,
      };
      try {
        const res = await fetch('/api/store/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const json = await res.json();
        if(json.error){ alert('Erreur: '+json.error); return; }
        cart=[];
        renderCart();
        document.getElementById('checkout-modal').style.display='none';
        alert('✅ Commande confirmée ! Nous vous contacterons bientôt.');
      } catch(e){ alert('Erreur réseau. Réessayez.'); }
    }

    renderCart();
  </script>
</body>
</html>`;
}

// ── API route ────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { netlifyToken, siteName } = body;

    if (!netlifyToken) return NextResponse.json({ error: 'Token Netlify requis' }, { status: 400 });

    const svc = getSupabaseService();

    // ── 1. Get ALL businesses owned by this user ──────────────────────────────
    const { data: allBiz } = await svc
      .from('businesses')
      .select('id, name')
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (!allBiz || allBiz.length === 0) {
      return NextResponse.json({ error: 'Aucune entreprise trouvée. Créez une entreprise d\'abord.' }, { status: 404 });
    }

    // ── 2. Find store_settings for ANY of the user's businesses ───────────────
    // Prioritise active cookie, then first result
    const jar = await cookies();
    const activeStoreId = jar.get('pp_active_store')?.value ?? null;

    const bizIds = allBiz.map((b: any) => b.id);

    const { data: allSettings, error: settingsErr } = await svc
      .from('store_settings')
      .select('*')
      .in('business_id', bizIds)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (settingsErr) {
      console.error('[netlify] store_settings query error:', settingsErr.message);
      return NextResponse.json({
        error: `Erreur base de données: ${settingsErr.message}. Vérifiez que les migrations ont été appliquées.`,
      }, { status: 500 });
    }

    // Pick settings: prefer active store cookie, otherwise most recent
    const rawSettings = (allSettings ?? []).find((s: any) => s.business_id === activeStoreId)
      ?? (allSettings ?? [])[0]
      ?? null;

    console.log('[netlify] bizIds:', bizIds, 'activeStoreId:', activeStoreId, 'allSettings count:', allSettings?.length ?? 0);

    const biz = rawSettings
      ? (allBiz.find((b: any) => b.id === rawSettings.business_id) ?? allBiz[0])
      : (allBiz.find((b: any) => b.id === activeStoreId) ?? allBiz[0]);

    const businessId: string = (biz as any).id;

    if (!rawSettings) {
      return NextResponse.json({
        error: `Boutique non configurée pour vos entreprises (${bizIds.length} trouvée(s)). Allez dans l'onglet "Général" de la boutique, remplissez les informations et cliquez sur "Enregistrer" avant de déployer.`,
      }, { status: 400 });
    }

    // Use the real saved settings — no defaults
    const settings = rawSettings;

    // ── 3. Fetch products — use user_id (how products are created) ────────────
    const { data: products, error: prodErr } = await svc
      .from('products')
      .select('id, name, category, sale_price, purchase_price, image_url, stock_quantity, currency, created_at')
      .eq('user_id', user.id)
      .order('name', { ascending: true })
      .limit(500);

    if (prodErr) console.error('[netlify] products error:', prodErr.message);

    const mappedProducts = (products ?? []).map((p: any) => ({
      id:             p.id,
      name:           p.name,
      category:       p.category ?? null,
      price:          Number(p.sale_price ?? p.purchase_price ?? 0),
      sale_price:     null as null,
      image_url:      p.image_url ?? null,
      stock_quantity: Number(p.stock_quantity ?? 0),
      created_at:     p.created_at,
    }));

    // ── 4. Verify Netlify token ───────────────────────────────────────────────
    const meRes = await fetch('https://api.netlify.com/api/v1/user', {
      headers: { Authorization: `Bearer ${netlifyToken}` },
    });
    if (!meRes.ok) {
      return NextResponse.json({ error: 'Token Netlify invalide. Vérifiez votre token sur app.netlify.com.' }, { status: 401 });
    }

    // ── 5. Generate HTML ──────────────────────────────────────────────────────
    const html = generateStoreHTML(settings, mappedProducts);

    // ── 6. Create or reuse Netlify site ──────────────────────────────────────
    const existingSiteId = (rawSettings as any)?.netlify_site_id ?? null;
    let siteId   = '';
    let siteUrl  = '';

    if (existingSiteId) {
      const siteRes = await fetch(`https://api.netlify.com/api/v1/sites/${existingSiteId}`, {
        headers: { Authorization: `Bearer ${netlifyToken}` },
      });
      if (siteRes.ok) {
        const sd = await siteRes.json();
        siteId  = sd.id;
        siteUrl = sd.ssl_url ?? sd.url ?? '';
      }
    }

    if (!siteId) {
      // Build a unique site name
      const baseName = siteName?.trim()
        || (settings as any).slug
        || biz.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const uniqueName = `pp-${baseName}-${Date.now().toString(36)}`;

      const createRes = await fetch('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${netlifyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: uniqueName }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        return NextResponse.json({ error: `Création du site Netlify échouée : ${err}` }, { status: 500 });
      }
      const created = await createRes.json();
      siteId  = created.id;
      siteUrl = created.ssl_url ?? created.url ?? '';
    }

    // ── 7. Deploy ZIP ─────────────────────────────────────────────────────────
    const zipBytes = zipSync({ 'index.html': strToU8(html) }, { level: 1 });

    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${netlifyToken}`,
        'Content-Type': 'application/zip',
      },
      body: zipBytes,
    });

    if (!deployRes.ok) {
      const err = await deployRes.text();
      return NextResponse.json({ error: `Déploiement échoué : ${err}` }, { status: 500 });
    }

    const deploy   = await deployRes.json();
    const finalUrl = deploy.ssl_url ?? deploy.url ?? siteUrl;

    // ── 8. Persist site info ──────────────────────────────────────────────────
    await svc.from('store_settings').upsert(
      {
        business_id:      businessId,
        netlify_site_id:  siteId,
        netlify_site_url: finalUrl,
        // Keep existing settings fields intact
        store_name:      (settings as any).store_name ?? biz.name,
        slug:            (settings as any).slug ?? biz.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        primary_color:   (settings as any).primary_color   ?? '#001F3F',
        secondary_color: (settings as any).secondary_color ?? '#50C878',
        is_active:       (settings as any).is_active       ?? false,
        show_prices:     (settings as any).show_prices     ?? true,
        show_stock:      (settings as any).show_stock      ?? false,
        currency:        (settings as any).currency        ?? 'HTG',
      } as any,
      { onConflict: 'business_id' },
    );

    return NextResponse.json({
      success:      true,
      url:          finalUrl,
      siteId,
      productCount: mappedProducts.length,
    });
  } catch (e: any) {
    console.error('[netlify deploy]', e);
    return NextResponse.json({ error: e.message ?? 'Erreur inconnue' }, { status: 500 });
  }
}
