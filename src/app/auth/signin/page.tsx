"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) return;
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    } else {
      router.push("/lobby");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.glassCard}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>💣</div>
          <h1 style={styles.title}>탱크</h1>
          <p style={styles.subtitle}>전장에 참여하세요</p>
        </div>

        <form onSubmit={handleSignIn} style={styles.form}>
          <h3 style={styles.sectionTitle}>로그인</h3>

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
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            disabled={loading}
            required
          />

          <button
            type="submit"
            style={{ ...styles.button, ...(loading ? styles.buttonDisabled : styles.primaryBtn) }}
            disabled={loading}
          >
            {loading ? "로그인 중..." : "로그인 🎮"}
          </button>
        </form>

        <div style={styles.footer}>
          <span style={styles.footerText}>계정이 없으신가요?</span>
          <Link href="/auth/signup" style={styles.link}>
            회원가입
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
    background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)",
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
