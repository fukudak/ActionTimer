import { CATALOG, FREE_SKIN_ID, createCosmeticStore, createDefaultBillingClient, isLocalHost } from "./cosmetic-store.mjs";

export function initializeCosmeticUI({ documentRef = document, locationRef = location, historyRef = history, store = createCosmeticStore({ billingClient: createDefaultBillingClient(locationRef) }) } = {}) {
  const status = documentRef.getElementById("skin-store-status");
  const list = documentRef.getElementById("skin-catalog");
  function applySkin(id) {
    const product = CATALOG.find((item) => item.id === id);
    documentRef.documentElement.dataset.skin = id;
    if (product) documentRef.documentElement.style.setProperty("--skin-accent", product.color);
    else documentRef.documentElement.style.removeProperty("--skin-accent");
  }
  function render() {
    const owned = new Set(store.getEntitlements());
    const selected = store.getSelectedSkin();
    list.textContent = "";
    for (const product of CATALOG) {
      const card = documentRef.createElement("li"); card.className = "skin-card";
      const swatch = documentRef.createElement("span"); swatch.className = "skin-card__swatch"; swatch.style.backgroundColor = product.color; swatch.setAttribute("aria-hidden", "true");
      const title = documentRef.createElement("strong"); title.textContent = product.name;
      const price = documentRef.createElement("span"); price.textContent = "税込500円";
      const preview = documentRef.createElement("button"); preview.type = "button"; preview.textContent = selected === product.id ? "試着中" : "試着"; preview.addEventListener("click", () => { store.tryOn(product.id); applySkin(store.getSelectedSkin()); render(); status.textContent = `${product.name}を試着中です。再読み込みすると無料配色に戻ります。`; });
      const buy = documentRef.createElement("button"); buy.type = "button"; buy.textContent = owned.has(product.id) ? "選択" : "購入する"; buy.disabled = owned.has(product.id) && selected === product.id; buy.addEventListener("click", async () => {
        if (owned.has(product.id)) { store.selectSkin(product.id); applySkin(store.getSelectedSkin()); render(); status.textContent = `${product.name}を選択しました。`; return; }
        try {
          const result = await store.checkout(product.id);
          const purchaseId = result?.purchase_id || result?.purchaseId;
          if (isLocalHost(locationRef) && purchaseId) {
            status.textContent = "ローカル決済を確認しています…";
            await store.fakeCompletePurchase(purchaseId);
            await store.refreshEntitlements();
            const code = await store.confirmPurchaseCode(purchaseId, product.id);
            status.textContent = code ? `購入ありがとうございます。購入コード: ${code}` : "決済を確認できませんでした。しばらくしてからもう一度お試しください。";
            render();
          } else if (result?.checkout_url) {
            locationRef.assign(result.checkout_url);
          } else {
            status.textContent = "決済を確認中です。入金確認後に配色が解放されます。";
          }
        } catch { status.textContent = "購入手続きを開始できませんでした。接続を確認してください。"; }
      });
      const actions = documentRef.createElement("div"); actions.className = "skin-card__actions"; actions.append(preview, buy); card.append(swatch, title, price, actions); list.appendChild(card);
    }
    const free = documentRef.createElement("button"); free.type = "button"; free.className = "skin-free"; free.textContent = selected === FREE_SKIN_ID ? "無料の明るい和風配色（選択中）" : "無料の明るい和風配色"; free.addEventListener("click", () => { store.selectSkin(FREE_SKIN_ID); applySkin(FREE_SKIN_ID); render(); });
    list.appendChild(free); applySkin(selected);
  }
  async function completeCheckoutReturn() {
    const returnUrl = new URL(locationRef.href); const result = store.handleCheckoutReturn(returnUrl); if (!result.success) return;
    returnUrl.searchParams.delete("checkout"); returnUrl.searchParams.delete("session_id"); historyRef.replaceState(null, "", `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`); status.textContent = "決済を確認しています…";
    try {
      const success = await store.confirmCheckoutSuccess(result.sessionId);
      await store.refreshEntitlements();
      const productId = success?.product || success?.product_id;
      const purchaseId = success?.purchase_id || success?.purchaseId;
      const code = purchaseId && productId ? await store.confirmPurchaseCode(purchaseId, productId) : null;
      status.textContent = code ? `購入ありがとうございます。購入コード: ${code}` : "決済を確認できませんでした。しばらくしてからもう一度お試しください。";
    } catch { status.textContent = "決済の確認に失敗しました。通信環境をご確認ください。"; }
    render();
  }
  const restoreForm = documentRef.getElementById("skin-restore-form");
  const restoreCode = documentRef.getElementById("skin-restore-code");
  if (restoreForm && restoreCode) restoreForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await store.restore(restoreCode.value.trim()); status.textContent = "購入情報を復元しました。"; restoreCode.value = ""; render(); }
    catch { status.textContent = "購入情報を復元できませんでした。"; }
  });
  render();
  const startupRefresh = store.refreshEntitlements().then(render).catch(() => undefined);
  const checkoutReturn = completeCheckoutReturn();
  return { store, render, startupRefresh, checkoutReturn };
}

if (typeof document !== "undefined") initializeCosmeticUI();
