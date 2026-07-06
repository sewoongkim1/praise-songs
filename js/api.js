// 고척교회 찬양 아카이브 — API 래퍼
(function () {
  const { FN, KEY } = window.CONFIG;

  async function call(action, body = {}) {
    const r = await fetch(FN, {
      method: "POST",
      headers: {
        "apikey": KEY,
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    });
    const j = await r.json().catch(() => ({ ok: false, error: "응답 파싱 실패" }));
    if (!j.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }

  window.API = {
    // 공개
    getSongs: () => call("getSongs").then((j) => j.songs || []),
    // 관리자
    ytFetch: (url, secret) => call("ytFetch", { url, secret }).then((j) => j.meta),
    adminList: (secret) => call("adminList", { secret }).then((j) => j.songs || []),
    saveSong: (song, secret) => call("saveSong", { song, secret }),
    deleteSong: (id, secret) => call("deleteSong", { id, secret }),
    importSongs: (songs, secret) => call("importSongs", { songs, secret }),
    setOrdering: (kind, items, secret) => call("setOrdering", { kind, items, secret }),
    refreshViews: (ids, secret) => call("refreshViews", { ids, secret }),
    // 사용량 집계
    logVisit: (visitor, ua) => call("logVisit", { visitor, ua }).catch(() => {}),
    logPlay: (song_id, visitor) => call("logPlay", { song_id, visitor }).catch(() => {}),
    usageStats: (secret) => call("usageStats", { secret }).then((j) => j.stats),
  };
})();
