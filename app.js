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

// ============ 永続化 ============

// localStorageから状態を読み込む。読めない場合は初期状態で起動する
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pending: [], started: [] };
    const data = JSON.parse(raw);
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

// 形の壊れた項目を除外する(旧バージョンや手編集されたデータで起動不能になるのを防ぐ)
function sanitizeItems(list, isStarted) {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (it) =>
      it &&
      typeof it.id === "string" &&
      typeof it.title === "string" &&
      Number.isFinite(it.createdAt) &&
      (!isStarted ||
        (Number.isFinite(it.startedAt) &&
          Array.isArray(it.actions) &&
          it.actions.every(
            (a) => a && typeof a.text === "string" && Number.isFinite(a.at)
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

// ============ 表示 ============

const burningList = document.getElementById("burning-list");
const startedList = document.getElementById("started-list");
const burningEmpty = document.getElementById("burning-empty");
const startedEmpty = document.getElementById("started-empty");
const saveErrorEl = document.getElementById("save-error");

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
    li.className = "card";
    li.dataset.id = item.id;
    li.dataset.createdAt = String(item.createdAt);

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = item.title;

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.innerHTML =
      `${formatDateTime(item.createdAt)} に点火 ` +
      `<span class="remaining"></span>`;

    li.append(title, meta, buildCoilSvg(), buildStartControls(item.id));
    burningList.appendChild(li);
  }

  burningEmpty.hidden = state.pending.length > 0;
  tick();
}

// ============ 蚊取り線香の描画 ============

const SVG_NS = "http://www.w3.org/2000/svg";
const COIL_W = 320;
const COIL_H = 100;
const COIL_INSET = 8;

// 長方形の枠線パスを生成する。右辺の中央が始点で、そこから一周して戻る
// (右から点火され、ぐるりと一周燃えて燃え尽きる)
function buildRectPathD() {
  const l = COIL_INSET;
  const t = COIL_INSET;
  const r = COIL_W - COIL_INSET;
  const b = COIL_H - COIL_INSET;
  const my = COIL_H / 2;
  const pts = [[r, my], [r, t], [l, t], [l, b], [r, b], [r, my]];
  return "M" + pts.map(([x, y]) => `${x} ${y}`).join(" L");
}

const COIL_PATH_D = buildRectPathD();

// 線香(長方形の枠線)・灰の跡・火種を重ねたSVGを作る
function buildCoilSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${COIL_W} ${COIL_H}`);
  svg.setAttribute("class", "coil");
  svg.innerHTML =
    `<path class="coil-ash" d="${COIL_PATH_D}"/>` +
    `<path class="coil-fuse" d="${COIL_PATH_D}"/>` +
    `<g class="coil-ember">` +
    `<circle class="ember-glow" r="9"/>` +
    `<circle class="ember-core" r="4"/>` +
    `</g>`;
  return svg;
}

// 毎秒の更新: DOMは作り直さず、残り時間表示と線香の燃え具合だけ書き換える
// (作り直すと入力中の「やったこと」フォームが消えてしまうため)
function tick() {
  const now = Date.now();

  for (const li of burningList.children) {
    const remaining = Number(li.dataset.createdAt) + LIMIT_MS - now;
    const ratio = Math.max(0, Math.min(1, remaining / LIMIT_MS));
    const urgent = remaining > 0 && remaining < URGENT_THRESHOLD_MS;

    const remainingEl = li.querySelector(".remaining");
    remainingEl.textContent =
      remaining > 0 ? formatRemaining(remaining) : "燃え尽きました…";
    remainingEl.classList.toggle("urgent", urgent);

    // 燃えた長さ分だけパスの先頭(外側)を消し、火種を燃焼点へ動かす
    const fuse = li.querySelector(".coil-fuse");
    let total = Number(fuse.dataset.total);
    if (!total) {
      total = fuse.getTotalLength();
      fuse.dataset.total = total;
    }
    // dasharray+dashoffsetで外側(始点)からburntLen分を非表示にする
    // (長さ0のダッシュはlinecap:roundだと点として描かれてしまうため、この方式)
    const burntLen = (1 - ratio) * total;
    fuse.setAttribute("stroke-dasharray", `${total}`);
    fuse.setAttribute("stroke-dashoffset", `${-burntLen}`);

    const ember = li.querySelector(".coil-ember");
    if (remaining > 0) {
      const p = fuse.getPointAtLength(burntLen);
      ember.setAttribute("transform", `translate(${p.x} ${p.y})`);
      ember.style.display = "";
    } else {
      ember.style.display = "none";
    }

    if (remaining <= 0) {
      const id = li.dataset.id;
      // 燃え尽き: アニメーション後に削除(多重削除防止)
      if (!burningOut.has(id)) {
        burningOut.add(id);
        li.classList.add("burn-out");
        li.querySelector(".btn-start")?.remove();
        li.querySelector(".start-form")?.remove();
        setTimeout(() => expireItem(id), BURNOUT_ANIM_MS);
      }
    }
  }
}

// 「着手した」ボタンと、やったこと入力フォーム
function buildStartControls(id) {
  const wrap = document.createElement("div");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-start";
  btn.textContent = "着手した";

  const form = document.createElement("form");
  form.className = "start-form";
  form.hidden = true;
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = ACTION_TEXT_MAXLEN;
  input.placeholder = "何をやった?(必須)";
  input.required = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "記録";
  form.append(input, submit);

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
    li.className = "card started";

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = item.title;

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

    // 追記フォーム
    const form = document.createElement("form");
    form.className = "start-form";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = ACTION_TEXT_MAXLEN;
    input.placeholder = "やったことを追記";
    input.required = true;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "追記";
    form.append(input, submit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      appendAction(item.id, text);
    });

    li.append(title, meta, log, form);
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

render();
// 更新は常に Date.now() 基準で再計算する(累積誤差を持たない)
setInterval(tick, RENDER_INTERVAL_MS);

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
