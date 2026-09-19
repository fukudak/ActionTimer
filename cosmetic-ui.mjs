import { CATALOG, FREE_SKIN_ID, createCosmeticStore, createDefaultBillingClient, resolveDefaultStoreOrigin, storeProductUrl } from "./cosmetic-store.mjs";

export function initializeCosmeticUI({ documentRef = document, locationRef = location, historyRef = history, store = createCosmeticStore({ billingClient: createDefaultBillingClient(locationRef) }), storeOrigin = resolveDefaultStoreOrigin(locationRef) } = {}) {
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
      const preview = documentRef.createElement("button"); preview.type = "button"; preview.textContent = selected === product.id ? "試着中" : "試着"; preview.addEventListener("click", () => { store.tryOn(product.id); applySkin(store.getSelectedSkin()); render(); status.textContent = `${product.name}を試着中です。再読み込みすると無料配色に戻ります。`; });
      let primary;
      if (owned.has(product.id)) {
        primary = documentRef.createElement("button");
        primary.type = "button";
        primary.textContent = "このテーマを使う";
        primary.disabled = selected === product.id;
        primary.addEventListener("click", () => { store.selectSkin(product.id); applySkin(store.getSelectedSkin()); render(); status.textContent = `${product.name}を選択しました。`; });
      } else {
        primary = documentRef.createElement("a");
        primary.className = "skin-store-link";
        primary.textContent = "Storeで購入";
        primary.href = storeProductUrl(product.id, { origin: storeOrigin, sourceApp: "actiontimer" });
      }
      const actions = documentRef.createElement("div"); actions.className = "skin-card__actions"; actions.append(preview, primary); card.append(swatch, title, actions); list.appendChild(card);
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
