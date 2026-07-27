"use client";

import React, { useState } from "react";
import { ScrollText, ChevronUp, ChevronDown } from "lucide-react";
import { PATCH_NOTES } from "@/lib/patchnotes";

export function PatchNotesBar() {
  const [expanded, setExpanded] = useState(false);
  const latest = PATCH_NOTES[0];

  return (
    <div style={styles.wrapper}>
      <button style={styles.header} onClick={() => setExpanded(v => !v)}>
        <span style={styles.headerLeft}>
          <ScrollText size={14} />
          <span>패치노트</span>
          <span style={styles.date}>{latest.date}</span>
          <span style={styles.title}>{latest.title}</span>
        </span>
        {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {expanded && (
        <div style={styles.body}>
          {PATCH_NOTES.map((note, i) => (
            <div key={i} style={styles.noteBlock}>
              <div style={styles.noteHeader}>
                <span style={styles.noteDate}>{note.date}</span>
                <span style={styles.noteTitle}>{note.title}</span>
              </div>
              <ul style={styles.list}>
                {note.changes.map((c, j) => (
                  <li key={j} style={styles.listItem}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrapper: {
    position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 200,
    background: "rgba(15, 23, 42, 0.92)", backdropFilter: "blur(6px)",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    maxHeight: "45vh", display: "flex", flexDirection: "column",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", background: "transparent", border: "none", cursor: "pointer",
    padding: "8px 16px", color: "#cbd5e1", fontSize: "12px",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "8px" },
  date: { color: "#818cf8", fontWeight: "bold" },
  title: { color: "#94a3b8" },
  body: {
    overflowY: "auto", padding: "0 16px 14px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  noteBlock: { padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  noteHeader: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" },
  noteDate: { fontSize: "12px", fontWeight: "bold", color: "#818cf8" },
  noteTitle: { fontSize: "12px", color: "#e2e8f0", fontWeight: "600" },
  list: { margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "3px" },
  listItem: { fontSize: "12px", color: "#cbd5e1", lineHeight: "1.5" },
};
