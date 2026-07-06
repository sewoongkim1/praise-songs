-- 고척교회 찬양 아카이브 — DB 스키마
-- Supabase 프로젝트: gvmclmznpgitfurnocxo

create table if not exists public.songs (
  id           text primary key,            -- YouTube video id
  song         text not null,               -- 곡명
  choir        text,                         -- 찬양대/팀 이름
  category     text,                         -- 찬양대 / 중창단 / 찬양팀 / 기타
  svc_date     date,                         -- 예배(업로드) 날짜
  duration     text,                         -- "3:42"
  duration_sec int default 0,
  views        int default 0,
  thumbnail    text,
  is_full      boolean not null default false,  -- 전체예배(장시간) 여부
  hidden       boolean not null default false,  -- 관리자 숨김
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_songs_date     on public.songs(svc_date desc);
create index if not exists idx_songs_category on public.songs(category);
create index if not exists idx_songs_choir    on public.songs(choir);
create index if not exists idx_songs_views    on public.songs(views desc);
create index if not exists idx_songs_full     on public.songs(is_full);

-- RLS: 기본 차단(모든 접근은 Edge Function의 service_role로만)
alter table public.songs enable row level security;

-- PostgREST 스키마 캐시 새로고침
notify pgrst, 'reload schema';
