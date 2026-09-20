-- 찬양 아카이브 — 한글 이름을 완성형(NFC)으로 일괄 정규화 (2026-09-20, 1회성)
--
-- 왜: 2026-07-12 이후 등록된 48곡의 song·choir 가 자모분리(NFD, 맥 표기)로 들어왔다.
--     화면에는 똑같이 보이지만 코드포인트가 달라 같은 「시온찬양대」가 콤보에 두 번 뜨고,
--     성도님 앱에서 찬양대 필터·검색에 안 걸렸다.
--     분석 = bible-memorize-church-app-v2/docs/analysis/2026-09-20-praise-choir-nfc-nfd-duplicate.md
--
-- 새로 들어오는 것은 Edge Function `praise` 에서 이미 막았다(nfc 헬퍼).
-- 이 파일은 이미 들어간 것을 치우는 용도다.
--
-- ⚠ normalize() 는 PostgreSQL 13+ 내장 함수다. 아래 ① 로 먼저 확인할 것.
--
-- ⚠⚠ 순서 — **Edge Function `praise` 를 먼저 배포한 뒤에 이 SQL 을 돌린다.**
--     거꾸로 하면 조용히 틀어진다: DB 를 NFC 로 합쳐 놓았는데 서버가 옛 판이면,
--     다음 주일에 들어오는 자모분리 곡이 `.eq("choir", ...)` 로 기존 순번을 못 찾아
--     choir_ordering 이 null(=9999) 이 된다. 성도님 앱의 choirOptions 는 같은 이름에서
--     **가장 최근 곡의 순번**을 쓰므로, 그 찬양대가 콤보 맨 뒤로 밀린다.
--     (지금처럼 서버가 옛 판이고 SQL 도 안 돌린 상태는 안전하다 — NFD 행들이
--      이미 순번 2·4·6·8 을 갖고 있어 새 곡이 그걸 물려받는다.)

-- ① 환경 확인 + 몇 행이 바뀌는지 (읽기만 한다)
select version();

select count(*) filter (where song  <> normalize(song,  NFC)) as song_nfd,
       count(*) filter (where choir <> normalize(choir, NFC)) as choir_nfd,
       count(*)                                               as total
  from songs;

-- ② 바뀔 이름을 눈으로 본다 (읽기만 한다)
select normalize(choir, NFC) as 이름, count(*) as 곡수,
       array_agg(distinct choir_ordering) as 순번들
  from songs
 where choir is not null
 group by 1
having count(distinct choir) > 1
 order by 1;

-- ③ 정규화 (되돌릴 수 없다 — ①② 를 본 뒤에 돌릴 것)
update songs
   set song  = normalize(song,  NFC),
       choir = normalize(choir, NFC)
 where song  <> normalize(song,  NFC)
    or choir <> normalize(choir, NFC);

-- ④ 확인 — 0 이어야 한다
select count(*) as 남은_nfd
  from songs
 where song <> normalize(song, NFC) or choir <> normalize(choir, NFC);

-- ⑤ 마무리: 합쳐진 찬양대의 choir_ordering 이 둘로 갈려 있다(예: 시온 5 와 6).
--    admin-praise.html 의 「찬양대 순서 저장」을 한 번 누르면 1..N 으로 다시 매겨진다.
--    (누르지 않아도 순서가 뒤집히지는 않는다 — 확인함)
select choir, array_agg(distinct choir_ordering) as 순번들
  from songs where choir is not null group by 1 order by min(choir_ordering);
