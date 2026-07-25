import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { nickname } = await req.json();

    if (!nickname || nickname.trim().length < 1) {
      return NextResponse.json({ error: "닉네임을 입력해 주세요." }, { status: 400 });
    }

    if (nickname.trim().length > 20) {
      return NextResponse.json({ error: "닉네임은 최대 20자까지 입력 가능합니다." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ nickname: nickname.trim() })
      .eq("email", session.user.email);

    if (error) {
      return NextResponse.json({ error: "닉네임 변경 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({ message: "닉네임이 변경되었습니다.", nickname: nickname.trim() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
