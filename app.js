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

  // 마지막 화면 상태(앱 전환 후 재로딩돼도 그대로 복원)
  const STATE_KEY = "praise_state";
  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        q: state.q, cat: state.cat, choir: state.choir,
        from: state.from, to: state.to, sort: state.sort, favOnly: state.favOnly,
        scroll: window.scrollY || window.pageYOffset || 0,
      }));
    } catch (e) {}
  }

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
      if (state.sort === "oldest") return (a.date || "").localeCompare(b.date || "");  // 오래된순
      if (state.sort === "popular") return b.views - a.views;
      if (state.sort === "name") return a.song.localeCompare(b.song, "ko");
      return (b.date || "").localeCompare(a.date || "");   // recent(기본)
    });
    renderGrid();
    saveState();
  }

  // ---------- 렌더: 컨트롤 ----------
  function renderControls() {
    const choirs = choirOptions();
    if (state.choir !== "전체" && !choirs.includes(state.choir)) state.choir = "전체";

    $("#controls").innerHTML = `
      <div class="search-row">
        <input id="q" type="search" placeholder="곡명 검색 (초성 가능: ㅈㅇㄴ)" value="${esc(state.q)}" />
      </div>
      <div class="period-row">
        <button class="filter-btn period-btn" id="f-period"><span>📅 ${esc(periodLabel())}</span></button>
        <button class="period-all ${(!state.from && !state.to) ? "on" : ""}" id="f-allperiod">전체</button>
      </div>
      <div class="filter-row">
        <button class="filter-btn" id="f-cat"><span>${state.cat === "전체" ? "구분 전체" : esc(state.cat)}</span></button>
        <button class="filter-btn" id="f-choir"><span>${state.choir === "전체" ? "찬양대 전체" : esc(state.choir)}</span></button>
      </div>`;

    const qEl = $("#q");
    let t;
    qEl.addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; apply(); }, 200); });
    $("#f-period").onclick = openPeriodSheet;
    $("#f-allperiod").onclick = () => { state.from = ""; state.to = ""; renderControls(); apply(); };
    $("#f-cat").onclick = () => openSheet("구분 선택", [{ v: "전체", l: "구분 전체" }, ...categoryOptions().map((c) => ({ v: c, l: c }))], state.cat, (v) => {
      state.cat = v; state.choir = "전체"; renderControls(); apply();
    });
    $("#f-choir").onclick = () => openSheet("찬양대 선택", [{ v: "전체", l: "찬양대 전체" }, ...choirOptions().map((c) => ({ v: c, l: c }))], state.choir, (v) => {
      state.choir = v; renderControls(); apply();
    });
  }

  // ---------- 바텀시트 ----------
  function showSheet(innerHTML, setup) {
    document.querySelectorAll("#sheet").forEach((n) => n.remove()); // 잔여 시트 모두 제거(중복 방지)
    const el = document.createElement("div"); el.id = "sheet";
    el.className = "show"; // CSS 트랜지션 대신 JS 애니메이션 사용(항상 열림상태 스타일)
    el.innerHTML = `<div class="sheet-bg"></div><div class="sheet-panel">${innerHTML}</div>`;
    document.body.appendChild(el);

    const bg = el.querySelector(".sheet-bg");
    const panel = el.querySelector(".sheet-panel");
    const EASE = "cubic-bezier(.2,.8,.2,1)";
    // WAAPI: 리플로우 타이밍에 의존하지 않아 재열기에도 항상 올라옴
    if (panel.animate) {
      bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, fill: "both" });
      panel.animate([{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], { duration: 320, easing: EASE, fill: "both" });
    }

    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      const done = () => { if (el.parentNode) el.remove(); };
      if (panel.animate) {
        bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "both" });
        const a = panel.animate([{ transform: "translateY(0)" }, { transform: "translateY(100%)" }], { duration: 260, easing: EASE, fill: "both" });
        a.onfinish = done; setTimeout(done, 400); // 안전망
      } else { done(); }
    };
    bg.onclick = close;
    setup(el, close);
  }
  // 목록 선택 시트(구분·찬양대·정렬)
  function openSheet(title, items, current, onPick) {
    const inner = `
      <div class="sheet-grip"></div>
      <div class="sheet-title">${esc(title)}</div>
      <div class="sheet-list">
        ${items.map((it) => `<button class="sheet-item ${String(it.v) === String(current) ? "on" : ""}" data-v="${esc(String(it.v))}">
          <span>${esc(it.l)}</span>${String(it.v) === String(current) ? '<span class="chk">✓</span>' : ""}
        </button>`).join("")}
      </div>`;
    showSheet(inner, (el, close) => {
      el.querySelectorAll(".sheet-item").forEach((b) => b.onclick = () => { close(); onPick(b.dataset.v); });
      const cur = el.querySelector(".sheet-item.on"); if (cur) cur.scrollIntoView({ block: "center" });
    });
  }
  // 기간 시트(시작/종료 · 년·월)
  function openPeriodSheet() {
    const [dmin, dmax] = dataDateRange();
    if (!dmin) return;
    const years = []; for (let y = +dmax.slice(0, 4); y >= +dmin.slice(0, 4); y--) years.push(y);
    let fy = +(state.from || dmin).slice(0, 4), fm = +(state.from || dmin).slice(5, 7);
    let ty = +(state.to || dmax).slice(0, 4), tm = +(state.to || dmax).slice(5, 7);
    const minY = +dmin.slice(0, 4), maxY = +dmax.slice(0, 4);
    const yrStepper = (key, sel) => `
      <div class="ystep" data-key="${key}">
        <button class="ybtn" data-d="-1" aria-label="이전 년도">−</button>
        <select class="psel" data-key="${key}">${years.map((y) => `<option value="${y}" ${y === sel ? "selected" : ""}>${y}년</option>`).join("")}</select>
        <button class="ybtn" data-d="1" aria-label="다음 년도">＋</button>
      </div>`;
    const moGrid = () => Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<button class="pchip mo" data-m="${m}">${m}월</button>`).join("");
    const section = (key) => `
      <div class="psec" data-key="${key}">
        <div class="psec-head">
          <span class="psec-label">${key === "from" ? "시작" : "종료"}</span>
          ${yrStepper(key, key === "from" ? fy : ty)}
        </div>
        <div class="pchip-grid">${moGrid()}</div>
      </div>`;
    const inner = `
      <div class="sheet-grip"></div>
      <div class="sheet-title">조회 기간</div>
      <div class="sheet-body period-sheet">
        ${section("from")}<div class="psep"></div>${section("to")}
      </div>
      <div class="sheet-foot">
        <button class="sf-all" id="p-all">전체 기간</button>
        <button class="sf-apply" id="p-apply">적용</button>
      </div>`;
    showSheet(inner, (el, close) => {
      const q = (s) => el.querySelectorAll(s);
      const paint = () => {
        q('.psec[data-key="from"] .mo').forEach((b) => b.classList.toggle("on", +b.dataset.m === fm));
        q('.psec[data-key="to"] .mo').forEach((b) => b.classList.toggle("on", +b.dataset.m === tm));
      };
      const clampY = (y) => Math.max(minY, Math.min(maxY, y));
      const setY = (key, y) => { y = clampY(y); if (key === "from") fy = y; else ty = y; el.querySelector(`.psel[data-key="${key}"]`).value = y; };
      el.querySelector('.psel[data-key="from"]').onchange = (e) => { fy = +e.target.value; };
      el.querySelector('.psel[data-key="to"]').onchange = (e) => { ty = +e.target.value; };
      q(".ystep .ybtn").forEach((b) => b.onclick = () => {
        const key = b.closest(".ystep").dataset.key;
        setY(key, (key === "from" ? fy : ty) + (+b.dataset.d));
      });
      q('.psec[data-key="from"] .mo').forEach((b) => b.onclick = () => { fm = +b.dataset.m; paint(); });
      q('.psec[data-key="to"] .mo').forEach((b) => b.onclick = () => { tm = +b.dataset.m; paint(); });
      paint();
      el.querySelector("#p-all").onclick = () => { state.from = ""; state.to = ""; close(); renderControls(); apply(); };
      el.querySelector("#p-apply").onclick = () => {
        let f = `${fy}-${String(fm).padStart(2, "0")}`, t = `${ty}-${String(tm).padStart(2, "0")}`;
        if (f > t) { const tmp = f; f = t; t = tmp; }
        state.from = f; state.to = t; close(); renderControls(); apply();
      };
    });
  }
  function periodLabel() {
    if (!state.from && !state.to) return "전체 기간";
    const s = (v) => (v ? v.replace("-", ".") : "");
    return `${s(state.from)} ~ ${s(state.to)}`;
  }
  function sortLabel(v) { return { recent: "최신순", oldest: "오래된순", popular: "인기순", name: "가나다순" }[v] || "최신순"; }

  // ---------- 렌더: 그리드 ----------
  function renderGrid() {
    $("#count").innerHTML = `<span class="cnt-num">${VIEW.length.toLocaleString()}곡</span>` +
      `<div class="cnt-right">
         <button class="fav-toggle ${state.favOnly ? "on" : ""}" data-favonly>★ 즐겨찾기</button>
         <button class="filter-btn sort-btn" id="sort"><span>${sortLabel(state.sort)}</span></button>
       </div>`;
    const so = $("#sort");
    if (so) so.onclick = () => openSheet("정렬", [
      { v: "recent", l: "최신순" }, { v: "oldest", l: "오래된순" }, { v: "popular", l: "인기순" }, { v: "name", l: "가나다순" },
    ], state.sort, (v) => { state.sort = v; apply(); });
    const fav = $("[data-favonly]");
    if (fav) fav.addEventListener("click", () => { state.favOnly = !state.favOnly; apply(); });
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
  let playing = false;    // 현재 재생 중 여부

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
    $("#pl-sub").textContent = [s.choir, fmtDate(s.date)].filter(Boolean).join(" · ")
      + (activeQueue.length > 1 ? `  ·  ${orderPos + 1}/${activeQueue.length}곡` : "");
    setMediaSession(s);
  }
  // 잠금화면 미디어 정보 + 컨트롤(재생/일시정지/다음/이전)
  function setMediaSession(s) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.song || "찬양", artist: s.choir || "고척교회",
        album: "고척교회 찬양 아카이브",
        artwork: [{ src: s.thumb, sizes: "480x360", type: "image/jpeg" }],
      });
      navigator.mediaSession.setActionHandler("play", () => { try { ytPlayer && ytPlayer.playVideo(); } catch (e) {} });
      navigator.mediaSession.setActionHandler("pause", () => { try { ytPlayer && ytPlayer.pauseVideo(); } catch (e) {} });
      navigator.mediaSession.setActionHandler("nexttrack", goNext);
      navigator.mediaSession.setActionHandler("previoustrack", goPrev);
    } catch (e) {}
  }
  function goNext() {
    if (orderPos + 1 < playOrder.length) gotoPos(orderPos + 1);
    else if (isOn("#pl-repeat")) gotoPos(0);
  }
  function goPrev() {
    if (orderPos - 1 >= 0) gotoPos(orderPos - 1);
    else if (isOn("#pl-repeat")) gotoPos(playOrder.length - 1);
  }
  // 화면이 꺼질 때 재생을 이어가도록 시도(백그라운드 오디오 지원 기기용, 베스트-에포트)
  function keepPlaying() {
    let tries = 0;
    const t = setInterval(() => {
      try { if (ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) ytPlayer.playVideo(); } catch (e) {}
      if (++tries >= 8 || !document.hidden) clearInterval(t);
    }, 350);
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
    // 스크롤바 폭 보정(모바일 오버레이 스크롤바는 0이라 무영향) — 팝업 가운데 유지
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    $("#player-modal").hidden = false;
    document.body.style.overflow = "hidden";
    if (sbw > 0) { document.body.style.paddingRight = sbw + "px"; $("#player-modal").style.paddingRight = sbw + "px"; }
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
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) playing = true;
            else if (e.data === YT.PlayerState.PAUSED) playing = false;
            if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = playing ? "playing" : "paused"; } catch (er) {} }
            if (e.data === YT.PlayerState.ENDED) onEnded();
          },
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
    document.body.style.paddingRight = "";
    $("#player-modal").style.paddingRight = "";
    try { ytPlayer && ytPlayer.stopVideo(); } catch (e) {}
    relWake();
  }
  function toggleBtn(sel) {
    const b = $(sel); const on = !isOn(sel);
    b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on);
    return on;
  }

  $("#player-modal").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closePlayer));
  $("#pl-prev").addEventListener("click", goPrev);
  $("#pl-next").addEventListener("click", goNext);
  $("#pl-repeat").addEventListener("click", () => { toggleBtn("#pl-repeat"); updateNav(); });
  $("#pl-shuffle").addEventListener("click", () => {
    toggleBtn("#pl-shuffle");
    if (activeQueue.length) buildOrder(curIdx);   // 현재 곡 유지하며 이후 순서 재구성
    updateNav();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#player-modal").hidden) closePlayer(); });
  document.addEventListener("visibilitychange", () => {
    const open = !$("#player-modal").hidden;
    if (document.hidden) {
      if (open && playing && ytPlayer) keepPlaying();   // 화면 꺼질 때 재생 유지 시도
    } else {
      if (open && wakeLock === null) reqWake();
    }
  });

  // ---------- util ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- 시작 ----------
  (async function init() {
    await load();

    // 저장된 마지막 상태 복원(있으면) — 없으면 기본 기간 = 가장 최근 달
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) {}
    if (saved && typeof saved === "object") {
      state.q = saved.q || "";
      state.cat = saved.cat || "찬양대";
      state.choir = saved.choir || "전체";
      state.from = saved.from || "";
      state.to = saved.to || "";
      state.sort = saved.sort || "recent";
      state.favOnly = !!saved.favOnly;
    } else {
      let latest = "";
      ALL.forEach((s) => { if ((s.date || "") > latest) latest = s.date; });
      if (latest) { state.from = latest.slice(0, 7); state.to = latest.slice(0, 7); }
    }

    renderControls();
    apply();
    if (window.hideSplash) window.hideSplash();

    // 스크롤 위치 복원(그리드 렌더 후)
    if (saved && saved.scroll) {
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.scroll)));
      setTimeout(() => window.scrollTo(0, saved.scroll), 300);
    }

    // 스크롤/백그라운드 전환 시 위치 저장
    let st;
    window.addEventListener("scroll", () => { clearTimeout(st); st = setTimeout(saveState, 250); }, { passive: true });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveState(); });
    window.addEventListener("pagehide", saveState);
  })();
})();
