"use client";

import React from "react";
import { X, Shield, Zap, Crosshair, ChevronLeft, ChevronRight } from "lucide-react";

interface GarageModalProps {
  onClose: () => void;
}

export function GarageModal({ onClose }: GarageModalProps) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>🔩 탱크 정비소</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={styles.content}>
          {/* Left Column: Interactive Tank Preview */}
          <div style={styles.previewContainer}>
            <h3 style={styles.sectionTitle}>현재 선택된 탱크</h3>
            
            {/* CSS Animated sleek grey tank */}
            <div style={styles.tankCard}>
              {/* Left Selector Arrow */}
              <button 
                style={styles.arrowSelectBtn} 
                onClick={() => alert("현재 선택 가능한 다른 탱크가 없습니다! 기본 탱크 '크롬'만 이용 가능합니다.")}
                title="이전 탱크"
              >
                <ChevronLeft size={24} />
              </button>

              <div style={styles.tankWrapper}>
                <div style={styles.tankTurret}></div>
                <div style={styles.tankBarrel}></div>
                <div style={styles.tankBody}></div>
                <div style={styles.tankTreads}>
                  <div style={styles.treadWheel}></div>
                  <div style={styles.treadWheel}></div>
                  <div style={styles.treadWheel}></div>
                  <div style={styles.treadWheel}></div>
                </div>
              </div>
              <div style={styles.tankShadow}></div>

              {/* Right Selector Arrow */}
              <button 
                style={{ ...styles.arrowSelectBtn, right: "12px", left: "auto" }} 
                onClick={() => alert("준비 중인 탱크입니다. 다음 업데이트를 기대해 주세요! 🚧")}
                title="다음 탱크"
              >
                <ChevronRight size={24} />
              </button>
            </div>

            <div style={styles.tankIdentity}>
              <h4 style={styles.tankName}>크롬 (Chrome)</h4>
              <span style={styles.tankTag}>기본형 탱크</span>
            </div>
            
            <p style={styles.tankDesc}>
              회색의 날렵한 바디를 가진 탱크입니다. 균형 잡힌 기동력과 고성능 조준 시스템을 기반으로 한 전술 포격에 최적화되어 있습니다.
            </p>
          </div>

          {/* Right Column: Stats & Weapon Details */}
          <div style={styles.statsContainer}>
            <h3 style={styles.sectionTitle}>탱크 정보 & 스탯</h3>
            
            {/* Stats */}
            <div style={styles.statsCard}>
              <div style={styles.statRow}>
                <div style={styles.statLabel}>
                  <Shield size={16} color="#ef4444" />
                  <span>최대 체력 (HP)</span>
                </div>
                <div style={styles.statValue}>100</div>
              </div>
              <div style={styles.statBarContainer}>
                <div style={{ ...styles.statBar, width: "100%", backgroundColor: "#ef4444" }}></div>
              </div>

              <div style={styles.statRow}>
                <div style={styles.statLabel}>
                  <Zap size={16} color="#eab308" />
                  <span>최대 연료 (Fuel)</span>
                </div>
                <div style={styles.statValue}>100</div>
              </div>
              <div style={styles.statBarContainer}>
                <div style={{ ...styles.statBar, width: "100%", backgroundColor: "#eab308" }}></div>
              </div>
              <span style={styles.fuelTip}>※ 이동 시 초당 약 30의 연료가 소모됩니다.</span>
            </div>

            <h3 style={styles.sectionTitle}>사용 가능한 포탄 종류 (마우스 스크롤로 변경)</h3>

            {/* Weapon List */}
            <div style={styles.weaponList}>
              {/* Heavy */}
              <div style={styles.weaponItem}>
                <div style={styles.weaponHeader}>
                  <span style={styles.weaponBadge}>해비 (Heavy)</span>
                  <span style={styles.weaponDamage}>데미지 20</span>
                </div>
                <p style={styles.weaponText}>
                  비행 속도는 느리지만 폭사 반경이 매우 넓습니다. 착탄 지점의 지형을 크게 폭발시키고 붕괴시킵니다.
                </p>
              </div>

              {/* Sniper */}
              <div style={styles.weaponItem}>
                <div style={styles.weaponHeader}>
                  <span style={{ ...styles.weaponBadge, backgroundColor: "#3b82f6" }}>저격 (Sniper)</span>
                  <span style={styles.weaponDamage}>데미지 20</span>
                </div>
                <p style={styles.weaponText}>
                  비행 속도가 대단히 빠르고 궤적이 직선에 가깝습니다. 지형 관통력이 뛰어나 탄환이 지나가는 길목의 지형을 깎아냅니다.
                </p>
              </div>

              {/* Cluster */}
              <div style={styles.weaponItem}>
                <div style={{ ...styles.weaponBadge, backgroundColor: "#a855f7" }}>집속탄 (Cluster)</div>
                <div style={{ ...styles.weaponHeader, marginTop: "4px" }}>
                  <span style={styles.weaponDamage}>직격 데미지: 8</span>
                  <span style={styles.weaponDamage}>분열 데미지: 개당 5 (총 3발)</span>
                </div>
                <p style={styles.weaponText}>
                  발사 후 공중에서 3갈래의 확산탄으로 분할되어 아래로 떨어집니다. 광범위 폭격이나 숨은 적 타격에 유용합니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.confirmBtn}>
            차고 나가기
          </button>
        </div>
      </div>

      <style>{`
        @keyframes treadScroll {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes barrelBob {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-3deg); }
        }
      `}</style>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    padding: "20px",
  },
  modal: {
    width: "100%",
    maxWidth: "800px",
    background: "#1e293b",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "16px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    padding: "24px",
    color: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    paddingBottom: "12px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "bold",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
  },
  content: {
    display: "flex",
    flexWrap: "wrap",
    gap: "24px",
    padding: "12px 0",
  },
  previewContainer: {
    flex: 1,
    minWidth: "280px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  sectionTitle: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#94a3b8",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
  },
  tankCard: {
    background: "#0f172a",
    borderRadius: "12px",
    height: "180px",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  tankWrapper: {
    position: "relative",
    width: "140px",
    height: "70px",
    transform: "translateY(-10px)",
  },
  tankTurret: {
    position: "absolute",
    width: "50px",
    height: "25px",
    backgroundColor: "#64748b",
    border: "2px solid #475569",
    borderRadius: "20px 20px 0 0",
    top: "10px",
    left: "45px",
    zIndex: 3,
  },
  tankBarrel: {
    position: "absolute",
    width: "65px",
    height: "8px",
    backgroundColor: "#475569",
    border: "2px solid #334155",
    borderRadius: "4px",
    top: "18px",
    left: "-10px",
    zIndex: 2,
    transformOrigin: "right center",
    animation: "barrelBob 3s ease-in-out infinite",
  },
  tankBody: {
    position: "absolute",
    width: "100px",
    height: "28px",
    backgroundColor: "#7889a4",
    border: "3px solid #475569",
    borderRadius: "10px",
    bottom: "12px",
    left: "20px",
    zIndex: 4,
  },
  tankTreads: {
    position: "absolute",
    width: "108px",
    height: "18px",
    backgroundColor: "#1e293b",
    border: "2px solid #475569",
    borderRadius: "9px",
    bottom: "2px",
    left: "16px",
    zIndex: 5,
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    padding: "0 4px",
    boxSizing: "border-box",
  },
  treadWheel: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: "#475569",
    border: "1px solid #1e293b",
    animation: "treadScroll 2s linear infinite",
  },
  tankShadow: {
    position: "absolute",
    width: "120px",
    height: "10px",
    background: "rgba(0,0,0,0.5)",
    borderRadius: "50%",
    bottom: "35px",
    filter: "blur(4px)",
  },
  tankIdentity: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  tankName: {
    fontSize: "22px",
    fontWeight: "bold",
  },
  tankTag: {
    fontSize: "11px",
    fontWeight: "bold",
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    color: "#818cf8",
    padding: "2px 8px",
    borderRadius: "12px",
    border: "1px solid rgba(99, 102, 241, 0.4)",
  },
  tankDesc: {
    fontSize: "13px",
    color: "#cbd5e1",
    lineHeight: "1.6",
  },
  statsContainer: {
    flex: 1.2,
    minWidth: "280px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  statsCard: {
    background: "rgba(15, 23, 42, 0.4)",
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.04)",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  },
  statLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    fontWeight: "600",
  },
  statValue: {
    fontSize: "14px",
    fontWeight: "bold",
  },
  statBarContainer: {
    height: "8px",
    background: "rgba(255, 255, 255, 0.08)",
    borderRadius: "4px",
    marginBottom: "16px",
    overflow: "hidden",
  },
  statBar: {
    height: "100%",
    borderRadius: "4px",
  },
  fuelTip: {
    fontSize: "11px",
    color: "#94a3b8",
  },
  weaponList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  weaponItem: {
    background: "rgba(30, 41, 59, 0.4)",
    border: "1px solid rgba(255,255,255,0.03)",
    borderRadius: "10px",
    padding: "12px",
  },
  weaponHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  },
  weaponBadge: {
    fontSize: "11px",
    fontWeight: "bold",
    backgroundColor: "#ef4444",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  weaponDamage: {
    fontSize: "12px",
    fontWeight: "bold",
    color: "#34d399",
  },
  weaponText: {
    fontSize: "12px",
    color: "#94a3b8",
    lineHeight: "1.5",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    paddingTop: "16px",
  },
  confirmBtn: {
    background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  arrowSelectBtn: {
    position: "absolute",
    left: "12px",
    zIndex: 10,
    background: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "50%",
    width: "38px",
    height: "38px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#cbd5e1",
    cursor: "pointer",
    transition: "background 0.2s, color 0.2s",
  },
};
