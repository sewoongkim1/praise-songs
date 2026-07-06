// 고척교회 찬양 아카이브 — 메인
(function () {
  "use strict";
  const { CATEGORIES } = window.CONFIG;
  const $ = (s, el = document) => el.querySelector(s);

  // ---------- 상태 ----------
  let ALL = [];        // 정규화된 전체 곡
  let VIEW = [];       // 현재 화면 목록
  const state = {
    q: "",
    cat: "전체",
    tab: "song",       // song | full
    sort: "recent",    // recent | popular | name
    favOnly: false,
  };
  const FAV_KEY = "praise_favs";
  const favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
  const saveFavs = () => localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));

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
      if (songs && songs.length) { ALL = songs.map(norm); return; }
      throw new Error("empty");
    } catch (e) {
      // 폴백: 정적 praise.json
      try {
        const r = await fetch("public/praise.json?v=" + Date.now());
        const j = await r.json();
        ALL = (Array.isArray(j) ? j : j.songs || []).map(norm);
      } catch (e2) {
        ALL = [];
      }
    }
  }

  // ---------- 필터/정렬 ----------
  function apply() {
    const q = state.q.trim();
    const cho = isChoOnly(q);
    VIEW = ALL.filter((s) => {
      if (state.tab === "full" ? !s.isFull : s.isFull) return false;
      if (state.cat !== "전체" && s.category !== state.cat) return false;
      if (state.favOnly && !favs.has(s.id)) return false;
      if (q) {
        const hay = (s.song + " " + s.choir);
        const ok = cho ? toCho(hay).includes(q.replace(/\s/g, ""))
                       : hay.toLowerCase().includes(q.toLowerCase());
        if (!ok) return false;
      }
      return true;
    });
    VIEW.sort((a, b) => {
      if (state.sort === "popular") return b.views - a.views;
      if (state.sort === "name") return a.song.localeCompare(b.song, "ko");
      return (b.date || "").localeCompare(a.date || "");   // recent
    });
    renderGrid();
  }

  // ---------- 렌더: 컨트롤 ----------
  function renderControls() {
    const chips = ["전체", ...CATEGORIES]
      .map((c) => `<button class="chip ${state.cat === c ? "on" : ""}" data-cat="${c}">${c}</button>`).join("");
    $("#controls").innerHTML = `
      <div class="search-row">
        <input id="q" type="search" placeholder="곡명·찬양대 검색 (초성 가능: ㅈㅇㄴ)" value="${esc(state.q)}" />
      </div>
      <div class="tab-row">
        <button class="tab ${state.tab === "song" ? "on" : ""}" data-tab="song">🎵 찬양</button>
        <button class="tab ${state.tab === "full" ? "on" : ""}" data-tab="full">⛪ 전체예배</button>
        <button class="fav-toggle ${state.favOnly ? "on" : ""}" data-favonly>★ 즐겨찾기</button>
      </div>
      <div class="chip-row">${chips}</div>
      <div class="sort-row">
        <select id="sort">
          <option value="recent" ${state.sort==="recent"?"selected":""}>최신순</option>
          <option value="popular" ${state.sort==="popular"?"selected":""}>인기순</option>
          <option value="name" ${state.sort==="name"?"selected":""}>가나다순</option>
        </select>
      </div>`;

    const qEl = $("#q");
    let t;
    qEl.addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; apply(); }, 200); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });
    $("#controls").querySelectorAll("[data-cat]").forEach((b) =>
      b.addEventListener("click", () => { state.cat = b.dataset.cat; renderControls(); apply(); }));
    $("#controls").querySelectorAll("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => { state.tab = b.dataset.tab; renderControls(); apply(); }));
    $("[data-favonly]").addEventListener("click", () => { state.favOnly = !state.favOnly; renderControls(); apply(); });
  }

  // ---------- 렌더: 그리드 ----------
  function renderGrid() {
    $("#count").textContent = `${VIEW.length.toLocaleString()}곡`;
    if (!VIEW.length) {
      $("#grid").innerHTML = `<p class="empty">${state.favOnly ? "즐겨찾기한 찬양이 없어요 ★" : "검색 결과가 없어요"}</p>`;
      return;
    }
    $("#grid").innerHTML = VIEW.map((s, i) => `
      <article class="card" data-i="${i}">
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
        if (e.target.closest("[data-fav]")) return;
        openPlayer(+el.dataset.i);
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
  }

  // ---------- 플레이어 (YouTube IFrame API) ----------
  let ytPlayer = null, ytReady = false, curIdx = -1, wakeLock = null;
  const queue = () => VIEW;

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

  function openPlayer(i) {
    const q = queue();
    if (i < 0 || i >= q.length) return;
    curIdx = i;
    const s = q[i];
    $("#player-modal").hidden = false;
    document.body.style.overflow = "hidden";
    $("#pl-title").textContent = s.song;
    $("#pl-sub").textContent = [s.choir, s.category, fmtDate(s.date)].filter(Boolean).join(" · ");
    reqWake();

    const startIt = () => {
      if (ytPlayer) { ytPlayer.loadVideoById(s.id); return; }
      ytPlayer = new YT.Player("yt-player", {
        videoId: s.id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
        events: {
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) onEnded(); },
          onError: () => { onEnded(); },  // 101/150 등 임베드 불가 → 다음곡
        },
      });
    };
    if (ytReady) startIt();
    else { const w = setInterval(() => { if (ytReady) { clearInterval(w); startIt(); } }, 100); }
  }

  function onEnded() {
    if (!$("#pl-autonext").checked) return;
    const q = queue();
    if (curIdx + 1 < q.length) playAt(curIdx + 1);
  }
  function playAt(i) {
    const q = queue();
    if (i < 0 || i >= q.length) return;
    curIdx = i;
    const s = q[i];
    $("#pl-title").textContent = s.song;
    $("#pl-sub").textContent = [s.choir, s.category, fmtDate(s.date)].filter(Boolean).join(" · ");
    ytPlayer && ytPlayer.loadVideoById(s.id);
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
    renderControls();
    await load();
    apply();
    if (window.hideSplash) window.hideSplash();
  })();
})();
