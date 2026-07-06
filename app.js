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
    cat: "전체",
    choir: "전체",
    sort: "recent",    // recent | popular | name
    favOnly: false,
  };
  const FAV_KEY = "praise_favs";
  const favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
  const saveFavs = () => localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));

  // 선택(여러 곡 담아 듣기)
  const selected = new Set();
  const selOrder = [];   // 선택 순서 유지

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
  function choirOptions() {
    const set = new Set();
    ALL.forEach((s) => {
      if (state.cat !== "전체" && s.category !== state.cat) return;
      if (s.choir) set.add(s.choir);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }

  // ---------- 필터/정렬 ----------
  function apply() {
    const q = state.q.trim();
    const cho = isChoOnly(q);
    VIEW = ALL.filter((s) => {
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

    const catOpts = ["전체", ...CATEGORIES]
      .map((c) => `<option value="${c}" ${state.cat===c?"selected":""}>${c==="전체"?"구분 전체":c}</option>`).join("");
    const choirOpts = ["전체", ...choirs]
      .map((c) => `<option value="${esc(c)}" ${state.choir===c?"selected":""}>${c==="전체"?"찬양대 전체":esc(c)}</option>`).join("");

    $("#controls").innerHTML = `
      <div class="search-row">
        <input id="q" type="search" placeholder="곡명 검색 (초성 가능: ㅈㅇㄴ)" value="${esc(state.q)}" />
      </div>
      <div class="filter-row">
        <select id="f-cat" class="sel">${catOpts}</select>
        <select id="f-choir" class="sel">${choirOpts}</select>
        <select id="sort" class="sel">
          <option value="recent" ${state.sort==="recent"?"selected":""}>최신순</option>
          <option value="popular" ${state.sort==="popular"?"selected":""}>인기순</option>
          <option value="name" ${state.sort==="name"?"selected":""}>가나다순</option>
        </select>
        <button class="fav-toggle ${state.favOnly ? "on" : ""}" data-favonly>★ 즐겨찾기</button>
      </div>`;

    const qEl = $("#q");
    let t;
    qEl.addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; apply(); }, 200); });
    $("#f-cat").addEventListener("change", (e) => { state.cat = e.target.value; state.choir = "전체"; renderControls(); apply(); });
    $("#f-choir").addEventListener("change", (e) => { state.choir = e.target.value; apply(); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
    $("[data-favonly]").addEventListener("click", () => { state.favOnly = !state.favOnly; renderControls(); apply(); });
  }

  // ---------- 렌더: 그리드 ----------
  function renderGrid() {
    $("#count").textContent = `${VIEW.length.toLocaleString()}곡`;
    if (!VIEW.length) {
      $("#grid").innerHTML = `<p class="empty">${state.favOnly ? "즐겨찾기한 찬양이 없어요 ★" : "검색 결과가 없어요"}</p>`;
      renderSelBar();
      return;
    }
    $("#grid").innerHTML = VIEW.map((s, i) => `
      <article class="card ${selected.has(s.id) ? "sel" : ""}" data-i="${i}" data-id="${s.id}">
        <label class="pick" title="선택해 담기">
          <input type="checkbox" data-pick="${s.id}" ${selected.has(s.id) ? "checked" : ""} />
        </label>
        <div class="thumb">
          <img loading="lazy" src="${s.thumb}" alt="" onerror="this.src='https://i.ytimg.com/vi/${s.id}/hqdefault.jpg'" />
          <span class="dur">${s.duration}</span>
          <button class="star ${favs.has(s.id) ? "on" : ""}" data-fav="${s.id}" aria-label="즐겨찾기">${favs.has(s.id) ? "★" : "☆"}</button>
          <span class="play-ov">▶</span>
        </div>
        <div class="c-body">
          <h4 class="c-title">${esc(s.song)}</h4>
          <p class="c-sub">${s.choir ? esc(s.choir) + " · " : ""}${fmtDate(s.date)}</p>
          <p class="c-meta"><span class="c-cat">${esc(s.category)}</span> · 조회 ${fmtViews(s.views)}</p>
        </div>
      </article>`).join("");

    $("#grid").querySelectorAll(".card").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-fav]") || e.target.closest(".pick")) return;
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
      cb.addEventListener("change", (e) => {
        const id = cb.dataset.pick;
        if (cb.checked) { if (!selected.has(id)) { selected.add(id); selOrder.push(id); } }
        else { selected.delete(id); const k = selOrder.indexOf(id); if (k >= 0) selOrder.splice(k, 1); }
        cb.closest(".card").classList.toggle("sel", cb.checked);
        renderSelBar();
      }));
    renderSelBar();
  }

  // ---------- 선택 바 ----------
  function renderSelBar() {
    let bar = $("#selbar");
    if (!selected.size) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "selbar";
      document.body.appendChild(bar);
    }
    bar.innerHTML = `
      <span class="sb-count">🎵 ${selected.size}곡 선택</span>
      <button class="sb-play" id="sb-play">▶ 선택한 곡 듣기</button>
      <button class="sb-clear" id="sb-clear">해제</button>`;
    $("#sb-play").onclick = () => {
      const list = selOrder.map((id) => BYID[id]).filter(Boolean);
      if (list.length) openPlayer(0, list);
    };
    $("#sb-clear").onclick = () => {
      selected.clear(); selOrder.length = 0;
      document.querySelectorAll("[data-pick]").forEach((c) => { c.checked = false; c.closest(".card").classList.remove("sel"); });
      renderSelBar();
    };
  }

  // ---------- 플레이어 (YouTube IFrame API) ----------
  let ytPlayer = null, ytReady = false, curIdx = -1, wakeLock = null;
  let activeQueue = [];   // 현재 재생 큐(VIEW 또는 선택 목록)

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

  function setMeta(s) {
    $("#pl-title").textContent = s.song;
    $("#pl-sub").textContent = [s.choir, s.category, fmtDate(s.date)].filter(Boolean).join(" · ")
      + (activeQueue.length > 1 ? `  ·  ${curIdx + 1}/${activeQueue.length}곡` : "");
  }

  function openPlayer(i, queueArr) {
    activeQueue = queueArr && queueArr.length ? queueArr : VIEW;
    if (i < 0 || i >= activeQueue.length) return;
    curIdx = i;
    const s = activeQueue[i];
    $("#player-modal").hidden = false;
    document.body.style.overflow = "hidden";
    setMeta(s);
    reqWake();

    const startIt = () => {
      if (ytPlayer) { ytPlayer.loadVideoById(s.id); return; }
      ytPlayer = new YT.Player("yt-player", {
        videoId: s.id,
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
    if (!$("#pl-autonext").checked) return;
    if (curIdx + 1 < activeQueue.length) playAt(curIdx + 1);
  }
  function playAt(i) {
    if (i < 0 || i >= activeQueue.length) return;
    curIdx = i;
    setMeta(activeQueue[i]);
    ytPlayer && ytPlayer.loadVideoById(activeQueue[i].id);
  }
  function closePlayer() {
    $("#player-modal").hidden = true;
    document.body.style.overflow = "";
    try { ytPlayer && ytPlayer.stopVideo(); } catch (e) {}
    relWake();
  }
  $("#player-modal").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePlayer));
  $("#pl-prev").addEventListener("click", () => playAt(curIdx - 1));
  $("#pl-next").addEventListener("click", () => playAt(curIdx + 1));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#player-modal").hidden) closePlayer(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && wakeLock === null && !$("#player-modal").hidden) reqWake(); });

  // ---------- util ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- 시작 ----------
  (async function init() {
    await load();
    renderControls();
    apply();
    if (window.hideSplash) window.hideSplash();
  })();
})();
