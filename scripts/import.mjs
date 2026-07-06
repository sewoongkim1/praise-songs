// praise.json → Supabase 임포트 (1회성)
// 실행: node scripts/import.mjs
import { readFileSync } from "node:fs";

const FN = "https://gvmclmznpgitfurnocxo.supabase.co/functions/v1/api";
const KEY = "sb_publishable_o6EGw_M05ZdR5rsL7RdeBw_l6-0Rbf5";
// 관리자 비밀번호는 코드에 두지 않고 환경변수로 전달: ADMIN_SECRET=xxx node scripts/import.mjs
const SECRET = process.env.ADMIN_SECRET || "";
if (!SECRET) { console.error("환경변수 ADMIN_SECRET 필요"); process.exit(1); }

const raw = readFileSync(new URL("../public/praise.json", import.meta.url), "utf-8");
const parsed = JSON.parse(raw);
const songs = Array.isArray(parsed) ? parsed : (parsed.songs || []);
console.log(`읽은 곡 수: ${songs.length}`);

const res = await fetch(FN, {
  method: "POST",
  headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "importSongs", secret: SECRET, songs }),
});
const j = await res.json();
console.log(j.ok ? `✅ 임포트 완료: ${j.imported}곡` : `❌ 실패: ${j.error}`);
