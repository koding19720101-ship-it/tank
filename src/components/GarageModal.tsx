"use client";

import React from "react";
import { X, Shield, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import { TANKS, TANK_ORDER, TankId, WEAPON_DEFS } from "@/lib/tanks";

interface GarageModalProps {
  onClose: () => void;
  currentTankId: TankId;
  onSelectTank: (id: TankId) => void;
  tankStats?: Record<TankId, { wins: number; losses: number }>;
}

export function GarageModal({ onClose, currentTankId, onSelectTank, tankStats }: GarageModalProps) {
  const tank = TANKS[currentTankId];
  const idx = TANK_ORDER.indexOf(currentTankId);

  const cycle = (dir: -1 | 1) => {
    const next = TANK_ORDER[(idx + dir + TANK_ORDER.length) % TANK_ORDER.length];
    onSelectTank(next);
  };

  // Calculate win rate for current tank
  const curSt = tankStats?.[currentTankId] ?? { wins: 0, losses: 0 };
  const curTotal = curSt.wins + curSt.losses;
  const curWinRate = curTotal > 0 ? Math.round((curSt.wins / curTotal) * 100) : 0;

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

            <div style={styles.tankCard}>
              <button style={styles.arrowSelectBtn} onClick={() => cycle(-1)} title="이전 탱크">
                <ChevronLeft size={24} />
              </button>

              <div style={styles.tankWrapper}>
                <div style={{ ...styles.tankTurret, backgroundColor: shade(tank.bodyColor, -10) }}></div>
                <div style={{ ...styles.tankBarrel, backgroundColor: tank.accentColor ?? styles.tankBarrel.backgroundColor, borderColor: tank.accentColor ? shade(tank.accentColor, -20) : undefined }}></div>
                <div style={{ ...styles.tankBody, backgroundColor: tank.bodyColor, borderColor: tank.accentColor ?? "#475569" }}></div>
                <div style={styles.tankTreads}>
                  <div style={styles.treadWheel}></div>
                  <div style={styles.treadWheel}></div>
                  <div style={styles.treadWheel}></div>
                  <div style={styles.treadWheel}></div>
                </div>
              </div>
              <div style={styles.tankShadow}></div>

              <button style={{ ...styles.arrowSelectBtn, right: "12px", left: "auto" }} onClick={() => cycle(1)} title="다음 탱크">
                <ChevronRight size={24} />
              </button>
            </div>

            <div style={styles.tankIdentity}>
              <h4 style={styles.tankName}>{tank.name}</h4>
              <span style={styles.tankTag}>{tank.tag}</span>
            </div>

            {/* Tank Select Buttons */}
            <div style={{ display: "flex", gap: "6px", width: "100%", marginTop: "10px", marginBottom: "10px" }}>
              {TANK_ORDER.map((tid) => {
                const t = TANKS[tid];
                const isSelected = tid === currentTankId;
                const st = tankStats?.[tid] ?? { wins: 0, losses: 0 };
                const tTot = st.wins + st.losses;
                const wr = tTot > 0 ? Math.round((st.wins / tTot) * 100) : 0;

                return (
                  <button
                    key={tid}
                    onClick={() => onSelectTank(tid)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid #6366f1" : "1px solid rgba(255,255,255,0.1)",
                      backgroundColor: isSelected ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)",
                      color: isSelected ? "#ffffff" : "#94a3b8",
                      fontSize: "11px",
                      fontWeight: isSelected ? "bold" : "normal",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "3px",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: t.bodyColor, border: "1px solid #ffffff" }}></div>
                    <span>{t.name.split(" ")[0]}</span>
                    <span style={{ fontSize: "9px", color: wr > 0 ? "#38bdf8" : "#64748b" }}>
                      {tTot > 0 ? `${wr}%` : "-"}
                    </span>
                  </button>
                );
              })}
            </div>

            <p style={styles.tankDesc}>{tank.description}</p>
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
                <div style={styles.statValue}>{tank.maxHp}</div>
              </div>
              <div style={styles.statBarContainer}>
                <div style={{ ...styles.statBar, width: `${(tank.maxHp / 150) * 100}%`, backgroundColor: "#ef4444" }}></div>
              </div>

              <div style={styles.statRow}>
                <div style={styles.statLabel}>
                  <Zap size={16} color="#eab308" />
                  <span>최대 연료 (Fuel)</span>
                </div>
                <div style={styles.statValue}>{tank.maxFuel}</div>
              </div>
              <div style={styles.statBarContainer}>
                <div style={{ ...styles.statBar, width: `${(tank.maxFuel / 150) * 100}%`, backgroundColor: "#eab308" }}></div>
              </div>

              <div style={styles.statRow}>
                <div style={styles.statLabel}>
                  <span style={{ fontSize: "14px" }}>🏆</span>
                  <span>전용 승률</span>
                </div>
                <div style={{ ...styles.statValue, color: curWinRate > 0 ? "#38bdf8" : "#94a3b8" }}>
                  {curTotal > 0 ? `${curWinRate}% (${curSt.wins}승 ${curSt.losses}패)` : "전적 없음"}
                </div>
              </div>
              <div style={styles.statBarContainer}>
                <div style={{ ...styles.statBar, width: `${curWinRate}%`, backgroundColor: "#38bdf8" }}></div>
              </div>

              <span style={styles.fuelTip}>※ 이동 시 초당 약 30의 연료가 소모됩니다.</span>
            </div>

            <h3 style={styles.sectionTitle}>사용 가능한 포탄 종류 (마우스 스크롤로 변경)</h3>

            {/* Weapon List */}
            <div style={styles.weaponList}>
              {tank.weapons.map((wid) => {
                const w = WEAPON_DEFS[wid];
                return (
                  <div key={wid} style={styles.weaponItem}>
                    <div style={styles.weaponHeader}>
                      <span style={{ ...styles.weaponBadge, backgroundColor: w.color }}>{w.label}</span>
                      <span style={styles.weaponDamage}>
                        {wid === "vine"
                          ? "씨앗 5발 · 이속 15% 감소(중첩)"
                          : wid === "tree"
                          ? "튕겨나감 · 시간 경과 후 지형화"
                          : wid === "incendiary"
                          ? `분열 ${w.splitCount}갈래 · 개당 ${w.splitDamage}뎀 · 화상(도트뎀)`
                          : wid === "emp"
                          ? `데미지 ${w.maxDmg} · 이속 45% 감소`
                          : wid === "moveshot"
                          ? `적중시 ${w.maxDmg}뎀 · 반동 자해 ${w.selfDamage}뎀`
                          : wid === "bouncyball"
                          ? `개당 ${w.splitDamage}뎀 · 최대 ${w.maxBounces}회 튕김`
                          : wid === "trickshot"
                          ? `데미지 ${w.maxDmg} · 적 감지시 급강하`
                          : wid === "flamethrower"
                          ? `데미지 ${w.maxDmg} · 즉발 화염 · 화상 부여`
                          : wid === "volcano"
                          ? `개당 ${w.splitDamage}뎀 · 화상(장시간)`
                          : wid === "hellfire"
                          ? `데미지 ${w.maxDmg} · 지연 폭발 · 광역 화상`
                          : w.splitCount
                          ? `분열 ${w.splitCount}갈래 · 개당 ${w.splitDamage}뎀`
                          : `데미지 ${w.maxDmg}`}
                      </span>
                    </div>
                    <p style={styles.weaponText}>{weaponDesc(wid)}</p>
                  </div>
                );
              })}
            </div>
            <p style={styles.selfDmgNote}>⚠️ 모든 무기는 자신의 폭발 범위 안에 있으면 자신도 피해를 입습니다.</p>
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

function weaponDesc(wid: string): string {
  switch (wid) {
    case "heavy": return "비행 속도는 느리지만 폭사 반경이 매우 넓습니다. 착탄 지점의 지형을 크게 폭발시키고 붕괴시킵니다.";
    case "sniper": return "비행 속도가 대단히 빠르고 궤적이 직선에 가깝습니다. 지형 관통력이 뛰어나 탄환이 지나가는 길목의 지형을 깎아냅니다.";
    case "cluster": return "발사 후 공중에서 3갈래의 확산탄으로 분할되어 아래로 떨어집니다. 광범위 폭격이나 숨은 적 타격에 유용합니다.";
    case "buckshot": return "발사 후 공중에서 5갈래로 잘게 분열되는 산탄입니다. 넓은 지역에 골고루 피해를 뿌립니다.";
    case "incendiary": return "5갈래로 분열되는 소이탄입니다. 데미지는 집속탄과 같지만, 적중한 대상에게 불이 붙어 시간이 지나며 추가 화상 피해를 입힙니다.";
    case "mine": return "지뢰를 발사합니다. 지형에 착지하면 즉시 터지지 않고 설치되며, 아군이든 적이든 밟으면 폭발합니다.";
    case "vine": return "5개의 씨앗을 날립니다. 바닥에 닿으면 덩쿨이 자라나며, 덩쿨에 닿으면 사라지면서 그 탱크는 다음 턴 이동속도가 15% 감소합니다. 여러 번 맞으면 감소량이 중첩됩니다.";
    case "tree": return "닿은 자리에 세계수가 자라납니다. 나무에 처음 닿아 튕겨나갈 때 15 피해를 주며, 심어진 지 몇 초 후 나무는 그대로 단단한 지형으로 변합니다.";
    case "flower": return "꽃가루 이펙트를 남기는 탄환입니다. 적중한 상대의 조준 각도가 -17~+17 사이로 랜덤하게 흐트러집니다.";
    case "emp": return "노란색 EMP탄입니다. 닿으면 파란 빈 원이 진동하다 작아지며 구멍을 내며 터집니다. 전기 폭발에 맞으면 10 피해와 함께 이동속도가 45% 감소합니다.";
    case "minigun": return "일직선으로 얇은 탄환 20발을 빠르게 연사합니다. 개당 1 피해를 주며 미세하게 지형을 파괴합니다.";
    case "railgun": return "일직선으로 빠르게 나아가는 고에너지 레일건입니다. 얇은 파란 선이 조준된 후 빔이 굵어지며 지나는 대상에게 초당 10의 지속 피해를 줍니다.";
    case "moveshot": return "포를 쏘는 대신 자신의 몸이 직접 포탄처럼 날아갑니다. 착지하며 폭발해 주변 적에게 20 피해를 주지만, 적을 맞췄을 경우 반동으로 자신도 7 피해를 입습니다.";
    case "bouncyball": return "분홍색 탄 5발을 발사합니다. 지형에 닿을 때마다 약하게 터지며 개당 5 피해를 주고, 최대 5번까지 튕겨다니다 마지막에 완전히 소멸합니다.";
    case "trickshot": return "일직선으로 곧게 날아가다가 진행 경로 아래에 상대 탱크가 감지되면 그 지점에서 90도로 급강하해 착탄과 동시에 폭발합니다.";
    case "flamethrower": return "전방을 향해 즉시 화염을 내뿜는 근거리 무기입니다. 닿은 대상에게 피해를 주며 불을 붙입니다. 세계수의 나무나 덩쿨탄의 덩쿨도 태워 없앨 수 있습니다.";
    case "volcano": return "불타는 덩어리 5발을 흩뿌립니다. 적중한 대상은 일반 소이탄보다 오랫동안 불이 붙어 지속 피해를 입습니다. 나무나 덩쿨도 태워 없앨 수 있습니다.";
    case "hellfire": return "회색의 길쭉한 탄입니다. 지형에 꽂히면 즉시 터지지 않고 점점 붉게 달아오르다가 잠시 후 넓은 범위에 큰 폭발을 일으키며 불을 붙입니다. 나무나 덩쿨도 태워 없앨 수 있습니다.";
    default: return "";
  }
}

function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: "20px",
  },
  modal: {
    width: "100%", maxWidth: "800px", background: "#1e293b",
    border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "16px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", padding: "24px",
    color: "#f8fafc", display: "flex", flexDirection: "column", gap: "16px",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" },
  title: { fontSize: "20px", fontWeight: "bold" },
  closeBtn: { background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" },
  content: { display: "flex", flexWrap: "wrap", gap: "24px", padding: "12px 0" },
  previewContainer: { flex: 1, minWidth: "280px", display: "flex", flexDirection: "column", gap: "14px" },
  sectionTitle: { fontSize: "14px", fontWeight: "bold", color: "#94a3b8", letterSpacing: "0.5px", textTransform: "uppercase" },
  tankCard: { background: "#0f172a", borderRadius: "12px", height: "180px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" },
  tankWrapper: { position: "relative", width: "140px", height: "70px", transform: "translateY(-10px)" },
  tankTurret: { position: "absolute", width: "50px", height: "25px", border: "2px solid #475569", borderRadius: "20px 20px 0 0", top: "10px", left: "45px", zIndex: 3 },
  tankBarrel: { position: "absolute", width: "65px", height: "8px", backgroundColor: "#475569", border: "2px solid #334155", borderRadius: "4px", top: "18px", left: "-10px", zIndex: 2, transformOrigin: "right center", animation: "barrelBob 3s ease-in-out infinite" },
  tankBody: { position: "absolute", width: "100px", height: "28px", border: "3px solid #475569", borderRadius: "10px", bottom: "12px", left: "20px", zIndex: 4 },
  tankTreads: { position: "absolute", width: "108px", height: "18px", backgroundColor: "#1e293b", border: "2px solid #475569", borderRadius: "9px", bottom: "2px", left: "16px", zIndex: 5, display: "flex", justifyContent: "space-around", alignItems: "center", padding: "0 4px", boxSizing: "border-box" },
  treadWheel: { width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#475569", border: "1px solid #1e293b", animation: "treadScroll 2s linear infinite" },
  tankShadow: { position: "absolute", width: "120px", height: "10px", background: "rgba(0,0,0,0.5)", borderRadius: "50%", bottom: "35px", filter: "blur(4px)" },
  tankIdentity: { display: "flex", alignItems: "center", gap: "10px" },
  tankName: { fontSize: "22px", fontWeight: "bold" },
  tankTag: { fontSize: "11px", fontWeight: "bold", backgroundColor: "rgba(99, 102, 241, 0.2)", color: "#818cf8", padding: "2px 8px", borderRadius: "12px", border: "1px solid rgba(99, 102, 241, 0.4)" },
  tankDesc: { fontSize: "13px", color: "#cbd5e1", lineHeight: "1.6" },
  statsContainer: { flex: 1.2, minWidth: "280px", display: "flex", flexDirection: "column", gap: "14px" },
  statsCard: { background: "rgba(15, 23, 42, 0.4)", padding: "16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.04)" },
  statRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" },
  statLabel: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600" },
  statValue: { fontSize: "14px", fontWeight: "bold" },
  statBarContainer: { height: "8px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "4px", marginBottom: "16px", overflow: "hidden" },
  statBar: { height: "100%", borderRadius: "4px" },
  fuelTip: { fontSize: "11px", color: "#94a3b8" },
  weaponList: { display: "flex", flexDirection: "column", gap: "10px" },
  weaponItem: { background: "rgba(30, 41, 59, 0.4)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "10px", padding: "12px" },
  weaponHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" },
  weaponBadge: { fontSize: "11px", fontWeight: "bold", color: "#fff", padding: "2px 8px", borderRadius: "4px" },
  weaponDamage: { fontSize: "12px", fontWeight: "bold", color: "#34d399" },
  weaponText: { fontSize: "12px", color: "#94a3b8", lineHeight: "1.5" },
  selfDmgNote: { fontSize: "11px", color: "#fca5a5", marginTop: "2px" },
  footer: { display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "16px" },
  confirmBtn: { background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 24px", fontSize: "14px", fontWeight: "bold", cursor: "pointer" },
  arrowSelectBtn: { position: "absolute", left: "12px", zIndex: 10, background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "50%", width: "38px", height: "38px", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", cursor: "pointer", transition: "background 0.2s, color 0.2s" },
};
