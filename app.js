"use strict";

// ============ 定数・状態 ============

// 72時間の法則: 登録から72時間で燃え尽きる
const LIMIT_MS = 72 * 60 * 60 * 1000;
// 残りこの時間を切ったら警告色にする
const URGENT_THRESHOLD_MS = 12 * 60 * 60 * 1000;
// 燃え尽きアニメーションの長さ。style.cssの「animation: burnout 1.6s」と一致させること
const BURNOUT_ANIM_MS = 1600;
const MS_PER_MINUTE = 60 * 1000;
// 「やったこと」入力の最大文字数
const ACTION_TEXT_MAXLEN = 200;
const STORAGE_KEY = "kichijitsu-timer-v1";
const RENDER_INTERVAL_MS = 1000;

// state.pending: 燃えている項目 / state.started: 着手済み項目
let state = loadState();

// 燃え尽きアニメーション中の項目ID(多重削除防止)
const burningOut = new Set();

// pending が 0 件のときは毎秒 tick を止める。0 = 停止中
let tickTimerId = 0;

// ============ 永続化 ============

// localStorageから状態を読み込む。読めない場合は初期状態で起動する
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pending: [], started: [] };
    const data = JSON.parse(raw);
    // null / 数値 / 配列などオブジェクト以外は初期状態へ(手編集や型不一致)
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { pending: [], started: [] };
    }
    return {
      pending: sanitizeItems(data.pending, false),
      started: sanitizeItems(data.started, true),
    };
  } catch (e) {
    console.error(
      `保存データの読み込みに失敗したため、初期状態で開始します。` +
      `(localStorageの「${STORAGE_KEY}」が破損しています。不要なら削除してください)`,
      e
    );
    return { pending: [], started: [] };
  }
}

// Date APIで安全に扱える有限タイムスタンプか判定する。
// Number.MAX_VALUEのような有限値でもDate範囲外なら描画時にRangeErrorになるため除外する。
function isValidTimestamp(value) {
  return Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
}

// 形の壊れた項目を除外する(旧バージョンや手編集されたデータで起動不能になるのを防ぐ)
function sanitizeItems(list, isStarted) {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (it) =>
      it &&
      typeof it.id === "string" &&
      typeof it.title === "string" &&
      isValidTimestamp(it.createdAt) &&
      (!isStarted ||
        (isValidTimestamp(it.startedAt) &&
          Array.isArray(it.actions) &&
          it.actions.every(
            (a) => a && typeof a.text === "string" && isValidTimestamp(a.at)
          )))
  );
}

// 状態をlocalStorageへ保存する。失敗したら画面上部のバナーで通知する
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveErrorEl.hidden = true;
  } catch (e) {
    console.error("保存に失敗:", e);
    saveErrorEl.textContent =
      "保存に失敗しました。ブラウザの空き容量不足か、プライベートブラウズ中の可能性があります。" +
      "空き容量を確保するか、通常モードで開き直してください。";
    saveErrorEl.hidden = false;
  }
}

// ============ 操作 ============

// 新しい項目を登録して72時間の燃焼を開始する
function addItem(title) {
  state.pending.push({
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
  });
  saveState();
  render();
}

// 着手: やったことを追記して「始めたリスト」へ移動する
function startItem(id, actionText) {
  const idx = state.pending.findIndex((it) => it.id === id);
  if (idx === -1) return;
  const item = state.pending.splice(idx, 1)[0];
  const now = Date.now();
  state.started.unshift({
    ...item,
    startedAt: now,
    actions: [{ text: actionText, at: now }],
  });
  saveState();
  render();
  const started = [...startedList.children].find((el) => el.dataset.id === id);
  if (started) {
    started.classList.add("is-just-started");
    started.focus();
  }
  uiStatusEl.textContent = `「${item.title}」を着手済みに移動しました。`;
}

// 始めた項目に「やったこと」を追記する
function appendAction(id, actionText) {
  const item = state.started.find((it) => it.id === id);
  if (!item) return;
  item.actions.push({ text: actionText, at: Date.now() });
  saveState();
  render();
}

// 燃え尽きた項目を消す(復元なし)
function expireItem(id) {
  state.pending = state.pending.filter((it) => it.id !== id);
  burningOut.delete(id);
  saveState();
  render();
}

// ============ バックアップ(書き出し/読み込み) ============

// 現在の状態をそのままJSON文字列にする(書き出し・テスト共用)
function serializeState() {
  return JSON.stringify(state, null, 2);
}

// 書き出し用ファイル名のタイムスタンプ(YYYYMMDD-HHMM)
function backupStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}`
  );
}

// 状態をJSONファイルとしてダウンロードさせる
function exportData() {
  const blob = new Blob([serializeState()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kichijitsu-backup-${backupStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showDataStatus("データを書き出しました。安全な場所に保管してください。");
}

// 読み込んだデータを現在の状態へマージする(id重複はスキップ)。
// sanitizeItemsを通すため壊れた項目は無視される。追加件数を返す。
function importState(data) {
  const incomingPending = sanitizeItems(data && data.pending, false);
  const incomingStarted = sanitizeItems(data && data.started, true);
  const known = new Set(
    [...state.pending, ...state.started].map((it) => it.id)
  );

  let added = 0;
  for (const it of incomingPending) {
    if (known.has(it.id)) continue;
    state.pending.push(it);
    known.add(it.id);
    added++;
  }
  for (const it of incomingStarted) {
    if (known.has(it.id)) continue;
    state.started.push(it);
    known.add(it.id);
    added++;
  }

  saveState();
  render();
  return added;
}

// 選択されたファイルを読み、JSONとして取り込む
function importFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      showDataStatus(
        "読み込みに失敗しました。JSONとして壊れているようです。",
        true
      );
      return;
    }
    if (!data || typeof data !== "object") {
      showDataStatus("読み込みに失敗しました。対応していない形式です。", true);
      return;
    }
    const added = importState(data);
    showDataStatus(
      added > 0
        ? `${added}件を読み込みました。`
        : "追加された項目はありませんでした(すべて取り込み済みか対象なし)。"
    );
  };
  reader.onerror = () =>
    showDataStatus("ファイルの読み込み中にエラーが発生しました。", true);
  reader.readAsText(file);
}

// ============ 表示 ============

const burningList = document.getElementById("burning-list");
const startedList = document.getElementById("started-list");
const burningEmpty = document.getElementById("burning-empty");
const startedEmpty = document.getElementById("started-empty");
const saveErrorEl = document.getElementById("save-error");
const dataStatusEl = document.getElementById("data-status");
const uiStatusEl = document.getElementById("ui-status");

// バックアップ操作の結果メッセージを表示する
function showDataStatus(message, isError = false) {
  dataStatusEl.textContent = message;
  dataStatusEl.classList.toggle("error", isError);
  dataStatusEl.hidden = false;
}

// 残り時間を「残り N時間M分」形式の文字列にする
function formatRemaining(ms) {
  const totalMin = Math.floor(ms / MS_PER_MINUTE);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % MS_PER_MINUTE) / 1000);
  if (h > 0) return `残り ${h}時間${m}分`;
  if (m > 0) return `残り ${m}分${s}秒`;
  return `残り ${s}秒`;
}

// タイムスタンプを「M/D HH:MM」形式の文字列にする
function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 両リストのDOMを作り直す(状態が変わったときに呼ぶ)
function render() {
  renderBurning();
  renderStarted();
}

// 燃えているリストのDOMを構築する。毎秒の更新はtick()が担当する
function renderBurning() {
  burningList.textContent = "";

  for (const item of state.pending) {
    const li = document.createElement("li");
    li.className = "card task-row task-row--burning";
    li.dataset.id = item.id;
    li.dataset.createdAt = String(item.createdAt);

    li.style.setProperty("--burn-progress", "0");
    li.style.setProperty("--burn-edge", "100%");
    const note = document.createElement("div");
    note.className = "task-row__note";
    const sticky = document.createElement("div");
    sticky.className = "sticky-note";
    const ash = document.createElement("div");
    ash.className = "sticky-note__ash";
    ash.setAttribute("aria-hidden", "true");
    const surface = document.createElement("div");
    surface.className = "sticky-note__surface";
    surface.setAttribute("aria-hidden", "true");
    const front = document.createElement("div");
    front.className = "sticky-note__burn-front";
    front.setAttribute("aria-hidden", "true");
    const title = document.createElement("p");
    title.className = "sticky-note__title card-title";
    title.textContent = item.title;
    sticky.append(ash, surface, front, title);
    const progress = document.createElement("progress");
    progress.className = "burn-meter";
    progress.min = 0;
    progress.max = 1;
    progress.value = 0;
    progress.setAttribute("aria-label", "燃焼進行度");
    note.append(sticky, progress);
    const meta = document.createElement("div");
    meta.className = "task-row__meta card-meta";
    const badge = document.createElement("span");
    badge.className = "status-badge";
    const badgeText = document.createElement("span");
    badgeText.className = "status-badge__text";
    badgeText.textContent = "燃焼中";
    badge.appendChild(badgeText);
    const remainingEl = document.createElement("span");
    remainingEl.className = "remaining";
    const ignited = document.createElement("time");
    ignited.className = "ignited-at";
    ignited.setAttribute("datetime", new Date(item.createdAt).toISOString());
    ignited.textContent = `${formatDateTime(item.createdAt)} 点火`;
    meta.append(badge, remainingEl, ignited);
    li.append(note, meta, buildStartControls(item.id));
    burningList.appendChild(li);
  }

  burningEmpty.hidden = state.pending.length > 0;

  if (state.pending.length > 0) {
    // 燃えている項目がある間だけ毎秒更新する
    if (!tickTimerId) {
      tickTimerId = setInterval(tick, RENDER_INTERVAL_MS);
    }
  } else {
    // 全件燃え尽き/着手済みになったら停止
    if (tickTimerId) {
      clearInterval(tickTimerId);
      tickTimerId = 0;
    }
  }
  tick();
}

// 毎秒の更新: DOMは作り直さず、残り時間と燃焼進行だけを書き換える
// (作り直すと入力中の「やったこと」フォームが消えてしまうため)
function tick() {
  const now = Date.now();

  for (const li of burningList.children) {
    const remaining = Number(li.dataset.createdAt) + LIMIT_MS - now;
    const burnProgress = Math.max(0, Math.min(1, (now - Number(li.dataset.createdAt)) / LIMIT_MS));
    const urgent = remaining > 0 && remaining < URGENT_THRESHOLD_MS;

    const remainingEl = li.querySelector(".remaining");
    remainingEl.textContent = remaining > 0 ? formatRemaining(remaining) : "燃え尽きました";
    remainingEl.classList.toggle("urgent", urgent);
    const badgeText = li.querySelector(".status-badge__text");
    const progress = li.querySelector(".burn-meter");
    badgeText.textContent = remaining > 0 ? (urgent ? "期限間近" : "燃焼中") : "燃え尽きました";
    const visualBurn = remaining <= 0 ? 1 : burnProgress * 0.6;
    const burnEdge = `${(1 - visualBurn) * 100}%`;
    li.style.setProperty("--burn-progress", String(burnProgress));
    li.style.setProperty("--burn-edge", burnEdge);
    progress.value = burnProgress;
    li.classList.toggle("is-urgent", urgent);
    li.classList.toggle("is-expired", remaining <= 0);

    if (remaining <= 0) {
      const id = li.dataset.id;
      // 燃え尽き: アニメーション後に削除(多重削除防止)
      if (!burningOut.has(id)) {
        burningOut.add(id);
        li.classList.add("burn-out");
        li.querySelector(".btn-start")?.setAttribute("disabled", "true");
        li.querySelector(".start-form")?.querySelectorAll("input,button").forEach((el) => el.setAttribute("disabled", "true"));
        setTimeout(() => expireItem(id), BURNOUT_ANIM_MS);
      }
    }
  }
}

// 「着手した」ボタンと、やったこと入力フォーム
function buildStartControls(id) {
  const wrap = document.createElement("div");
  wrap.className = "task-row__actions";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-start";
  btn.textContent = "着手した";

  const form = document.createElement("form");
  form.className = "start-form";
  form.hidden = true;
  const input = document.createElement("input");
  input.id = `action-${id}`;
  input.type = "text";
  input.maxLength = ACTION_TEXT_MAXLEN;
  input.placeholder = "何をやった?(必須)";
  input.setAttribute("aria-label", "着手して行ったこと");
  input.required = true;
  const label = document.createElement("label");
  label.className = "sr-only";
  label.setAttribute("for", input.id);
  label.textContent = "着手して行ったこと";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "記録";
  form.append(label, input, submit);

  btn.addEventListener("click", () => {
    form.hidden = false;
    btn.hidden = true;
    input.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    startItem(id, text);
  });

  wrap.append(btn, form);
  return wrap;
}

// 始めたリストのDOMを構築する(着手日時・やったことログ・追記フォーム)
function renderStarted() {
  startedList.textContent = "";

  for (const item of state.started) {
    const li = document.createElement("li");
    li.className = "card task-row task-row--started started";
    li.dataset.id = item.id;
    li.tabIndex = -1;

    const main = document.createElement("div");
    main.className = "task-row__started-main";
    const badge = document.createElement("span");
    badge.className = "status-badge status-badge--started";
    badge.textContent = "✓ 着手済み";

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = item.title;

    main.append(badge, title);

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = `${formatDateTime(item.startedAt)} に着手`;

    const log = document.createElement("ul");
    log.className = "action-log";
    for (const action of item.actions) {
      const entry = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = action.text;
      const time = document.createElement("span");
      time.className = "action-time";
      time.textContent = formatDateTime(action.at);
      entry.append(text, time);
      log.appendChild(entry);
    }

    const details = document.createElement("details");
    details.className = "task-details";
    const summary = document.createElement("summary");
    summary.textContent = `記録 ${item.actions.length}件・追記`;

    // 追記フォーム
    const form = document.createElement("form");
    form.className = "start-form";
    const input = document.createElement("input");
    input.id = `append-${item.id}`;
    input.type = "text";
    input.maxLength = ACTION_TEXT_MAXLEN;
    input.placeholder = "やったことを追記";
    input.setAttribute("aria-label", "やったことを追記");
    input.required = true;
    const label = document.createElement("label");
    label.className = "sr-only";
    label.setAttribute("for", input.id);
    label.textContent = "やったことを追記";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "追記";
    form.append(label, input, submit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      appendAction(item.id, text);
    });

    details.append(summary, log, form);
    li.append(main, meta, details);
    startedList.appendChild(li);
  }

  startedEmpty.hidden = state.started.length > 0;
}

// ============ 初期化 ============

document.getElementById("add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("add-input");
  const title = input.value.trim();
  if (!title) return;
  addItem(title);
  input.value = "";
  input.focus();
});

// 初回描画。tick タイマーは renderBurning() 内で pending の有無に応じて開始される
render();

// タブ復帰・スリープ復帰時に即座に再計算する(累積誤差を持たない Date.now() 基準の描画)
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.pending.length > 0) tick();
});

// バックアップ: 書き出しボタン
document.getElementById("export-btn").addEventListener("click", exportData);

// バックアップ: 読み込みボタンはhidden<input type="file">を経由する
const importInput = document.getElementById("import-input");
document.getElementById("import-btn").addEventListener("click", () => {
  importInput.value = "";
  importInput.click();
});
importInput.addEventListener("change", () => {
  const file = importInput.files && importInput.files[0];
  if (file) importFromFile(file);
});

// Service Worker登録(file://やSW非対応環境では何もしない)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch((e) => {
    console.error(
      "Service Workerの登録に失敗しました。オフライン対応なしで動作します。" +
      "(ページを再読み込みすると再試行されます)",
      e
    );
  });
}
