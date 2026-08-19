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

function emptyState() { return { pending: [], unexploded: [], history: [] }; }
function isValidTimestamp(value) { return Number.isFinite(value) && !Number.isNaN(new Date(value).getTime()); }
function hasSafeDeadline(createdAt) { return isValidTimestamp(createdAt) && isValidTimestamp(createdAt + LIMIT_MS); }
function sanitizeItems(list, kind) {
  if (!Array.isArray(list)) return [];
  return list.filter((it) => {
    if (!it || typeof it.id !== "string" || typeof it.title !== "string" || !hasSafeDeadline(it.createdAt)) return false;
    if (kind === "unexploded") return isValidTimestamp(it.failedAt);
    if (kind === "history") return isValidTimestamp(it.startedAt) && it.startedAt >= it.createdAt;
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
  const historyIds = new Set();
  for (const item of sanitizeItems(data?.history, "history")) {
    if (historyIds.has(item.id)) continue;
    result.history.push({ id: item.id, title: item.title, createdAt: item.createdAt, startedAt: item.startedAt });
    historyIds.add(item.id);
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
      history: data.history ?? [],
    };
    if (
      Object.keys(data).some((key) => key !== "pending" && key !== "unexploded" && key !== "history") ||
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
    uiStatusEl.textContent = `「${item.title}」は燃え尽きました。`;
    focusHeading(unexplodedHeading);
    return;
  }
  state.pending.splice(index, 1);
  state.history.unshift({ id: crypto.randomUUID(), title: item.title, createdAt: item.createdAt, startedAt: Date.now() });
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
  uiStatusEl.textContent = `「${item.title}」は燃え尽きました。`;
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
function deletePending(id) {
  const item = state.pending.find((it) => it.id === id);
  if (!item) return;
  if (!confirm(`「${item.title}」を削除します。この操作は取り消せません。`)) return;
  state.pending = state.pending.filter((it) => it.id !== id);
  saveState(); render();
  uiStatusEl.textContent = `「${item.title}」を削除しました。`;
  focusHeading(burningHeading);
}

const burningList = document.getElementById("burning-list");
const unexplodedList = document.getElementById("unexploded-list");
const historyList = document.getElementById("history-list");
const burningEmpty = document.getElementById("burning-empty");
const unexplodedEmpty = document.getElementById("unexploded-empty");
const historyEmpty = document.getElementById("history-empty");
const historySummaryEl = document.getElementById("history-summary");
const historyClearBtn = document.getElementById("history-clear");
const burningHeading = document.getElementById("burning-heading");
const unexplodedHeading = document.getElementById("unexploded-heading");
const saveErrorEl = document.getElementById("save-error");
const uiStatusEl = document.getElementById("ui-status");
if (needsPersist) saveState();
function focusHeading(el) { el?.focus?.(); }
function formatRemaining(ms) { const totalMin = Math.floor(ms / MS_PER_MINUTE); const h = Math.floor(totalMin / 60); const m = totalMin % 60; const s = Math.floor((ms % MS_PER_MINUTE) / 1000); if (h > 0) return `残り ${h}時間${m}分`; if (m > 0) return `残り ${m}分${s}秒`; return `残り ${s}秒`; }
function formatDuration(ms) { const totalMin = Math.floor(ms / MS_PER_MINUTE); const h = Math.floor(totalMin / 60); const m = totalMin % 60; if (h > 0) return m > 0 ? `${h}時間${m}分` : `${h}時間`; return `${m}分`; }
function formatDateTime(ts) { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function render() { renderBurning(); renderUnexploded(); renderHistory(); }

// スワイプで削除を出す(ポインターイベントでマウス/タッチ両対応)。
// li自身のdataset/tabIndex/状態クラス/スタイルは変えず、中身だけ .swipe-content に包んでスライドさせる。
function buildSwipeActions() {
  const actions = document.createElement("div"); actions.className = "swipe-actions";
  const delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.className = "swipe-btn btn-delete"; delBtn.textContent = "削除";
  actions.append(delBtn);
  return { actions, delBtn };
}
function initSwipeCell(cell) {
  const content = cell.querySelector(".swipe-content");
  const actions = cell.querySelector(".swipe-actions");
  if (!content || !actions) return;
  let startX = 0, originX = 0, currentX = 0, dragging = false;
  function openWidth() { return actions.getBoundingClientRect().width; }
  function setX(x, animate) {
    content.classList.toggle("dragging", !animate);
    content.style.transform = `translateX(${x}px)`;
    currentX = x;
  }
  cell.closeSwipe = () => setX(0, true);
  content.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, a")) return;
    dragging = true; startX = e.clientX; originX = currentX;
    try { content.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    document.querySelectorAll(".swipe-content").forEach((el) => { if (el !== content) el.style.transform = "translateX(0px)"; });
    e.preventDefault();
  });
  content.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    setX(Math.min(0, Math.max(-openWidth(), originX + delta)), false);
    e.preventDefault();
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    setX(currentX < -openWidth() / 2 ? -openWidth() : 0, true);
  }
  content.addEventListener("pointerup", endDrag);
  content.addEventListener("pointercancel", endDrag);
  content.addEventListener("dragstart", (e) => e.preventDefault());
}
function renderBurning() {
  burningList.textContent = "";
  for (const item of state.pending) {
    const li = document.createElement("li"); li.className = "swipe-cell"; li.dataset.id = item.id; li.dataset.createdAt = String(item.createdAt); li.tabIndex = -1;
    const { actions, delBtn } = buildSwipeActions();
    delBtn.addEventListener("click", () => deletePending(item.id));

    const content = document.createElement("div"); content.className = "swipe-content card task-row task-row--burning";
    const note = document.createElement("div"); note.className = "fuse-note";
    const title = document.createElement("span"); title.className = "fuse-title card-title"; title.textContent = item.title;
    note.appendChild(title);
    const progress = document.createElement("progress"); progress.className = "burn-meter sr-only"; progress.min = 0; progress.max = 1; progress.value = 0; progress.setAttribute("aria-label", `燃焼進行度: ${item.title}`);
    const meta = document.createElement("div"); meta.className = "task-row__meta card-meta";
    const remaining = document.createElement("span"); remaining.className = "remaining"; meta.append(remaining, progress);
    content.append(note, buildStartControls(item), meta);

    li.append(actions, content); burningList.appendChild(li);
    initSwipeCell(li);
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
    li.querySelector(".burn-meter").value = progress; li.style.setProperty("--burn-progress", String(progress)); li.style.setProperty("--burn-edge", `${(1 - progress) * 100}%`); li.classList.toggle("is-expired", remaining <= 0);
    if (remaining <= 0 && !burningOut.has(li.dataset.id)) { burningOut.add(li.dataset.id); li.classList.add("burn-out"); li.querySelector(".btn-start")?.setAttribute("disabled", "true"); setTimeout(() => expireItem(li.dataset.id), BURNOUT_ANIM_MS); }
  }
}
function buildStartControls(item) {
  const wrap = document.createElement("div"); wrap.className = "task-row__actions";
  const button = document.createElement("button"); button.type = "button"; button.className = "btn-start"; button.textContent = "着手"; button.setAttribute("aria-label", `「${item.title}」を着手として消す`); button.addEventListener("click", () => startItem(item.id)); wrap.appendChild(button); return wrap;
}
function renderUnexploded() {
  unexplodedList.textContent = "";
  for (const item of state.unexploded) {
    const li = document.createElement("li"); li.className = "swipe-cell"; li.dataset.id = item.id; li.tabIndex = -1;
    const { actions: swipeActions, delBtn } = buildSwipeActions();
    delBtn.setAttribute("aria-label", `「${item.title}」を削除する`);
    delBtn.addEventListener("click", () => deleteUnexploded(item.id));

    const content = document.createElement("div"); content.className = "swipe-content card task-row task-row--unexploded unexploded";
    const note = document.createElement("div"); note.className = "unexploded-note"; const title = document.createElement("p"); title.className = "unexploded-note__title card-title"; title.textContent = item.title; note.appendChild(title);
    const reigniteWrap = document.createElement("div"); reigniteWrap.className = "unexploded-actions";
    const reignite = document.createElement("button"); reignite.type = "button"; reignite.className = "btn-reignite"; reignite.textContent = "再点火"; reignite.setAttribute("aria-label", `「${item.title}」を再点火する`); reignite.addEventListener("click", () => reigniteItem(item.id));
    reigniteWrap.appendChild(reignite);
    content.append(note, reigniteWrap);

    li.append(swipeActions, content); unexplodedList.appendChild(li);
    initSwipeCell(li);
  }
  unexplodedEmpty.hidden = state.unexploded.length > 0;
}
function renderHistory() {
  historyList.textContent = "";
  for (const item of state.history) {
    const li = document.createElement("li"); li.className = "card history-row"; li.dataset.id = item.id; li.tabIndex = -1;
    const title = document.createElement("p"); title.className = "card-title history-row__title"; title.textContent = item.title;
    const meta = document.createElement("p"); meta.className = "card-meta history-row__meta";
    meta.textContent = `${formatDateTime(item.startedAt)} 着手・点火から${formatDuration(item.startedAt - item.createdAt)}`;
    li.append(title, meta); historyList.appendChild(li);
  }
  historyEmpty.hidden = state.history.length > 0;
  historyClearBtn.hidden = state.history.length === 0;
  const resolvedCount = state.history.length + state.unexploded.length;
  historySummaryEl.textContent = "";
  if (state.history.length === 0 || resolvedCount === 0) {
    historySummaryEl.hidden = true;
    return;
  }
  const avgMs = state.history.reduce((sum, it) => sum + (it.startedAt - it.createdAt), 0) / state.history.length;
  const rate = Math.round((state.history.length / resolvedCount) * 100);
  historySummaryEl.hidden = false;
  historySummaryEl.append(
    buildStat(`${rate}%(${state.history.length}/${resolvedCount})`, "着手率"),
    buildStat(formatDuration(avgMs), "平均着手時間"),
  );
}
function buildStat(value, label) {
  const stat = document.createElement("div"); stat.className = "stat";
  const valueEl = document.createElement("p"); valueEl.className = "stat__value"; valueEl.textContent = value;
  const labelEl = document.createElement("p"); labelEl.className = "stat__label"; labelEl.textContent = label;
  stat.append(valueEl, labelEl); return stat;
}
function clearHistory() {
  if (state.history.length === 0) return;
  if (!confirm("着手履歴をすべて削除します。この操作は取り消せません。")) return;
  state.history = [];
  saveState(); render();
  uiStatusEl.textContent = "着手履歴をすべて削除しました。";
  focusHeading(document.getElementById("history-heading"));
}

document.getElementById("add-form").addEventListener("submit", (e) => { e.preventDefault(); const input = document.getElementById("add-input"); const title = input.value.trim(); if (!title) return; addItem(title); input.value = ""; input.focus(); });
historyClearBtn.addEventListener("click", clearHistory);

// 今/履歴の切り替え(履歴ボタンで進み、戻るボタンで戻る)
const historyToggle = document.getElementById("history-toggle");
const historyBack = document.getElementById("history-back");
const viewNow = document.getElementById("view-now");
const viewHistory = document.getElementById("view-history");
function showView(name) {
  const isHistory = name === "history";
  viewNow.classList.toggle("view--active", !isHistory);
  viewHistory.classList.toggle("view--active", isHistory);
}
historyToggle.addEventListener("click", () => showView("history"));
historyBack.addEventListener("click", () => showView("now"));

render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch((e) => console.error("Service Workerの登録に失敗しました。", e));
