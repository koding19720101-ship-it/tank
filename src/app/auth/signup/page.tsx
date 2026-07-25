"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, nickname }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "회원가입 중 오류가 발생했습니다.");
      return;
    }

    router.push("/auth/signin?registered=1");
  };

  return (
    <div style={styles.container}>
      <div style={styles.glassCard}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>💣</div>
          <h1 style={styles.title}>탱크</h1>
          <p style={styles.subtitle}>새로운 전사가 되어보세요!</p>
        </div>

        <form onSubmit={handleSignUp} style={styles.form}>
          <h3 style={styles.sectionTitle}>회원가입</h3>

          {error && <div style={styles.errorBox}>{error}</div>}

          <input
            type="email"
            placeholder="이메일 주소"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            disabled={loading}
            required
          />
          <input
            type="text"
            placeholder="닉네임 (최대 20자)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={styles.input}
            disabled={loading}
            maxLength={20}
            required
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            disabled={loading}
            required
          />
          <input
            type="password"
            placeholder="비밀번호 확인"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={styles.input}
            disabled={loading}
            required
          />

          <button
            type="submit"
            style={{ ...styles.button, ...(loading ? styles.buttonDisabled : styles.primaryBtn) }}
            disabled={loading}
          >
            {loading ? "가입 중..." : "회원가입 완료 ✅"}
          </button>
        </form>

        <div style={styles.footer}>
          <span style={styles.footerText}>이미 계정이 있으신가요?</span>
          <Link href="/auth/signin" style={styles.link}>
            로그인
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
    color: "#f8fafc",
    padding: "20px",
  },
  glassCard: {
    width: "100%",
    maxWidth: "400px",
    background: "rgba(30, 41, 59, 0.7)",
    backdropFilter: "blur(12px)",
    borderRadius: "16px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    padding: "40px 30px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
    textAlign: "center",
  },
  header: { marginBottom: "28px" },
  logoBadge: { fontSize: "3rem", marginBottom: "10px" },
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    background: "linear-gradient(to right, #6366f1, #a855f7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginBottom: "6px",
  },
  subtitle: { fontSize: "14px", color: "#94a3b8" },
  form: { display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" },
  sectionTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#e2e8f0",
    textAlign: "left",
    marginBottom: "4px",
  },
  errorBox: {
    background: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#f87171",
    textAlign: "left",
  },
  input: {
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    background: "rgba(15, 23, 42, 0.6)",
    color: "#ffffff",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box" as const,
    width: "100%",
  },
  button: {
    padding: "13px",
    borderRadius: "8px",
    border: "none",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    width: "100%",
    marginTop: "4px",
  },
  primaryBtn: {
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "#ffffff",
  },
  buttonDisabled: { background: "#475569", color: "#94a3b8", cursor: "not-allowed" },
  footer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "8px",
    paddingTop: "16px",
    borderTop: "1px solid rgba(255,255,255,0.07)",
  },
  footerText: { fontSize: "13px", color: "#64748b" },
  link: {
    fontSize: "13px",
    color: "#818cf8",
    textDecoration: "none",
    fontWeight: "600",
  },
};
