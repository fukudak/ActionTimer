import { CATALOG, FREE_SKIN_ID, createCosmeticStore, createDefaultBillingClient, resolveDefaultStoreOrigin, storeEntryUrl } from "./cosmetic-store.mjs";

export function initializeCosmeticUI({ documentRef = document, locationRef = location, historyRef = history, store = createCosmeticStore({ billingClient: createDefaultBillingClient(locationRef) }), storeOrigin = resolveDefaultStoreOrigin(locationRef) } = {}) {
  const status = documentRef.getElementById("skin-store-status");
  const list = documentRef.getElementById("skin-catalog");
  const linkSlot = documentRef.getElementById("store-link-slot");
  function applySkin(id) {
    const product = CATALOG.find((item) => item.id === id);
    documentRef.documentElement.dataset.skin = id;
    if (product) documentRef.documentElement.style.setProperty("--skin-accent", product.color);
    else documentRef.documentElement.style.removeProperty("--skin-accent");
  }
  function renderStoreLink() {
    if (!linkSlot) return;
    linkSlot.textContent = "";
    const url = storeEntryUrl({ origin: storeOrigin, sourceApp: "actiontimer" });
    const control = url ? documentRef.createElement("a") : documentRef.createElement("button");
    control.className = "skin-store-link";
    control.id = "store-link";
    control.textContent = "ストアを開く";
    if (url) control.href = url;
    else { control.type = "button"; control.disabled = true; }
    linkSlot.appendChild(control);
  }
  function render() {
    const owned = new Set(store.getEntitlements());
    const selected = store.getSelectedSkin();
    list.textContent = "";
    for (const product of CATALOG) {
      if (!owned.has(product.id)) continue;
      const card = documentRef.createElement("li"); card.className = "skin-card";
      const swatch = documentRef.createElement("span"); swatch.className = "skin-card__swatch"; swatch.style.backgroundColor = product.color; swatch.setAttribute("aria-hidden", "true");
      const title = documentRef.createElement("strong"); title.textContent = product.name;
      const apply = documentRef.createElement("button"); apply.type = "button";
      if (selected === product.id) {
        apply.textContent = "無料配色に戻す";
        apply.addEventListener("click", () => { store.selectSkin(FREE_SKIN_ID); applySkin(FREE_SKIN_ID); render(); status.textContent = "無料の明るい和風配色に戻しました。"; });
      } else {
        apply.textContent = "このテーマを使う";
        apply.addEventListener("click", () => { store.selectSkin(product.id); applySkin(product.id); render(); status.textContent = `${product.name}を選択しました。`; });
      }
      card.append(swatch, title, apply); list.appendChild(card);
    }
    list.hidden = list.children.length === 0;
    renderStoreLink();
    applySkin(selected);
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
