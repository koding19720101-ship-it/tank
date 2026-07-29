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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.panel, opacity: visible ? 1 : 0, transform: visible ? "translateY(0) scale(1)" : "translateY(18px) scale(0.96)" }} onClick={e => e.stopPropagation()}>
        <div style={styles.resultTitle}>{resultTitle}</div>
        <div style={styles.resultSubtitle}>{resultSubtitle}</div>

        {entries.length > 0 && (
          <>
            <div style={styles.mvpHeading}>🏅 이번 판의 MVP</div>
            <div style={styles.row}>
              {entries.map(e => <MvpCard key={e.key} entry={e} />)}
            </div>
          </>
        )}

        <button style={styles.closeBtn} onClick={onClose}>로비로 돌아가기</button>
      </div>
    </div>
  );
}

function MvpCard({ entry }: { entry: MvpEntry }) {
  const tankDef = TANKS[entry.tankId];
  return (
    <div style={styles.card}>
      <div style={styles.categoryLabel}>{entry.icon} {entry.label}</div>
      <div style={styles.tankFrame}>
        <div style={{ ...styles.tankBody, backgroundColor: tankDef.bodyColor, borderColor: tankDef.accentColor ?? "#475569" }} />
        {entry.image ? (
          <img src={entry.image} alt={entry.name} style={styles.avatar} />
        ) : (
          <div style={styles.avatarFallback}>{entry.name.slice(0, 1)}</div>
        )}
      </div>
      <div style={styles.playerName}>{entry.name}</div>
      <div style={styles.tankName}>{tankDef.name}</div>
      <div style={styles.valueRow}>
        <span style={styles.valueNum}>{entry.value.toLocaleString()}</span>
        <span style={styles.valueUnit}>{entry.unit}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(10,10,20,0.82)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, backdropFilter: "blur(3px)", cursor: "pointer", padding: 16,
  },
  panel: {
    width: 920, maxWidth: "95vw", background: "linear-gradient(160deg, #1e1b3a, #12101f)",
    borderRadius: 22, border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: "28px 26px",
    display: "flex", flexDirection: "column", alignItems: "center",
    transition: "opacity 0.18s ease, transform 0.18s ease", cursor: "default",
  },
  resultTitle: { fontSize: 26, fontWeight: 800, color: "#fff", textAlign: "center" },
  resultSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.65)", textAlign: "center", marginTop: 4 },
  mvpHeading: { fontSize: 14, fontWeight: 700, color: "#fbbf24", marginTop: 22, marginBottom: 12, letterSpacing: 0.4 },
  row: {
    display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", width: "100%",
  },
  card: {
    width: 158, background: "rgba(255,255,255,0.05)", borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.1)", padding: "16px 10px",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  categoryLabel: { fontSize: 12, fontWeight: 700, color: "#fbbf24", textAlign: "center", marginBottom: 12, lineHeight: 1.3 },
  tankFrame: {
    width: 66, height: 66, borderRadius: "50%", position: "relative",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "radial-gradient(circle, rgba(251,191,36,0.18), transparent 70%)",
    marginBottom: 8,
  },
  tankBody: { position: "absolute", width: 48, height: 18, borderRadius: 5, border: "2px solid #475569", top: 15 },
  avatar: { width: 36, height: 36, borderRadius: "50%", border: "2px solid #fbbf24", objectFit: "cover", position: "relative", zIndex: 1 },
  avatarFallback: {
    width: 36, height: 36, borderRadius: "50%", border: "2px solid #fbbf24",
    background: "#334155", color: "#fff", fontSize: 14, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1,
  },
  playerName: { fontSize: 13, fontWeight: 800, color: "#fff", textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  tankName: { fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1, marginBottom: 8 },
  valueRow: { display: "flex", alignItems: "baseline", gap: 3 },
  valueNum: { fontSize: 18, fontWeight: 900, color: "#fbbf24" },
  valueUnit: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600 },
  closeBtn: {
    marginTop: 26, padding: "10px 24px", borderRadius: 999, border: "none",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#1a1a1a",
    fontWeight: 700, fontSize: 14, cursor: "pointer",
  },
};
