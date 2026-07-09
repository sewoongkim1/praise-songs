-- 찬양 아카이브 백엔드를 '성경암송' Supabase 프로젝트로 통합
-- 실행 위치: 성경암송 프로젝트(xnomlgydifiqiybervtf) SQL Editor
-- (성경암송엔 없는 이름들이라 충돌 없음)

-- 1) 곡 테이블
create table if not exists songs (
  id                text primary key,          -- 유튜브 영상 ID
  song              text not null default '',
  choir             text,
  category          text,
  svc_date          date,
  duration          text,
  duration_sec      int  default 0,
  views             bigint default 0,
  thumbnail         text,
  is_full           boolean default false,
  hidden            boolean default false,
  category_ordering int,
  choir_ordering    int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists songs_svc_date_idx on songs(svc_date);
create index if not exists songs_category_idx on songs(category);
create index if not exists songs_choir_idx    on songs(choir);

-- 2) 방문 로그
create table if not exists visits (
  id         bigint generated always as identity primary key,
  visitor    text,
  day        date not null default (now() at time zone 'Asia/Seoul')::date,
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists visits_day_idx     on visits(day);
create index if not exists visits_visitor_idx on visits(visitor);

-- 3) 재생 로그(인기곡)
create table if not exists plays (
  id         bigint generated always as identity primary key,
  song_id    text,
  visitor    text,
  created_at timestamptz not null default now()
);
create index if not exists plays_song_idx    on plays(song_id);
create index if not exists plays_created_idx  on plays(created_at);

-- 4) 사용량 집계 함수
create or replace function praise_usage_stats()
returns json language sql security definer set search_path = public as $$
  with kst as (select (now() at time zone 'Asia/Seoul')::date as today),
  top as (
    select p.song_id, s.song, s.choir, count(*)::int as cnt
    from plays p left join songs s on s.id = p.song_id
    where p.created_at >= now() - interval '7 days'
    group by p.song_id, s.song, s.choir
    order by cnt desc limit 10
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
