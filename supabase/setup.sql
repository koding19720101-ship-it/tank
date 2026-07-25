-- 탱크 게임 유저 테이블
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 이메일 인덱스
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
