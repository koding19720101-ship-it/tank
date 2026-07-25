import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 클라이언트용 (공개 가능)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 서버 전용 (서비스 롤 키 - RLS 우회)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
