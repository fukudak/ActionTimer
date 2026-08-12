"use strict";

const LIMIT_MS = 72 * 60 * 60 * 1000;
const URGENT_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const BURNOUT_ANIM_MS = 1600;
const MS_PER_MINUTE = 60 * 1000;
const STORAGE_KEY = "kichijitsu-timer-v1";
const RENDER_INTERVAL_MS = 1000;

let needsPersist = false;
let state = loadState();
const burningOut = new Set();
let tickTimerId = 0;

function emptyState() { return { pending: [], unexploded: [] }; }
function isValidTimestamp(value) { return Number.isFinite(value) && !Number.isNaN(new Date(value).getTime()); }
function hasSafeDeadline(createdAt) { return isValidTimestamp(createdAt) && isValidTimestamp(createdAt + LIMIT_MS); }
function sanitizeItems(list, kind) {
  if (!Array.isArray(list)) return [];
  return list.filter((it) => {
    if (!it || typeof it.id !== "string" || typeof it.title !== "string" || !hasSafeDeadline(it.createdAt)) return false;
    if (kind === "unexploded") return isValidTimestamp(it.failedAt);
    return true;
  });
}
function normalize(data, now = Date.now()) {
  const result = emptyState();
  const ids = new Set();
  for (const item of sanitizeItems(data?.pending, "pending")) {
    if (ids.has(item.id)) continue;
    if (item.createdAt + LIMIT_MS <= now) {
      result.unexploded.push({ id: item.id, title: item.title, createdAt: item.createdAt, failedAt: item.createdAt + LIMIT_MS });
    } else {
      result.pending.push({ id: item.id, title: item.title, createdAt: item.createdAt });
    }
    ids.add(item.id);
  }
  for (const item of sanitizeItems(data?.unexploded, "unexploded")) {
    if (ids.has(item.id)) continue;
    result.unexploded.push({
      id: item.id,
      title: item.title,
      createdAt: item.createdAt,
      failedAt: item.createdAt + LIMIT_MS,
    });
    ids.add(item.id);
  }
  return result;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      needsPersist = true;
      return emptyState();
    }
    const normalized = normalize(data);
    const canonicalSource = {
      pending: data.pending ?? [],
      unexploded: data.unexploded ?? [],
    };
    if (
      Object.keys(data).some((key) => key !== "pending" && key !== "unexploded") ||
      JSON.stringify(normalized) !== JSON.stringify(canonicalSource)
    ) {
      needsPersist = true;
    }
    return normalized;
  } catch (e) {
    console.error(`保存データの読み込みに失敗したため、初期状態で開始します。(localStorageの「${STORAGE_KEY}」が破損しています。不要なら削除してください)`, e);
    return emptyState();
  }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveErrorEl.hidden = true;
  } catch (e) {
    console.error("保存に失敗:", e);
    saveErrorEl.textContent = "保存に失敗しました。ブラウザの空き容量不足か、プライベートブラウズ中の可能性があります。空き容量を確保するか、通常モードで開き直してください。";
    saveErrorEl.hidden = false;
  }
}
function addItem(title) {
  state.pending.push({ id: crypto.randomUUID(), title, createdAt: Date.now() });
  saveState(); render();
}
function startItem(id) {
  const index = state.pending.findIndex((it) => it.id === id);
  if (index < 0) return;
  const item = state.pending[index];
  if (Date.now() >= item.createdAt + LIMIT_MS) {
    state.pending.splice(index, 1);
    state.unexploded.push({ ...item, failedAt: item.createdAt + LIMIT_MS });
    saveState(); render();
    uiStatusEl.textContent = `「${item.title}」は燃え尽き、不発弾になりました。`;
    focusHeading(unexplodedHeading);
    return;
  }
  state.pending.splice(index, 1);
  saveState(); render();
  uiStatusEl.textContent = `「${item.title}」を着手しました。`;
  focusHeading(burningHeading);
}
function expireItem(id) {
  const index = state.pending.findIndex((it) => it.id === id);
  if (index < 0) { burningOut.delete(id); return; }
  const item = state.pending.splice(index, 1)[0];
  state.unexploded.push({ ...item, failedAt: item.createdAt + LIMIT_MS });
  burningOut.delete(id); saveState(); render();
  uiStatusEl.textContent = `「${item.title}」は燃え尽き、不発弾になりました。`;
}
function reigniteItem(id) {
  const index = state.unexploded.findIndex((it) => it.id === id);
  if (index < 0) return;
  const item = state.unexploded.splice(index, 1)[0];
  state.pending.push({ id: item.id, title: item.title, createdAt: Date.now() });
  saveState(); render();
  uiStatusEl.textContent = `「${item.title}」を再点火しました。新しい72時間が始まります。`;
  const card = [...burningList.children].find((el) => el.dataset.id === id);
  card?.focus();
}
function deleteUnexploded(id) {
  const item = state.unexploded.find((it) => it.id === id);
  if (!item) return;
  if (!confirm(`「${item.title}」を削除します。この操作は取り消せません。`)) return;
  state.unexploded = state.unexploded.filter((it) => it.id !== id);
  saveState(); render();
  uiStatusEl.textContent = `「${item.title}」を削除しました。`;
  focusHeading(unexplodedHeading);
}
function serializeState() { return JSON.stringify(state, null, 2); }
function backupStamp(now = new Date()) { const p = (n) => String(n).padStart(2, "0"); return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`; }
function exportData() {
  const blob = new Blob([serializeState()], { type: "application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `kichijitsu-backup-${backupStamp()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  showDataStatus("データを書き出しました。安全な場所に保管してください。");
}
function importState(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return 0;
  const incoming = normalize(data);
  const known = new Set([...state.pending, ...state.unexploded].map((it) => it.id));
  let added = 0;
  for (const item of [...incoming.pending, ...incoming.unexploded]) {
    if (known.has(item.id)) continue;
    const target = item.failedAt !== undefined ? state.unexploded : state.pending;
    target.push(item); known.add(item.id); added++;
  }
  saveState(); render(); return added;
}
function importFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data; try { data = JSON.parse(reader.result); } catch { showDataStatus("読み込みに失敗しました。JSONとして壊れているようです。", true); return; }
    if (!data || typeof data !== "object" || Array.isArray(data)) { showDataStatus("読み込みに失敗しました。対応していない形式です。", true); return; }
    const added = importState(data);
    showDataStatus(added > 0 ? `${added}件を読み込みました。` : "追加された項目はありませんでした(すべて取り込み済みか対象なし)。");
  };
  reader.onerror = () => showDataStatus("ファイルの読み込み中にエラーが発生しました。", true);
  reader.readAsText(file);
}
const burningList = document.getElementById("burning-list");
const unexplodedList = document.getElementById("unexploded-list");
const burningEmpty = document.getElementById("burning-empty");
const unexplodedEmpty = document.getElementById("unexploded-empty");
const burningHeading = document.getElementById("burning-heading");
const unexplodedHeading = document.getElementById("unexploded-heading");
const saveErrorEl = document.getElementById("save-error");
const dataStatusEl = document.getElementById("data-status");
const uiStatusEl = document.getElementById("ui-status");
if (needsPersist) saveState();
function focusHeading(el) { el?.focus?.(); }
function showDataStatus(message, isError = false) { dataStatusEl.textContent = message; dataStatusEl.classList.toggle("error", isError); dataStatusEl.hidden = false; }
function formatRemaining(ms) { const totalMin = Math.floor(ms / MS_PER_MINUTE); const h = Math.floor(totalMin / 60); const m = totalMin % 60; const s = Math.floor((ms % MS_PER_MINUTE) / 1000); if (h > 0) return `残り ${h}時間${m}分`; if (m > 0) return `残り ${m}分${s}秒`; return `残り ${s}秒`; }
function formatDateTime(ts) { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function render() { renderBurning(); renderUnexploded(); }
function renderBurning() {
  burningList.textContent = "";
  for (const item of state.pending) {
    const li = document.createElement("li"); li.className = "card task-row task-row--burning"; li.dataset.id = item.id; li.dataset.createdAt = String(item.createdAt); li.tabIndex = -1;
    const note = document.createElement("div"); note.className = "task-row__note";
    const sticky = document.createElement("div"); sticky.className = "sticky-note";
    const ash = document.createElement("div"); ash.className = "sticky-note__ash"; ash.setAttribute("aria-hidden", "true");
    const surface = document.createElement("div"); surface.className = "sticky-note__surface"; surface.setAttribute("aria-hidden", "true");
    const front = document.createElement("div"); front.className = "sticky-note__burn-front"; front.setAttribute("aria-hidden", "true");
    const title = document.createElement("p"); title.className = "sticky-note__title card-title"; title.textContent = item.title; sticky.append(ash, surface, front, title);
    const progress = document.createElement("progress"); progress.className = "burn-meter"; progress.min = 0; progress.max = 1; progress.value = 0; progress.setAttribute("aria-label", "燃焼進行度"); note.append(sticky, progress);
    const meta = document.createElement("div"); meta.className = "task-row__meta card-meta";
    const badge = document.createElement("span"); badge.className = "status-badge"; const badgeText = document.createElement("span"); badgeText.className = "status-badge__text"; badgeText.textContent = "燃焼中"; badge.append(badgeText);
    const remaining = document.createElement("span"); remaining.className = "remaining"; const ignited = document.createElement("time"); ignited.className = "ignited-at"; ignited.textContent = `${formatDateTime(item.createdAt)} 点火`; meta.append(badge, remaining, ignited);
    li.append(note, meta, buildStartControls(item)); burningList.appendChild(li);
  }
  burningEmpty.hidden = state.pending.length > 0;
  if (state.pending.length && !tickTimerId) tickTimerId = setInterval(tick, RENDER_INTERVAL_MS);
  if (!state.pending.length && tickTimerId) { clearInterval(tickTimerId); tickTimerId = 0; }
  tick();
}
function tick() {
  const now = Date.now();
  for (const li of burningList.children) {
    const createdAt = Number(li.dataset.createdAt); const remaining = createdAt + LIMIT_MS - now; const progress = Math.max(0, Math.min(1, (now - createdAt) / LIMIT_MS));
    li.querySelector(".remaining").textContent = remaining > 0 ? formatRemaining(remaining) : "燃え尽きました";
    li.querySelector(".remaining").classList.toggle("urgent", remaining > 0 && remaining < URGENT_THRESHOLD_MS);
    li.querySelector(".status-badge__text").textContent = remaining > 0 ? (remaining < URGENT_THRESHOLD_MS ? "期限間近" : "燃焼中") : "燃え尽きました";
    li.querySelector(".burn-meter").value = progress; li.style.setProperty("--burn-progress", String(progress)); li.style.setProperty("--burn-edge", `${(1 - (remaining <= 0 ? 1 : progress * 0.6)) * 100}%`); li.classList.toggle("is-expired", remaining <= 0);
    if (remaining <= 0 && !burningOut.has(li.dataset.id)) { burningOut.add(li.dataset.id); li.classList.add("burn-out"); li.querySelector(".btn-start")?.setAttribute("disabled", "true"); setTimeout(() => expireItem(li.dataset.id), BURNOUT_ANIM_MS); }
  }
}
function buildStartControls(item) {
  const wrap = document.createElement("div"); wrap.className = "task-row__actions";
  const button = document.createElement("button"); button.type = "button"; button.className = "btn-start"; button.textContent = "着手した"; button.setAttribute("aria-label", `「${item.title}」を着手したとして消す`); button.addEventListener("click", () => startItem(item.id)); wrap.appendChild(button); return wrap;
}
function renderUnexploded() {
  unexplodedList.textContent = "";
  for (const item of state.unexploded) {
    const li = document.createElement("li"); li.className = "card task-row task-row--unexploded unexploded"; li.dataset.id = item.id; li.tabIndex = -1;
    const note = document.createElement("div"); note.className = "unexploded-note"; const title = document.createElement("p"); title.className = "unexploded-note__title card-title"; title.textContent = item.title; note.appendChild(title);
    const meta = document.createElement("p"); meta.className = "unexploded-meta card-meta"; meta.textContent = `${formatDateTime(item.failedAt)} に燃え尽き`;
    const badge = document.createElement("span"); badge.className = "status-badge status-badge--unexploded"; badge.textContent = "不発弾"; meta.appendChild(badge);
    const actions = document.createElement("div"); actions.className = "unexploded-actions";
    const reignite = document.createElement("button"); reignite.type = "button"; reignite.className = "btn-reignite"; reignite.textContent = "再点火"; reignite.setAttribute("aria-label", `「${item.title}」を再点火する`); reignite.addEventListener("click", () => reigniteItem(item.id));
    const del = document.createElement("button"); del.type = "button"; del.className = "btn-delete"; del.textContent = "削除"; del.setAttribute("aria-label", `「${item.title}」を削除する`); del.addEventListener("click", () => deleteUnexploded(item.id)); actions.append(reignite, del); li.append(note, meta, actions); unexplodedList.appendChild(li);
  }
  unexplodedEmpty.hidden = state.unexploded.length > 0;
}

document.getElementById("add-form").addEventListener("submit", (e) => { e.preventDefault(); const input = document.getElementById("add-input"); const title = input.value.trim(); if (!title) return; addItem(title); input.value = ""; input.focus(); });
document.getElementById("export-btn").addEventListener("click", exportData);
const importInput = document.getElementById("import-input"); document.getElementById("import-btn").addEventListener("click", () => { importInput.value = ""; importInput.click(); }); importInput.addEventListener("change", () => { const file = importInput.files && importInput.files[0]; if (file) importFromFile(file); });
render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch((e) => console.error("Service Workerの登録に失敗しました。", e));
