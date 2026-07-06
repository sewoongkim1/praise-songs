-- 고척교회 찬양 아카이브 — 사용량 집계용 테이블 + 함수
-- 실행: Supabase Dashboard(gvmclmznpgitfurnocxo) → SQL Editor 에 붙여넣고 RUN

-- 1) 방문 로그
create table if not exists visits (
  id bigint generated always as identity primary key,
  visitor text,                                   -- 브라우저별 익명 id(localStorage)
  day date not null default (now() at time zone 'Asia/Seoul')::date,
  ua text,
  created_at timestamptz not null default now()
);
create index if not exists visits_day_idx on visits(day);
create index if not exists visits_visitor_idx on visits(visitor);

-- 2) 재생 로그(인기곡)
create table if not exists plays (
  id bigint generated always as identity primary key,
  song_id text,
  visitor text,
  created_at timestamptz not null default now()
);
create index if not exists plays_song_idx on plays(song_id);
create index if not exists plays_created_idx on plays(created_at);

-- 3) 집계 함수(관리자 화면에서 호출)
create or replace function praise_usage_stats()
returns json
language sql
security definer
set search_path = public
as $$
  with kst as (select (now() at time zone 'Asia/Seoul')::date as today),
  top as (
    select p.song_id, s.song, s.choir, count(*)::int as cnt
    from plays p
    left join songs s on s.id = p.song_id
    where p.created_at >= now() - interval '7 days'
    group by p.song_id, s.song, s.choir
    order by cnt desc
    limit 10
  )
  select json_build_object(
    'visits_today', (select count(*)::int from visits, kst where visits.day = kst.today),
    'visits_7d',    (select count(*)::int from visits where created_at >= now() - interval '7 days'),
    'visits_30d',   (select count(*)::int from visits where created_at >= now() - interval '30 days'),
    'visits_total', (select count(*)::int from visits),
    'uniq_today',   (select count(distinct visitor)::int from visits, kst where visits.day = kst.today),
    'uniq_7d',      (select count(distinct visitor)::int from visits where created_at >= now() - interval '7 days'),
    'plays_7d',     (select count(*)::int from plays where created_at >= now() - interval '7 days'),
    'plays_total',  (select count(*)::int from plays),
    'top_songs',    (select coalesce(json_agg(json_build_object('song', song, 'choir', choir, 'cnt', cnt)), '[]'::json) from top)
  );
$$;

-- RLS: 테이블 직접 접근은 막고(서비스롤/함수로만 사용). 필요시:
-- alter table visits enable row level security;
-- alter table plays  enable row level security;
