// 고척교회 찬양 아카이브 — Edge Function (Deno)
// 배포: supabase functions deploy api --no-verify-jwt --project-ref gvmclmznpgitfurnocxo
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const YT_KEY = Deno.env.get("YOUTUBE_API_KEY") ?? "";
const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET") ?? "";  // 실제 값은 Supabase 시크릿으로 주입

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// --- 유튜브 ID 추출 ---
function extractYtId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    s.match(/embed\/([a-zA-Z0-9_-]{11})/) ||
    s.match(/shorts\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ISO8601(PT#H#M#S) → 초 / "H:MM:SS"
function parseDuration(iso: string): { sec: number; text: string } {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return { sec: 0, text: "0:00" };
  const h = +(m[1] || 0), mi = +(m[2] || 0), se = +(m[3] || 0);
  const sec = h * 3600 + mi * 60 + se;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = h > 0 ? `${h}:${pad(mi)}:${pad(se)}` : `${mi}:${pad(se)}`;
  return { sec, text };
}

async function ytFetch(idOrUrl: string) {
  const id = extractYtId(idOrUrl);
  if (!id) throw new Error("유효한 유튜브 링크/ID가 아닙니다");
  if (!YT_KEY) throw new Error("YOUTUBE_API_KEY 미설정");
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${id}&key=${YT_KEY}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j.items || !j.items.length) throw new Error("영상을 찾을 수 없습니다(비공개/삭제/오타)");
  const it = j.items[0];
  const dur = parseDuration(it.contentDetails?.duration || "");
  const th = it.snippet?.thumbnails || {};
  return {
    id,
    song: it.snippet?.title ?? "",
    thumbnail: (th.maxres || th.high || th.medium || th.default || {}).url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    svc_date: (it.snippet?.publishedAt || "").slice(0, 10) || null,
    duration: dur.text,
    duration_sec: dur.sec,
    views: +(it.statistics?.viewCount || 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let b: any = {};
  try { b = await req.json(); } catch { /* */ }
  const action = b.action ?? "";
  const isAdmin = () => b.secret === ADMIN_SECRET;

  try {
    switch (action) {
      // ---------- 공개 ----------
      case "getSongs": {
        const { data, error } = await db
          .from("songs").select("*").eq("hidden", false)
          .order("svc_date", { ascending: false }).limit(5000);
        if (error) throw error;
        return json({ ok: true, songs: data ?? [] });
      }

      // ---------- 관리자 ----------
      case "ytFetch": {
        if (!isAdmin()) return json({ ok: false, error: "권한 없음" }, 403);
        const meta = await ytFetch(b.url || b.id || "");
        return json({ ok: true, meta });
      }
      case "adminList": {
        if (!isAdmin()) return json({ ok: false, error: "권한 없음" }, 403);
        const { data, error } = await db.from("songs").select("*")
          .order("svc_date", { ascending: false }).limit(5000);
        if (error) throw error;
        return json({ ok: true, songs: data ?? [] });
      }
      case "saveSong": {
        if (!isAdmin()) return json({ ok: false, error: "권한 없음" }, 403);
        const s = b.song || {};
        if (!s.id) return json({ ok: false, error: "id 필요" }, 400);
        const row = {
          id: s.id,
          song: s.song ?? "",
          choir: s.choir ?? null,
          category: s.category ?? null,
          svc_date: s.svc_date || null,
          duration: s.duration ?? null,
          duration_sec: s.duration_sec ?? 0,
          views: s.views ?? 0,
          thumbnail: s.thumbnail ?? null,
          is_full: !!s.is_full,
          hidden: !!s.hidden,
          updated_at: new Date().toISOString(),
        };
        const { error } = await db.from("songs").upsert(row);
        if (error) throw error;
        return json({ ok: true });
      }
      case "deleteSong": {
        if (!isAdmin()) return json({ ok: false, error: "권한 없음" }, 403);
        if (!b.id) return json({ ok: false, error: "id 필요" }, 400);
        const { error } = await db.from("songs").delete().eq("id", b.id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "importSongs": {
        if (!isAdmin()) return json({ ok: false, error: "권한 없음" }, 403);
        const list: any[] = Array.isArray(b.songs) ? b.songs : [];
        if (!list.length) return json({ ok: false, error: "빈 목록" }, 400);
        const rows = list.map((s) => ({
          id: s.id,
          song: s.song ?? "",
          choir: s.choir ?? null,
          category: s.category ?? null,
          svc_date: s.svc_date || s.date || null,
          duration: s.duration ?? null,
          duration_sec: s.duration_sec ?? s.durationSec ?? 0,
          views: s.views ?? 0,
          thumbnail: s.thumbnail ?? `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`,
          is_full: s.is_full ?? ((s.duration_sec ?? s.durationSec ?? 0) >= 1800),
          hidden: !!s.hidden,
        })).filter((r) => r.id);
        // 배치 upsert(500씩)
        let n = 0;
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await db.from("songs").upsert(chunk);
          if (error) throw error;
          n += chunk.length;
        }
        return json({ ok: true, imported: n });
      }

      default:
        return json({ ok: false, error: "알 수 없는 action: " + action }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
