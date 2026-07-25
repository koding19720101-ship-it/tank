import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { email, password, nickname } = await req.json();

    if (!email || !password || !nickname) {
      return NextResponse.json({ error: "이메일, 비밀번호, 닉네임을 모두 입력해 주세요." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "비밀번호는 최소 6자 이상이어야 합니다." }, { status: 400 });
    }

    // 이메일 중복 확인
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 409 });
    }

    // 비밀번호 해시
    const hashedPassword = await bcrypt.hash(password, 12);

    // DB에 저장
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .insert({ email, password: hashedPassword, nickname, avatar: "" })
      .select("id, email, nickname")
      .single();

    if (error) {
      console.error("DB insert error:", error);
      return NextResponse.json({ error: "회원가입 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({ message: "회원가입 성공!", user }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
