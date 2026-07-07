-- 가계부 앱 초기 스키마
-- 유입 경로: (1) 실시간 = iOS 단축어 -> POST -> transactions
--           (2) 백필   = 카드사 CSV/엑셀 임포트 -> transactions
-- 저장 데이터: 사용처(merchant), 시간일자(occurred_at), 금액(amount)
-- 카테고리는 사용자가 나중에 지정, 예산 계산은 앱(클라이언트)에서 수행.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 공통: updated_at 자동 갱신 트리거 함수
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- categories : 지출/수입 카테고리 (사용자가 관리)
-- ---------------------------------------------------------------------------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  icon        text,                       -- 이모지/아이콘 이름 (선택)
  is_income   boolean not null default false,  -- true = 수입 카테고리
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create unique index categories_name_kind_uidx
  on categories (name, is_income);

-- ---------------------------------------------------------------------------
-- budgets : 카테고리별 월 예산 (금액만 저장, 진행률/추천예산은 앱에서 계산)
-- ---------------------------------------------------------------------------
create table budgets (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references categories (id) on delete cascade,
  amount       numeric(14, 2) not null check (amount >= 0),  -- 월 예산 금액
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 카테고리당 예산 1개
create unique index budgets_category_uidx on budgets (category_id);

create trigger budgets_set_updated_at
  before update on budgets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions : 거래(지출/수입) 원장
--   original_amount : 문자/CSV 원본 승인액 (수정하지 않음)
--   amount          : 실제 반영액 (수정/더치페이/법카캡 적용 후) -> 예산 계산 기준
-- ---------------------------------------------------------------------------
create table transactions (
  id               uuid primary key default gen_random_uuid(),

  occurred_at      timestamptz not null,          -- 시간일자
  merchant         text,                           -- 사용처 (수입은 지급처)
  original_amount  numeric(14, 2) not null,        -- 원본 금액
  amount           numeric(14, 2) not null,        -- 실제 반영 금액

  type             text not null default 'expense'
                     check (type in ('expense', 'income')),

  card             text                            -- 결제 수단 식별
                     check (card in ('shinhan_personal', 'hana_corp') or card is null),

  category_id      uuid references categories (id) on delete set null,

  -- 금액 조정 관련
  adjustment       text not null default 'none'
                     check (adjustment in ('none', 'edited', 'dutch', 'corp_cap')),
  split_count      integer check (split_count is null or split_count >= 1),  -- 더치페이 인원수

  is_canceled      boolean not null default false, -- 승인취소 건

  -- 유입 추적
  source           text not null default 'manual'
                     check (source in ('sms', 'csv', 'manual')),
  raw_text         text,                           -- 원본 문자/행 (재파싱·디버깅용)

  memo             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index transactions_occurred_at_idx on transactions (occurred_at desc);
create index transactions_category_idx     on transactions (category_id);
create index transactions_type_idx         on transactions (type);

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- ingest_log : 단축어/CSV 유입 원본 로깅 (파싱 실패 추적용)
--   파서가 실패해도 원문을 잃지 않도록 먼저 여기에 적재.
-- ---------------------------------------------------------------------------
create table ingest_log (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('sms', 'csv', 'manual')),
  raw_text        text not null,
  parsed          boolean not null default false,   -- 파싱 성공 여부
  transaction_id  uuid references transactions (id) on delete set null,
  error           text,                              -- 파싱 실패 사유
  created_at      timestamptz not null default now()
);

create index ingest_log_parsed_idx on ingest_log (parsed, created_at desc);

-- ---------------------------------------------------------------------------
-- 보안(RLS) 관련 주의:
--   이 마이그레이션은 RLS를 켜지 않는다. 배포 전 반드시 결정 필요.
--   단축어가 anon 키로 직접 INSERT 하는 구조라면, 최소한
--   Edge Function + 서버 전용 service_role 키 경유로 바꾸는 것을 권장.
--   (개인용이라도 anon 키가 노출되면 누구나 쓰기 가능하므로)
-- ---------------------------------------------------------------------------
