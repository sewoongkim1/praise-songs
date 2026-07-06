// 고척교회 찬양 아카이브 — 메인
(function () {
  "use strict";
  const { CATEGORIES } = window.CONFIG;
  const $ = (s, el = document) => el.querySelector(s);

  // ---------- 상태 ----------
  let ALL = [];        // 정규화된 전체 곡
  let BYID = {};       // id → 곡
  let VIEW = [];       // 현재 화면 목록
  const state = {
    q: "",
    cat: "찬양대",     // 기본 구분 = 찬양대
    choir: "전체",
    from: "",          // "YYYY-MM-DD" (기본은 최근 달로 init에서 설정)
    to: "",            // "YYYY-MM-DD"
    sort: "recent",    // recent | popular | name
    favOnly: false,
  };
  const FAV_KEY = "praise_favs";
  const favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
  const saveFavs = () => localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));

  // 선택(여러 곡 담아 듣기) — 기본은 전체 선택, 해제한 곡만 deselected에 보관
  const deselected = new Set();
  const selectedList = () => VIEW.filter((s) => !deselected.has(s.id));

  // ---------- 초성 검색 ----------
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  function toCho(str) {
    let out = "";
    for (const ch of String(str)) {
      const c = ch.charCodeAt(0);
      if (c >= 0xAC00 && c <= 0xD7A3) out += CHO[Math.floor((c - 0xAC00) / 588)];
      else out += ch;
    }
    return out;
  }
  const isChoOnly = (s) => /^[ㄱ-ㅎ\s]+$/.test(s);

  // ---------- 정규화 ----------
  function norm(r) {
    const sec = r.duration_sec ?? r.durationSec ?? 0;
    return {
      id: r.id,
      song: r.song || "",
      choir: r.choir || "",
      category: r.category || "기타",
      date: r.svc_date || r.date || "",
      duration: r.duration || fmtDur(sec),
      sec,
      views: r.views || 0,
      thumb: r.thumbnail || `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`,
      isFull: r.is_full ?? (sec >= 1800),
      catOrder: r.category_ordering ?? 9999,
      choirOrder: r.choir_ordering ?? 9999,
    };
  }
  function fmtDur(s) {
    s = +s || 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
  }
  function fmtViews(v) {
    v = +v || 0;
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "천";
    return String(v);
  }
  function fmtDate(d) { return d ? d.replace(/-/g, ".").slice(2) : ""; }

  // ---------- 데이터 로드 ----------
  async function load() {
    try {
      const songs = await API.getSongs();
      if (songs && songs.length) { ALL = songs.map(norm); }
      else throw new Error("empty");
    } catch (e) {
      try {
        const r = await fetch("public/praise.json?v=" + Date.now());
        const j = await r.json();
        ALL = (Array.isArray(j) ? j : j.songs || []).map(norm);
      } catch (e2) { ALL = []; }
    }
    BYID = {};
    ALL.forEach((s) => { BYID[s.id] = s; });
  }

  // ---------- 찬양대 목록(구분·탭에 연동) ----------
  // 구분: category_ordering 순
  function categoryOptions() {
    const m = new Map();
    ALL.forEach((s) => { if (s.category && !m.has(s.category)) m.set(s.category, s.catOrder); });
    return [...m.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "ko")).map((e) => e[0]);
  }
  // 찬양대: choir_ordering 순(현재 선택 구분 내)
  function choirOptions() {
    const m = new Map();
    ALL.forEach((s) => {
      if (state.cat !== "전체" && s.category !== state.cat) return;
      if (s.choir && !m.has(s.choir)) m.set(s.choir, s.choirOrder);
    });
    return [...m.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "ko")).map((e) => e[0]);
  }
  function dataDateRange() {
    let mn = "", mx = "";
    ALL.forEach((s) => { const d = s.date || ""; if (!d) return; if (!mn || d < mn) mn = d; if (d > mx) mx = d; });
    return [mn, mx];
  }

  // ---------- 필터/정렬 ----------
  function apply() {
    const q = state.q.trim();
    const cho = isChoOnly(q);
    VIEW = ALL.filter((s) => {
      const d = s.date || "";
      const dm = d.slice(0, 7);   // YYYY-MM
      if ((state.from || state.to) && !d) return false;  // 날짜 없는 곡은 기간필터 시 제외
      if (state.from && dm < state.from) return false;
      if (state.to && dm > state.to) return false;
      if (state.cat !== "전체" && s.category !== state.cat) return false;
      if (state.choir !== "전체" && s.choir !== state.choir) return false;
      if (state.favOnly && !favs.has(s.id)) return false;
      if (q) {
        const ok = cho ? toCho(s.song).includes(q.replace(/\s/g, ""))
                       : s.song.toLowerCase().includes(q.toLowerCase());
        if (!ok) return false;
      }
      return true;
    });
    VIEW.sort((a, b) => {
      if (state.sort === "popular") return b.views - a.views;
      if (state.sort === "name") return a.song.localeCompare(b.song, "ko");
      return (b.date || "").localeCompare(a.date || "");   // recent(기본)
    });
    renderGrid();
  }

  // ---------- 렌더: 컨트롤 ----------
  function renderControls() {
    // 찬양대 옵션(현재 구분/탭 기준). 현재 선택값이 목록에 없으면 전체로.
    const choirs = choirOptions();
    if (state.choir !== "전체" && !choirs.includes(state.choir)) state.choir = "전체";

    const catOpts = ["전체", ...categoryOptions()]
      .map((c) => `<option value="${esc(c)}" ${state.cat===c?"selected":""}>${c==="전체"?"구분 전체":esc(c)}</option>`).join("");
    const choirOpts = ["전체", ...choirs]
      .map((c) => `<option value="${esc(c)}" ${state.choir===c?"selected":""}>${c==="전체"?"전체":esc(c)}</option>`).join("");
    const [dmin, dmax] = dataDateRange();
    const mmin = dmin.slice(0, 7), mmax = dmax.slice(0, 7);

    $("#controls").innerHTML = `
      <div class="search-row">
        <input id="q" type="search" placeholder="곡명 검색 (초성 가능: ㅈㅇㄴ)" value="${esc(state.q)}" />
      </div>
      <div class="period-row">
        <input type="month" id="f-from" class="date" value="${state.from}" min="${mmin}" max="${mmax}" />
        <span class="tilde">~</span>
        <input type="month" id="f-to" class="date" value="${state.to}" min="${mmin}" max="${mmax}" />
        <button id="f-allperiod" class="period-all">전체</button>
      </div>
      <div class="filter-row">
        <select id="f-cat" class="sel">${catOpts}</select>
        <select id="f-choir" class="sel">${choirOpts}</select>
        <button class="fav-toggle ${state.favOnly ? "on" : ""}" data-favonly>★ 즐겨찾기</button>
      </div>`;

    const qEl = $("#q");
    let t;
    qEl.addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; apply(); }, 200); });
    $("#f-from").addEventListener("change", (e) => { state.from = e.target.value; apply(); });
    $("#f-to").addEventListener("change", (e) => { state.to = e.target.value; apply(); });
    $("#f-allperiod").addEventListener("click", () => { state.from = ""; state.to = ""; renderControls(); apply(); });
    $("#f-cat").addEventListener("change", (e) => { state.cat = e.target.value; state.choir = "전체"; renderControls(); apply(); });
    $("#f-choir").addEventListener("change", (e) => { state.choir = e.target.value; apply(); });
    $("[data-favonly]").addEventListener("click", () => { state.favOnly = !state.favOnly; renderControls(); apply(); });
  }

  // ---------- 렌더: 그리드 ----------
  function renderGrid() {
    $("#count").innerHTML = `<span class="cnt-num">${VIEW.length.toLocaleString()}곡</span>` +
      `<select id="sort" class="sel sort-sel">
         <option value="recent" ${state.sort==="recent"?"selected":""}>최신순</option>
         <option value="popular" ${state.sort==="popular"?"selected":""}>인기순</option>
         <option value="name" ${state.sort==="name"?"selected":""}>가나다순</option>
       </select>`;
    const so = $("#sort");
    if (so) so.addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
    if (!VIEW.length) {
      $("#grid").innerHTML = `<p class="empty">${state.favOnly ? "즐겨찾기한 찬양이 없어요 ★" : "검색 결과가 없어요"}</p>`;
      renderSelBar();
      return;
    }
    $("#grid").innerHTML = VIEW.map((s, i) => `
      <article class="card ${deselected.has(s.id) ? "unsel" : ""}" data-i="${i}" data-id="${s.id}">
        <div class="thumb">
          <img loading="lazy" src="${s.thumb}" alt="" onerror="this.src='https://i.ytimg.com/vi/${s.id}/hqdefault.jpg'" />
          <span class="play-ov">▶</span>
        </div>
        <div class="c-body">
          <h4 class="c-title">${esc(s.song)}</h4>
          <p class="c-sub">${[s.choir && esc(s.choir), fmtDate(s.date)].filter(Boolean).join(" · ")}</p>
          <p class="c-meta"><span class="c-cat">${esc(s.category)}</span> · 조회 ${fmtViews(s.views)} · ⏱ ${s.duration}</p>
        </div>
        <div class="c-actions">
          <input class="pick-cb" type="checkbox" data-pick="${s.id}" ${deselected.has(s.id) ? "" : "checked"} title="담기(기본 선택)" />
          <button class="star ${favs.has(s.id) ? "on" : ""}" data-fav="${s.id}" aria-label="즐겨찾기">${favs.has(s.id) ? "★" : "☆"}</button>
        </div>
      </article>`).join("");

    $("#grid").querySelectorAll(".card").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-fav]") || e.target.closest("[data-pick]")) return;
        openPlayer(+el.dataset.i, VIEW);
      });
    });
    $("#grid").querySelectorAll("[data-fav]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = b.dataset.fav;
        if (favs.has(id)) favs.delete(id); else favs.add(id);
        saveFavs();
        b.classList.toggle("on"); b.textContent = favs.has(id) ? "★" : "☆";
        if (state.favOnly) apply();
      }));
    $("#grid").querySelectorAll("[data-pick]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const id = cb.dataset.pick;
        if (cb.checked) deselected.delete(id); else deselected.add(id);
        cb.closest(".card").classList.toggle("unsel", !cb.checked);
        renderSelBar();
      }));
    renderSelBar();
  }

  // ---------- 선택 바 (전체선택/전체취소 토글 + 선택 듣기) ----------
  function renderSelBar() {
    let bar = $("#selbar");
    if (!VIEW.length) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "selbar"; document.body.appendChild(bar); }
    const sel = selectedList();
    const allSelected = sel.length === VIEW.length;
    bar.innerHTML = `
      <button class="sb-toggle" id="sb-toggle">${allSelected ? "☑ 전체취소" : "☐ 전체선택"}</button>
      <span class="sb-count">${sel.length}곡</span>
      <button class="sb-play" id="sb-play" ${sel.length ? "" : "disabled"}>▶ 선택 듣기</button>`;
    $("#sb-toggle").onclick = () => {
      if (allSelected) VIEW.forEach((s) => deselected.add(s.id));   // 전체취소
      else VIEW.forEach((s) => deselected.delete(s.id));           // 전체선택
      renderGrid();
    };
    $("#sb-play").onclick = () => { const l = selectedList(); if (l.length) openPlayer(0, l); };
  }

  // ---------- 플레이어 (YouTube IFrame API) ----------
  let ytPlayer = null, ytReady = false, wakeLock = null;
  let activeQueue = [];   // 재생 곡 배열(VIEW 또는 선택 목록)
  let playOrder = [];     // activeQueue 인덱스의 재생 순서
  let orderPos = -1;      // playOrder 내 현재 위치
  let curIdx = -1;        // activeQueue 내 현재 인덱스

  const isOn = (sel) => $(sel).getAttribute("aria-pressed") === "true";
  function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  window.onYouTubeIframeAPIReady = function () { ytReady = true; };
  (function loadYT() {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  })();

  async function reqWake() {
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
  }
  function relWake() { try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null; }

  // 재생 순서 생성(셔플 여부 반영, startIdx를 현재로)
  function buildOrder(startIdx) {
    const n = activeQueue.length;
    let ord = [...Array(n).keys()];
    if (isOn("#pl-shuffle")) {
      shuffleArr(ord);
      const p = ord.indexOf(startIdx);
      if (p > 0) { ord.splice(p, 1); ord.unshift(startIdx); }
    }
    playOrder = ord;
    orderPos = Math.max(0, playOrder.indexOf(startIdx));
    curIdx = playOrder[orderPos];
  }

  function setMeta() {
    const s = activeQueue[curIdx]; if (!s) return;
    $("#pl-title").textContent = s.song;
    $("#pl-sub").textContent = [s.choir, s.category, fmtDate(s.date)].filter(Boolean).join(" · ")
      + (activeQueue.length > 1 ? `  ·  ${orderPos + 1}/${activeQueue.length}곡` : "");
  }
  function loadCur() {
    const s = activeQueue[curIdx]; if (!s) return;
    setMeta();
    if (ytPlayer) ytPlayer.loadVideoById(s.id);
  }
  function gotoPos(pos) {
    if (pos < 0 || pos >= playOrder.length) return;
    orderPos = pos; curIdx = playOrder[pos]; loadCur(); updateNav();
  }
  // 이전/다음 버튼 활성/비활성 (반복이면 순환 가능하므로 항상 활성)
  function updateNav() {
    const rep = isOn("#pl-repeat");
    const single = playOrder.length <= 1;
    const prev = $("#pl-prev"), next = $("#pl-next");
    if (prev) prev.disabled = single || (!rep && orderPos <= 0);
    if (next) next.disabled = single || (!rep && orderPos >= playOrder.length - 1);
  }

  function openPlayer(i, queueArr) {
    activeQueue = queueArr && queueArr.length ? queueArr : VIEW;
    if (i < 0 || i >= activeQueue.length) return;
    buildOrder(i);
    $("#player-modal").hidden = false;
    document.body.style.overflow = "hidden";
    setMeta();
    updateNav();
    reqWake();

    const startIt = () => {
      const vid = activeQueue[curIdx].id;
      if (ytPlayer) { ytPlayer.loadVideoById(vid); return; }
      ytPlayer = new YT.Player("yt-player", {
        videoId: vid,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
        events: {
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) onEnded(); },
          onError: () => { onEnded(); },
        },
      });
    };
    if (ytReady) startIt();
    else { const w = setInterval(() => { if (ytReady) { clearInterval(w); startIt(); } }, 100); }
  }

  function onEnded() {
    // 곡 끝나면 자동으로 다음곡(연속재생 기본). 마지막이면 반복일 때만 처음으로
    if (orderPos + 1 < playOrder.length) { gotoPos(orderPos + 1); return; }
    if (isOn("#pl-repeat")) {
      if (isOn("#pl-shuffle")) buildOrder(playOrder[Math.floor(Math.random() * playOrder.length)]);
      else { orderPos = 0; curIdx = playOrder[0]; }
      loadCur(); updateNav();
    }
  }
  function closePlayer() {
    $("#player-modal").hidden = true;
    document.body.style.overflow = "";
    try { ytPlayer && ytPlayer.stopVideo(); } catch (e) {}
    relWake();
  }
  function toggleBtn(sel) {
    const b = $(sel); const on = !isOn(sel);
    b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on);
    return on;
  }

  $("#player-modal").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePlayer));
  $("#pl-prev").addEventListener("click", () => {
    if (orderPos - 1 >= 0) gotoPos(orderPos - 1);
    else if (isOn("#pl-repeat")) gotoPos(playOrder.length - 1);
  });
  $("#pl-next").addEventListener("click", () => {
    if (orderPos + 1 < playOrder.length) gotoPos(orderPos + 1);
    else if (isOn("#pl-repeat")) gotoPos(0);
  });
  $("#pl-repeat").addEventListener("click", () => { toggleBtn("#pl-repeat"); updateNav(); });
  $("#pl-shuffle").addEventListener("click", () => {
    toggleBtn("#pl-shuffle");
    if (activeQueue.length) buildOrder(curIdx);   // 현재 곡 유지하며 이후 순서 재구성
    updateNav();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#player-modal").hidden) closePlayer(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && wakeLock === null && !$("#player-modal").hidden) reqWake(); });

  // ---------- util ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- 시작 ----------
  (async function init() {
    await load();
    // 기본 기간 = 가장 최근 달(연·월)
    let latest = "";
    ALL.forEach((s) => { if ((s.date || "") > latest) latest = s.date; });
    if (latest) { state.from = latest.slice(0, 7); state.to = latest.slice(0, 7); }
    renderControls();
    apply();
    if (window.hideSplash) window.hideSplash();
  })();
})();
