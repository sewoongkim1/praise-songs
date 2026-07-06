// 현재 songs 테이블 → songs.csv (엑셀 편집용, UTF-8 BOM)
// 실행: ADMIN_SECRET=xxx node scripts/export-csv.mjs
import { writeFileSync } from "node:fs";

const FN = "https://gvmclmznpgitfurnocxo.supabase.co/functions/v1/api";
const KEY = "sb_publishable_o6EGw_M05ZdR5rsL7RdeBw_l6-0Rbf5";
const SECRET = process.env.ADMIN_SECRET || "";
if (!SECRET) { console.error("환경변수 ADMIN_SECRET 필요"); process.exit(1); }

const res = await fetch(FN, {
  method: "POST",
  headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "adminList", secret: SECRET }),
});
const j = await res.json();
if (!j.ok) { console.error("실패:", j.error); process.exit(1); }
const songs = j.songs || [];

// 편집할 열(썸네일 URL은 id에서 자동 생성되므로 제외)
const cols = ["id", "song", "choir", "category", "svc_date", "duration", "duration_sec", "views", "is_full", "hidden"];
const cell = (v) => {
  v = v == null ? "" : String(v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
};
const rows = songs
  .sort((a, b) => (b.svc_date || "").localeCompare(a.svc_date || ""))
  .map((s) => cols.map((c) => cell(s[c])).join(","));
const csv = "﻿" + [cols.join(","), ...rows].join("\r\n");   // BOM + CRLF (엑셀 한글 OK)

writeFileSync(new URL("../songs.csv", import.meta.url), csv, "utf-8");
console.log(`✅ songs.csv 생성 완료 (${songs.length}곡)`);
console.log("   경로: c:\\Projects\\praise-songs\\songs.csv");
