// 편집한 songs.csv → DB 반영 (업서트 + 파일에서 지운 행은 삭제 동기화)
// 실행: ADMIN_SECRET=xxx node scripts/import-csv.mjs
//   실제 삭제까지 실행: ADMIN_SECRET=xxx FORCE=1 node scripts/import-csv.mjs   (대량 삭제 시)
import { readFileSync } from "node:fs";

const FN = "https://gvmclmznpgitfurnocxo.supabase.co/functions/v1/api";
const KEY = "sb_publishable_o6EGw_M05ZdR5rsL7RdeBw_l6-0Rbf5";
const SECRET = process.env.ADMIN_SECRET || "";
if (!SECRET) { console.error("환경변수 ADMIN_SECRET 필요"); process.exit(1); }
const call = async (action, body = {}) => {
  const r = await fetch(FN, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify({ action, secret: SECRET, ...body }) });
  const j = await r.json(); if (!j.ok) throw new Error(j.error || "HTTP " + r.status); return j;
};

// --- CSV 파서(따옴표·콤마·개행 처리) ---
function parseCSV(text) {
  text = text.replace(/^﻿/, "");            // BOM 제거
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length && r.some((x) => x !== ""));
}

const raw = readFileSync(new URL("../songs.csv", import.meta.url), "utf-8");
const rows = parseCSV(raw);
const header = rows.shift().map((h) => h.trim());
const bool = (v) => /^(true|1|y|예|o)$/i.test(String(v).trim());
// 엑셀이 2026-07-05를 2026/7/5, 2026. 7. 5 등으로 바꿔도 정규화
function normDate(v) {
  v = String(v || "").trim(); if (!v) return null;
  const m = v.match(/(\d{4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return v.slice(0, 10);
}
// duration은 duration_sec에서 재계산(엑셀이 "3:42"를 시간으로 바꾸는 문제 방지)
function fmtDur(s) {
  s = +s || 0; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}
const songs = rows.map((r) => {
  const o = {}; header.forEach((h, i) => (o[h] = r[i]));
  const sec = parseInt(o.duration_sec || "0", 10) || 0;
  return {
    id: (o.id || "").trim(),
    song: (o.song || "").trim(),
    choir: (o.choir || "").trim() || null,
    category: (o.category || "").trim() || null,
    svc_date: normDate(o.svc_date),
    duration: fmtDur(sec),
    duration_sec: sec,
    views: parseInt(o.views || "0", 10) || 0,
    is_full: bool(o.is_full),
    hidden: bool(o.hidden),
  };
}).filter((s) => s.id);

console.log(`CSV에서 읽은 곡: ${songs.length}`);
if (!songs.length) { console.error("빈 파일 — 중단"); process.exit(1); }

// 현재 DB와 비교 → 삭제 대상(파일에 없는 id)
const cur = (await call("adminList")).songs || [];
const csvIds = new Set(songs.map((s) => s.id));
const toDelete = cur.filter((s) => !csvIds.has(s.id));

console.log(`현재 DB: ${cur.length}곡 / 삭제 대상(파일에서 사라진 행): ${toDelete.length}곡`);
if (toDelete.length) toDelete.slice(0, 20).forEach((s) => console.log("  - 삭제예정:", s.id, s.song));

// 안전장치: 대량 삭제는 FORCE=1 필요
const bigDelete = toDelete.length > 100 || toDelete.length > cur.length * 0.3;
if (bigDelete && !process.env.FORCE) {
  console.error(`\n⚠️ 삭제 대상이 많습니다(${toDelete.length}곡). 확인 후 FORCE=1 로 다시 실행하세요.`);
  console.error("   (업서트도 실행 안 함 — 안전을 위해 전체 중단)");
  process.exit(1);
}

// 1) 업서트
const up = await call("importSongs", { songs });
console.log(`✅ 업데이트/추가: ${up.imported}곡`);

// 2) 삭제 동기화
let del = 0;
for (const s of toDelete) { await call("deleteSong", { id: s.id }); del++; }
console.log(`🗑️ 삭제: ${del}곡`);
console.log("완료! 앱 새로고침하면 반영됩니다.");
