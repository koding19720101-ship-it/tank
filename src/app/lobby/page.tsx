"use client";

import { useSession as useAuthSession, signOut as authSignOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { LogOut, Play, Sparkles, Users, Palette, Check, X, Pencil, ShieldAlert, Swords } from "lucide-react";
import { AvatarEditor } from "@/components/AvatarEditor";
import { GarageModal } from "@/components/GarageModal";
import { GameCanvas } from "@/components/GameCanvas";
import { PatchNotesBar } from "@/components/PatchNotesBar";
import { TankId, DEFAULT_TANK_ID, TANKS } from "@/lib/tanks";

type MatchmakingState = "IDLE" | "SEARCHING" | "MATCHED";
type GameMode = "1v1" | "2v2" | "3v3";

interface PlayerProfile {
  id: string;
  name: string;
  image: string;
  tankId?: TankId;
  wins?: number;
  losses?: number;
  winRate?: number;
}

interface GameStartData {
  players: Array<{ socketId: string; team: "red" | "blue"; slotIndex: number; x: number; hp: number; profile: PlayerProfile }>;
  turnOrder: string[];
  activeSocketId: string;
  seed: number;
  mode: GameMode;
}

export default function LobbyPage() {
  const { data: session, status, update: updateSession } = useAuthSession();
  const router = useRouter();

  // Win record states
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [tankStats, setTankStats] = useState<Record<string, { wins: number; losses: number }>>({});

  // Matchmaking & UI states
  const [matchState, setMatchState] = useState<MatchmakingState>("IDLE");
  const [selectedMode, setSelectedMode] = useState<GameMode>("1v1");
  const [isModeModalOpen, setIsModeModalOpen] = useState(false);
  const [searchDuration, setSearchDuration] = useState(0);
  const [matchFoundData, setMatchFoundData] = useState<{ team: "red" | "blue"; teammates: PlayerProfile[]; opponents: PlayerProfile[]; mode: GameMode } | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  const [customAvatar, setCustomAvatar] = useState<string>("");
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [isGarageOpen, setIsGarageOpen] = useState(false);
  const [selectedTankId, setSelectedTankId] = useState<TankId>(DEFAULT_TANK_ID);

  // Gameplay session states
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameStartInfo, setGameStartInfo] = useState<GameStartData | null>(null);

  // Nickname states
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameLoading, setNicknameLoading] = useState(false);
  const [nicknameError, setNicknameError] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const avatarRef = useRef<string>("");
  const tankIdRef = useRef<TankId>(DEFAULT_TANK_ID);
  const sessionRef = useRef(session);

  const getBlankWhiteAvatar = () => {
    if (typeof window === "undefined") return "";
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, 128, 128); }
    return canvas.toDataURL("image/png");
  };

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { avatarRef.current = customAvatar; }, [customAvatar]);
  useEffect(() => { tankIdRef.current = selectedTankId; }, [selectedTankId]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      const userId = (session.user as any).id || session.user.email || "default";
      const saved = localStorage.getItem(`custom_avatar_${userId}`);
      setCustomAvatar(saved || getBlankWhiteAvatar());
      const savedTank = localStorage.getItem(`selected_tank_${userId}`) as TankId | null;
      if (savedTank === "chrome" || savedTank === "shotgun" || savedTank === "forest" || savedTank === "bolt") setSelectedTankId(savedTank);

      const w = parseInt(localStorage.getItem(`user_wins_${userId}`) || "0", 10);
      const l = parseInt(localStorage.getItem(`user_losses_${userId}`) || "0", 10);
      setWins(w);
      setLosses(l);

      const statsStr = localStorage.getItem(`tank_stats_${userId}`);
      if (statsStr) { try { setTankStats(JSON.parse(statsStr)); } catch (e) {} }
    }
  }, [session]);

  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  const bestTankInfo = (() => {
    let bestId: TankId | null = null;
    let maxRate = -1;
    let maxWins = -1;
    (Object.keys(tankStats) as TankId[]).forEach((tid) => {
      const st = tankStats[tid];
      const tGames = st.wins + st.losses;
      if (tGames > 0) {
        const rate = Math.round((st.wins / tGames) * 100);
        if (rate > maxRate || (rate === maxRate && st.wins > maxWins)) {
          maxRate = rate; maxWins = st.wins; bestId = tid;
        }
      }
    });
    return bestId ? { tankId: bestId as TankId, rate: maxRate, wins: tankStats[bestId as TankId].wins, losses: tankStats[bestId as TankId].losses } : null;
  })();

  const selectTank = (tankId: TankId) => {
    setSelectedTankId(tankId);
    if (session?.user) {
      const userId = (session.user as any).id || session.user.email || "default";
      localStorage.setItem(`selected_tank_${userId}`, tankId);
    }
  };

  useEffect(() => {
    if (matchState === "SEARCHING") {
      timerRef.current = setInterval(() => setSearchDuration((p) => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSearchDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [matchState]);

  // Socket setup
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || `http://${window.location.hostname}:3001`;
    const socket = io(socketUrl, { autoConnect: true, transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("online-stats", (data: { onlineCount: number }) => setOnlineCount(data.onlineCount));

    socket.on("match-found", (data: { roomName: string; team: "red" | "blue"; teammates: PlayerProfile[]; opponents: PlayerProfile[]; mode: GameMode }) => {
      console.log("[lobby] match-found", data.roomName, data.mode);
      setMatchFoundData({ team: data.team, teammates: data.teammates, opponents: data.opponents, mode: data.mode });
      setRoomName(data.roomName);
      setMatchState("MATCHED");
    });

    socket.on("game-start", (data: GameStartData) => {
      console.log("[lobby] game-start received", data);
      setGameStartInfo(data);
      setIsPlaying(true);
    });

    socket.on("queue-left", () => setMatchState("IDLE"));

    socket.on("game-ended", ({ reason }: { reason: string }) => {
      setIsPlaying(false);
      setGameStartInfo(null);
      setMatchState("IDLE");
      setMatchFoundData(null);
      setRoomName(null);
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When matched, emit join-game-room
  useEffect(() => {
    if (matchState !== "MATCHED" || !roomName || !socketRef.current) return;
    const currentSession = sessionRef.current;
    const activeAvatar = avatarRef.current || getBlankWhiteAvatar();
    const playerProfile: PlayerProfile = {
      id: (currentSession?.user as any)?.id || currentSession?.user?.email || "unknown",
      name: currentSession?.user?.name || "탱크 유저",
      image: activeAvatar,
      tankId: tankIdRef.current,
      wins,
      losses,
      winRate,
    };
    console.log("[lobby] emitting join-game-room", roomName, playerProfile.name);
    socketRef.current.emit("join-game-room", { roomName, profile: playerProfile });
  }, [matchState, roomName, wins, losses, winRate]);

  const handleStartMatchmaking = (mode: GameMode) => {
    if (!session?.user || !socketRef.current) return;
    const playerProfile: PlayerProfile = {
      id: (session.user as any).id || session.user.email || "unknown",
      name: session.user.name || "탱크 유저",
      image: customAvatar || getBlankWhiteAvatar(),
      tankId: selectedTankId,
      wins,
      losses,
      winRate,
    };
    setSelectedMode(mode);
    setMatchState("SEARCHING");
    socketRef.current.emit("join-queue", { profile: playerProfile, mode });
  };

  const handleCancelMatchmaking = () => {
    socketRef.current?.emit("leave-queue");
    setMatchState("IDLE");
  };

  const saveCustomAvatar = (dataUrl: string) => {
    if (session?.user) {
      const userId = (session.user as any).id || session.user.email || "default";
      localStorage.setItem(`custom_avatar_${userId}`, dataUrl);
      setCustomAvatar(dataUrl);
      setIsEditingAvatar(false);
    }
  };

  const startEditingNickname = () => { setNicknameInput(session?.user?.name || ""); setNicknameError(""); setIsEditingNickname(true); };
  const cancelEditingNickname = () => { setIsEditingNickname(false); setNicknameError(""); };

  const saveNickname = async () => {
    if (!nicknameInput.trim()) { setNicknameError("닉네임을 입력해 주세요."); return; }
    setNicknameLoading(true); setNicknameError("");
    const res = await fetch("/api/user/nickname", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: nicknameInput.trim() }) });
    const data = await res.json();
    setNicknameLoading(false);
    if (!res.ok) { setNicknameError(data.error || "오류가 발생했습니다."); return; }
    await updateSession({ name: data.nickname });
    setIsEditingNickname(false);
  };

  const handleGameFinished = useCallback((reason: string) => {
    setIsPlaying(false);
    setGameStartInfo(null);
    setMatchState("IDLE");
    setMatchFoundData(null);
    setRoomName(null);

    const userId = session?.user ? ((session.user as any).id || session.user.email || "default") : null;

    if (reason === "defeat") {
      if (userId) { const nl = losses + 1; setLosses(nl); localStorage.setItem(`user_losses_${userId}`, nl.toString()); }
      alert("패배했습니다! 다음엔 꼭 이겨보세요. 💪");
    } else if (reason === "victory" || reason === "opponent_left") {
      if (userId) { const nw = wins + 1; setWins(nw); localStorage.setItem(`user_wins_${userId}`, nw.toString()); }
      if (reason === "opponent_left") alert("상대방이 게임에서 탈주하여 승리했습니다! 🏆");
      else alert("승리했습니다! 🏆 훌륭한 포격이었어요!");
    } else {
      alert("게임이 종료되었습니다!");
    }
  }, [session, losses, wins]);

  // Stable profile object for GameCanvas — prevents its heavy render-loop
  // effects from tearing down/restarting on every unrelated lobby re-render
  // (e.g. the frequent "online-stats" broadcast from the matchmaker server).
  const myGameProfile = useMemo(() => ({
    id: (session?.user as any)?.id || session?.user?.email || "me",
    name: session?.user?.name || "나",
    image: customAvatar || getBlankWhiteAvatar(),
    tankId: selectedTankId,
  }), [session, customAvatar, selectedTankId]);

  if (status === "loading") {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>불러오는 중...</p>
      </div>
    );
  }
  if (!session?.user) return null;

  const displayAvatar = customAvatar || getBlankWhiteAvatar();

  if (isPlaying && gameStartInfo && socketRef.current && roomName) {
    return (
      <div style={styles.gameWrapper}>
        <GameCanvas
          socket={socketRef.current}
          roomName={roomName}
          myProfile={myGameProfile}
          initialSeed={gameStartInfo.seed}
          allPlayers={gameStartInfo.players}
          turnOrder={gameStartInfo.turnOrder}
          activeSocketId={gameStartInfo.activeSocketId}
          mode={gameStartInfo.mode}
          onGameEnded={handleGameFinished}
        />
      </div>
    );
  }

  const MODE_LABELS: Record<GameMode, { label: string; desc: string; color: string; icon: string }> = {
    "1v1": { label: "1 vs 1", desc: "1명 대 1명 맞대결", color: "#6366f1", icon: "⚔️" },
    "2v2": { label: "2 vs 2", desc: "2명 팀 대결", color: "#f59e0b", icon: "🛡️" },
    "3v3": { label: "3 vs 3", desc: "3명 팀 대결", color: "#ef4444", icon: "💥" },
  };

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.navBrand}>💣 <span style={{ fontWeight: "bold" }}>탱크</span></div>

        <div style={styles.navUser}>
          {isEditingNickname ? (
            <div style={styles.nicknameEditRow}>
              <input value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} style={styles.nicknameInput} maxLength={20} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") cancelEditingNickname(); }} />
              <button onClick={saveNickname} disabled={nicknameLoading} style={styles.iconBtn} title="저장"><Check size={15} color="#10b981" /></button>
              <button onClick={cancelEditingNickname} style={styles.iconBtn} title="취소"><X size={15} color="#94a3b8" /></button>
            </div>
          ) : (
            <button onClick={startEditingNickname} style={styles.nicknameBtn} title="닉네임 변경">
              <span>{session.user.name}</span>
              <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: "bold", backgroundColor: "rgba(56,189,248,0.15)", padding: "2px 8px", borderRadius: "12px", marginLeft: "4px" }}>
                승률 {winRate}% ({wins}승 {losses}패)
              </span>
              <Pencil size={12} color="#6366f1" />
            </button>
          )}

          <div style={styles.avatarWrapper}>
            <img src={displayAvatar} alt="Avatar" style={styles.navAvatar} />
            <button onClick={() => setIsEditingAvatar(true)} style={styles.drawBadge} title="프로필 직접 그리기">
              <Palette size={12} color="#ffffff" />
            </button>
          </div>

          <button onClick={() => authSignOut({ callbackUrl: "/auth/signin" })} style={styles.logoutBtn}>
            <LogOut size={16} /><span>로그아웃</span>
          </button>
        </div>
      </nav>

      <main style={styles.main}>
        <div style={styles.glassLobby}>
          <div style={styles.lobbyHeader}>
            <div style={styles.onlineBadge}><Users size={16} /><span>현재 접속자: {onlineCount}명</span></div>
            <h2 style={styles.lobbyTitle}>배틀 센터</h2>
          </div>

          <div style={styles.lobbyBody}>
            {matchState === "IDLE" && (
              <div style={styles.idleState}>
                <div style={styles.profileBox}>
                  <img src={displayAvatar} alt="Profile" style={styles.largeAvatar} />
                  <button onClick={() => setIsEditingAvatar(true)} style={styles.largeDrawBtn}>
                    <Palette size={16} /><span>프로필 직접 그리기</span>
                  </button>
                </div>
                {nicknameError && <div style={styles.inlineError}>{nicknameError}</div>}
                <h3 style={styles.readyText}>전투 준비가 되셨나요?</h3>
                {bestTankInfo && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.4)", color: "#facc15", padding: "6px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: "bold", marginBottom: "12px" }}>
                    <span>🏆 최고 승률 탱크: {TANKS[bestTankInfo.tankId].name} ({bestTankInfo.rate}% - {bestTankInfo.wins}승 {bestTankInfo.losses}패)</span>
                  </div>
                )}
                <p style={styles.readySubtext}>플레이 버튼을 눌러 모드를 선택하고 상대를 찾아보세요!</p>

                <div style={styles.actionRow}>
                  <button onClick={() => setIsGarageOpen(true)} style={styles.lobbyGarageBtn}>🔧 정비소</button>
                  <button onClick={() => setIsModeModalOpen(true)} style={styles.playBtn}>
                    <Swords size={20} />
                    <span>매칭</span>
                  </button>
                </div>
              </div>
            )}

            {matchState === "SEARCHING" && (
              <div style={styles.searchingState}>
                <div style={styles.radarOuter}><div style={styles.radarInner}></div></div>
                <h3 style={styles.searchText}>{selectedMode} 상대를 찾는 중...</h3>
                <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "4px" }}>
                  {selectedMode === "1v1" ? "1명" : selectedMode === "2v2" ? "3명" : "5명"} 더 필요
                </p>
                <p style={styles.searchTime}>대기 시간: {searchDuration}초</p>
                <button onClick={handleCancelMatchmaking} style={styles.cancelBtn}>매칭 취소</button>
              </div>
            )}

            {matchState === "MATCHED" && matchFoundData && (
              <div style={styles.matchedState}>
                <div style={styles.matchedBadge}>
                  <Sparkles size={18} color="#eab308" />
                  <span>{matchFoundData.mode} 매칭 성공!</span>
                </div>

                {/* Team display */}
                <div style={styles.teamRow}>
                  {/* Red Team */}
                  <div style={styles.teamCol}>
                    <div style={{ ...styles.teamLabel, color: "#f87171", borderColor: "#f87171" }}>🔴 레드팀</div>
                    {matchFoundData.team === "red" && (
                      <div style={styles.teamMemberCard}>
                        <img src={displayAvatar} alt="me" style={{ ...styles.vsAvatar, borderColor: "#f87171" }} />
                        <span style={styles.teamMemberName}>{session.user.name} <span style={{ color: "#fbbf24", fontSize: "10px" }}>◀나</span></span>
                      </div>
                    )}
                    {matchFoundData.team === "red"
                      ? matchFoundData.teammates.map((p, i) => (
                          <div key={i} style={styles.teamMemberCard}>
                            <img src={p.image} alt={p.name} style={{ ...styles.vsAvatar, borderColor: "#f87171" }} />
                            <span style={styles.teamMemberName}>{p.name}</span>
                          </div>
                        ))
                      : matchFoundData.opponents.map((p, i) => (
                          <div key={i} style={styles.teamMemberCard}>
                            <img src={p.image} alt={p.name} style={{ ...styles.vsAvatar, borderColor: "#f87171" }} />
                            <span style={styles.teamMemberName}>{p.name}</span>
                          </div>
                        ))}
                  </div>

                  <div style={styles.vsCircle}>VS</div>

                  {/* Blue Team */}
                  <div style={styles.teamCol}>
                    <div style={{ ...styles.teamLabel, color: "#60a5fa", borderColor: "#60a5fa" }}>🔵 블루팀</div>
                    {matchFoundData.team === "blue" && (
                      <div style={styles.teamMemberCard}>
                        <img src={displayAvatar} alt="me" style={{ ...styles.vsAvatar, borderColor: "#60a5fa" }} />
                        <span style={styles.teamMemberName}>{session.user.name} <span style={{ color: "#fbbf24", fontSize: "10px" }}>◀나</span></span>
                      </div>
                    )}
                    {matchFoundData.team === "blue"
                      ? matchFoundData.teammates.map((p, i) => (
                          <div key={i} style={styles.teamMemberCard}>
                            <img src={p.image} alt={p.name} style={{ ...styles.vsAvatar, borderColor: "#60a5fa" }} />
                            <span style={styles.teamMemberName}>{p.name}</span>
                          </div>
                        ))
                      : matchFoundData.opponents.map((p, i) => (
                          <div key={i} style={styles.teamMemberCard}>
                            <img src={p.image} alt={p.name} style={{ ...styles.vsAvatar, borderColor: "#60a5fa" }} />
                            <span style={styles.teamMemberName}>{p.name}</span>
                          </div>
                        ))}
                  </div>
                </div>

                <p style={styles.matchedSubtext}>잠시 후 대전 맵으로 진입합니다...</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {isEditingAvatar && (
        <AvatarEditor initialImage={customAvatar} onSave={saveCustomAvatar} onClose={() => setIsEditingAvatar(false)} />
      )}

      {isGarageOpen && (
        <GarageModal currentTankId={selectedTankId} onSelectTank={selectTank} tankStats={tankStats} onClose={() => setIsGarageOpen(false)} />
      )}

      {/* 모드 선택 모달 */}
      {isModeModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsModeModalOpen(false)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>⚔️ 대전 모드 선택</h3>
            <p style={styles.modalSubtext}>팀전에서는 아군 공격 가능, 팀 전원 사망 시 패배</p>
            <div style={styles.modalModeGrid}>
              {(["1v1", "2v2", "3v3"] as GameMode[]).map((mode) => {
                const m = MODE_LABELS[mode];
                const active = selectedMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setSelectedMode(mode)}
                    style={{
                      ...styles.modalModeBtn,
                      borderColor: active ? m.color : "rgba(255,255,255,0.12)",
                      background: active ? `rgba(${hexToRgb(m.color)},0.2)` : "rgba(255,255,255,0.04)",
                      boxShadow: active ? `0 0 20px ${m.color}55` : "none",
                    }}
                  >
                    <span style={{ fontSize: "28px" }}>{m.icon}</span>
                    <span style={{ fontSize: "17px", fontWeight: "bold", color: active ? m.color : "#e2e8f0" }}>{m.label}</span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>{m.desc}</span>
                    {active && (
                      <span style={{ fontSize: "10px", color: m.color, background: `${m.color}22`, padding: "2px 10px", borderRadius: "10px", fontWeight: "bold" }}>선택됨 ✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button onClick={() => setIsModeModalOpen(false)} style={styles.modalCancelBtn}>취소</button>
              <button
                onClick={() => { setIsModeModalOpen(false); handleStartMatchmaking(selectedMode); }}
                style={{ ...styles.modalStartBtn, background: `linear-gradient(135deg, ${MODE_LABELS[selectedMode].color}, #d946ef)` }}
              >
                {MODE_LABELS[selectedMode].icon} {MODE_LABELS[selectedMode].label} 매칭 시작
              </button>
            </div>
          </div>
        </div>
      )}

      <PatchNotesBar />

      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes modalIn { from { opacity:0; transform:scale(0.92) translateY(16px); } to { opacity:1; transform:scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}


function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", background: "linear-gradient(135deg, #090d16 0%, #15102a 100%)", color: "#f8fafc", display: "flex", flexDirection: "column" },
  gameWrapper: { minHeight: "100vh", background: "#090d16", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: "rgba(15,23,42,0.4)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  navBrand: { fontSize: "18px", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "8px" },
  navUser: { display: "flex", alignItems: "center", gap: "12px" },
  nicknameEditRow: { display: "flex", alignItems: "center", gap: "6px" },
  nicknameInput: { padding: "5px 10px", borderRadius: "6px", border: "1px solid #6366f1", background: "rgba(15,23,42,0.8)", color: "#fff", fontSize: "13px", outline: "none", width: "130px" },
  iconBtn: { background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" },
  nicknameBtn: { display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: "#e2e8f0", fontSize: "14px", fontWeight: "500", cursor: "pointer", padding: "4px 8px", borderRadius: "6px" },
  avatarWrapper: { position: "relative", width: "36px", height: "36px" },
  navAvatar: { width: "36px", height: "36px", borderRadius: "50%", border: "2px solid #6366f1", backgroundColor: "#ffffff", objectFit: "cover" },
  drawBadge: { position: "absolute", bottom: "-2px", right: "-2px", backgroundColor: "#6366f1", border: "1px solid #090d16", borderRadius: "50%", padding: "4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  logoutBtn: { display: "flex", alignItems: "center", gap: "6px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", padding: "6px 12px", borderRadius: "6px", color: "#ef4444", fontSize: "12px", fontWeight: "bold", cursor: "pointer" },
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" },
  glassLobby: { width: "100%", maxWidth: "640px", background: "rgba(30,41,59,0.5)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)", overflow: "hidden" },
  lobbyHeader: { padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" },
  onlineBadge: { display: "flex", alignItems: "center", gap: "6px", background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" },
  lobbyTitle: { fontSize: "20px", fontWeight: "bold", background: "linear-gradient(to right, #6366f1, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  lobbyBody: { padding: "28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "340px" },
  idleState: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%" },
  profileBox: { marginBottom: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" },
  largeAvatar: { width: "80px", height: "80px", borderRadius: "50%", border: "3px solid #6366f1", backgroundColor: "#ffffff", objectFit: "cover", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  largeDrawBtn: { display: "flex", alignItems: "center", gap: "6px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", padding: "6px 12px", borderRadius: "20px", color: "#818cf8", fontSize: "12px", fontWeight: "bold", cursor: "pointer" },
  inlineError: { color: "#f87171", fontSize: "13px", marginBottom: "8px" },
  readyText: { fontSize: "20px", fontWeight: "bold", marginBottom: "6px" },
  readySubtext: { color: "#94a3b8", fontSize: "13px", maxWidth: "400px", marginBottom: "20px", lineHeight: "1.5" },
  modeGrid: { display: "flex", gap: "10px", marginBottom: "14px", width: "100%", justifyContent: "center" },
  modeBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "12px 16px", borderRadius: "12px", border: "1.5px solid", cursor: "pointer", transition: "all 0.2s", minWidth: "90px", background: "transparent", color: "#e2e8f0" },
  ffNotice: { display: "flex", alignItems: "center", gap: "6px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b", padding: "6px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", marginBottom: "18px" },
  actionRow: { display: "flex", gap: "12px", marginTop: "0px" },
  lobbyGarageBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "rgba(99,102,241,0.15)", border: "1.5px solid rgba(99,102,241,0.4)", padding: "14px 24px", borderRadius: "12px", color: "#818cf8", fontSize: "15px", fontWeight: "bold", cursor: "pointer" },
  playBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", background: "linear-gradient(135deg, #4f46e5 0%, #d946ef 100%)", color: "#fff", border: "none", padding: "14px 28px", borderRadius: "12px", fontSize: "15px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 14px 0 rgba(99,102,241,0.5)" },
  searchingState: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  radarOuter: { width: "80px", height: "80px", borderRadius: "50%", border: "2px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: "20px" },
  radarInner: { width: "40px", height: "40px", borderRadius: "50%", background: "rgba(99,102,241,0.2)", border: "2px solid #6366f1", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite" },
  searchText: { fontSize: "18px", fontWeight: "600", marginBottom: "4px" },
  searchTime: { color: "#94a3b8", fontSize: "14px", marginBottom: "24px" },
  cancelBtn: { background: "transparent", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)", padding: "10px 24px", borderRadius: "8px", fontSize: "14px", cursor: "pointer" },
  matchedState: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  matchedBadge: { display: "flex", alignItems: "center", gap: "8px", background: "rgba(234,179,8,0.15)", color: "#f59e0b", padding: "8px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: "600", marginBottom: "20px", border: "1px solid rgba(234,179,8,0.3)" },
  teamRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-around", width: "100%", marginBottom: "20px", gap: "8px" },
  teamCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flex: 1 },
  teamLabel: { fontSize: "12px", fontWeight: "bold", border: "1px solid", padding: "3px 12px", borderRadius: "12px", marginBottom: "4px" },
  teamMemberCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" },
  vsAvatar: { width: "48px", height: "48px", borderRadius: "50%", border: "2px solid", marginBottom: "4px", background: "#ffffff", objectFit: "cover" },
  teamMemberName: { fontSize: "12px", fontWeight: "600", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  vsCircle: { width: "42px", height: "42px", borderRadius: "50%", background: "linear-gradient(135deg,#ef4444 0%,#b91c1c 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "900", boxShadow: "0 0 15px rgba(239,68,68,0.5)", flexShrink: 0, alignSelf: "center" },
  matchedSubtext: { color: "#94a3b8", fontSize: "13px" },
  loadingContainer: { minHeight: "100vh", background: "#090d16", color: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", fontSize: "16px" },
  spinner: { width: "40px", height: "40px", border: "4px solid rgba(99,102,241,0.2)", borderTop: "4px solid #6366f1", borderRadius: "50%", animation: "spin 1s linear infinite" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalBox: { background: "rgba(15,23,42,0.97)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "20px", padding: "32px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", maxWidth: "480px", width: "90%", boxShadow: "0 30px 60px rgba(0,0,0,0.6)", animation: "modalIn 0.22s ease" },
  modalTitle: { fontSize: "20px", fontWeight: "bold", margin: 0 },
  modalSubtext: { color: "#f59e0b", fontSize: "12px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", padding: "5px 14px", borderRadius: "20px", margin: 0 },
  modalModeGrid: { display: "flex", gap: "12px", width: "100%", justifyContent: "center" },
  modalModeBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "16px 18px", borderRadius: "14px", border: "1.5px solid", cursor: "pointer", transition: "all 0.18s", flex: 1, background: "transparent", color: "#e2e8f0" },
  modalCancelBtn: { background: "transparent", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.12)", padding: "12px 24px", borderRadius: "10px", fontSize: "14px", cursor: "pointer", fontWeight: "600" },
  modalStartBtn: { flex: 1, color: "#fff", border: "none", padding: "12px 24px", borderRadius: "10px", fontSize: "15px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.4)" },
};
