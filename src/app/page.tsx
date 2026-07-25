"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/lobby");
    } else if (status === "unauthenticated") {
      router.replace("/auth/signin");
    }
  }, [status, router]);

  return (
    <div style={styles.loadingContainer}>
      <div style={styles.spinner}></div>
      <p style={{ marginTop: "10px" }}>Redirecting...</p>
    </div>
  );
}

const styles = {
  loadingContainer: {
    minHeight: "100vh",
    background: "#090d16",
    color: "#f8fafc",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid rgba(99, 102, 241, 0.2)",
    borderTop: "4px solid #6366f1",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};
