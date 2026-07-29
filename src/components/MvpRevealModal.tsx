"use client";

import { useEffect, useState } from "react";
import { TANKS } from "@/lib/tanks";
import type { MvpEntry } from "./GameCanvas";

interface MvpRevealModalProps {
  entries: MvpEntry[];
  resultTitle: string;
  resultSubtitle: string;
  onClose: () => void;
}

export function MvpRevealModal({ entries, resultTitle, resultSubtitle, onClose }: MvpRevealModalProps) {
  const [index, setIndex] = useState(-1); // -1 = 결과 배너, 0..n-1 = MVP 카드, n = 마지막(닫기)
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [index]);

  const total = entries.length;
  const isResultStep = index === -1;
  const isDoneStep = index >= total;
  const current = !isResultStep && !isDoneStep ? entries[index] : null;

  const goNext = () => {
    setVisible(false);
    setTimeout(() => setIndex(i => i + 1), 180);
  };

  const tankDef = current ? TANKS[current.tankId] : null;

  return (
    <div style={styles.overlay} onClick={goNext}>
      <div style={{ ...styles.card, opacity: visible ? 1 : 0, transform: visible ? "translateY(0) scale(1)" : "translateY(18px) scale(0.96)" }} onClick={e => e.stopPropagation()}>
        {isResultStep && (
          <div style={styles.resultBlock}>
            <div style={styles.resultTitle}>{resultTitle}</div>
            <div style={styles.resultSubtitle}>{resultSubtitle}</div>
            <button style={styles.nextBtn} onClick={goNext}>
              {total > 0 ? "이번 판의 MVP 보기 →" : "확인"}
            </button>
          </div>
        )}

        {current && tankDef && (
          <div style={styles.mvpBlock}>
            <div style={styles.categoryLabel}>{current.icon} {current.label}</div>
            <div style={styles.tankFrame}>
              <div style={{ ...styles.tankBody, backgroundColor: tankDef.bodyColor, borderColor: tankDef.accentColor ?? "#475569" }} />
              {current.image ? (
                <img src={current.image} alt={current.name} style={styles.avatar} />
              ) : (
                <div style={styles.avatarFallback}>{current.name.slice(0, 1)}</div>
              )}
            </div>
            <div style={styles.playerName}>{current.name}</div>
            <div style={styles.tankName}>{tankDef.name}</div>
            <div style={styles.valueRow}>
              <span style={styles.valueNum}>{current.value.toLocaleString()}</span>
              <span style={styles.valueUnit}>{current.unit}</span>
            </div>
            <button style={styles.nextBtn} onClick={goNext}>
              {index === total - 1 ? "결과 확인 →" : "다음 →"}
            </button>
            <div style={styles.progressDots}>
              {entries.map((_, i) => (
                <span key={i} style={{ ...styles.dot, backgroundColor: i === index ? "#fbbf24" : "rgba(255,255,255,0.3)" }} />
              ))}
            </div>
          </div>
        )}

        {isDoneStep && (
          <div style={styles.resultBlock}>
            <div style={styles.resultTitle}>{resultTitle}</div>
            <div style={styles.resultSubtitle}>{resultSubtitle}</div>
            <button style={styles.nextBtn} onClick={onClose}>
              로비로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(10,10,20,0.82)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, backdropFilter: "blur(3px)", cursor: "pointer",
  },
  card: {
    width: 360, maxWidth: "88vw", background: "linear-gradient(160deg, #1e1b3a, #12101f)",
    borderRadius: 20, border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: "32px 28px",
    display: "flex", flexDirection: "column", alignItems: "center",
    transition: "opacity 0.18s ease, transform 0.18s ease", cursor: "default",
  },
  resultBlock: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "12px 0" },
  resultTitle: { fontSize: 26, fontWeight: 800, color: "#fff", textAlign: "center" },
  resultSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.65)", textAlign: "center", marginBottom: 8 },
  mvpBlock: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
  categoryLabel: { fontSize: 15, fontWeight: 700, color: "#fbbf24", letterSpacing: 0.3, marginBottom: 16 },
  tankFrame: {
    width: 96, height: 96, borderRadius: "50%", position: "relative",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "radial-gradient(circle, rgba(251,191,36,0.18), transparent 70%)",
    marginBottom: 10,
  },
  tankBody: { position: "absolute", width: 70, height: 26, borderRadius: 6, border: "3px solid #475569", top: 20 },
  avatar: { width: 52, height: 52, borderRadius: "50%", border: "2px solid #fbbf24", objectFit: "cover", position: "relative", zIndex: 1 },
  avatarFallback: {
    width: 52, height: 52, borderRadius: "50%", border: "2px solid #fbbf24",
    background: "#334155", color: "#fff", fontSize: 20, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1,
  },
  playerName: { fontSize: 19, fontWeight: 800, color: "#fff" },
  tankName: { fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2, marginBottom: 14 },
  valueRow: { display: "flex", alignItems: "baseline", gap: 6, marginBottom: 22 },
  valueNum: { fontSize: 34, fontWeight: 900, color: "#fbbf24" },
  valueUnit: { fontSize: 15, color: "rgba(255,255,255,0.6)", fontWeight: 600 },
  nextBtn: {
    padding: "10px 22px", borderRadius: 999, border: "none",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#1a1a1a",
    fontWeight: 700, fontSize: 14, cursor: "pointer",
  },
  progressDots: { display: "flex", gap: 6, marginTop: 16 },
  dot: { width: 6, height: 6, borderRadius: "50%" },
};
