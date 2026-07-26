"use client";

import { useSession as useAuthSession, signOut as authSignOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { LogOut, Play, Sparkles, Users, Palette, Check, X, Pencil, ShieldAlert } from "lucide-react";
import { AvatarEditor } from "@/components/AvatarEditor";
import { GarageModal } from "@/components/GarageModal";
import { GameCanvas } from "@/components/GameCanvas";
import { TankId, DEFAULT_TANK_ID } from "@/lib/tanks";

type MatchmakingState = "IDLE" | "SEARCHING" | "MATCHED";

interface PlayerProfile {
  id: string;
  name: string;
  image: string;
  tankId?: TankId;
}

interface GameStartData {
  players: Array<{ socketId: string; x: number; hp: number }>;
  activeSocketId: string;
  seed: number;
}

export default function LobbyPage() {
  const { data: session, status, update: updateSession } = useAuthSession();
  const router = useRouter();

  // Win record states
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);

  // Matchmaking & UI states
  const [matchState, setMatchState] = useState<MatchmakingState>("IDLE");
  const [searchDuration, setSearchDuration] = useState(0);
  const [opponent, setOpponent] = useState<PlayerProfile | null>(null);
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
  // Refs so socket callbacks always have fresh values
  const avatarRef = useRef<string>("");
  const tankIdRef = useRef<TankId>(DEFAULT_TANK_ID);
  const sessionRef = useRef(session);

  const getBlankWhiteAvatar = () => {
    if (typeof window === "undefined") return "";
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, 128, 128); }
    return canvas.toDataURL("image/png");
  };

  // Keep refs in sync
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
      if (savedTank === "chrome" || savedTank === "shotgun" || savedTank === "forest") setSelectedTankId(savedTank);
      
      const w = parseInt(localStorage.getItem(`user_wins_${userId}`) || "0", 10);
      const l = parseInt(localStorage.getItem(`user_losses_${userId}`) || "0", 10);
      setWins(w);
      setLosses(l);
    }
  }, [session]);

  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

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

  // Create socket once and register all handlers
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || `http://${window.location.hostname}:3001`;
    const socket = io(socketUrl, { autoConnect: true, transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("online-stats", (data: { onlineCount: number }) => setOnlineCount(data.onlineCount));

    socket.on("match-found", (data: { roomName: string; opponent: PlayerProfile }) => {
      console.log("[lobby] match-found", data.roomName);
      setOpponent(data.opponent);
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
      setOpponent(null);
      setRoomName(null);
    });

    return () => { socket.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When matched, emit join-game-room (roomName is guaranteed to be set here)
  useEffect(() => {
    if (matchState !== "MATCHED" || !roomName || !socketRef.current) return;

    const currentSession = sessionRef.current;
    const activeAvatar = avatarRef.current || getBlankWhiteAvatar();
    const playerProfile: PlayerProfile = {
      id: (currentSession?.user as any)?.id || currentSession?.user?.email || "unknown",
      name: currentSession?.user?.name || "탱크 유저",
      image: activeAvatar,
      tankId: tankIdRef.current,
    };

    console.log("[lobby] emitting join-game-room", roomName, playerProfile.name);
    socketRef.current.emit("join-game-room", { roomName, profile: playerProfile });
  }, [matchState, roomName]);

  const connectSocket = () => socketRef.current!;

  const handleStartMatchmaking = () => {
    if (!session?.user || !socketRef.current) return;
    const playerProfile: PlayerProfile = {
      id: (session.user as any).id || session.user.email || "unknown",
      name: session.user.name || "탱크 유저",
      image: customAvatar || getBlankWhiteAvatar(),
      tankId: selectedTankId,
    };
    setMatchState("SEARCHING");
    socketRef.current.emit("join-queue", playerProfile);
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

  const startEditingNickname = () => {
    setNicknameInput(session?.user?.name || "");
    setNicknameError("");
    setIsEditingNickname(true);
  };

  const cancelEditingNickname = () => {
    setIsEditingNickname(false);
    setNicknameError("");
  };

  const saveNickname = async () => {
    if (!nicknameInput.trim()) { setNicknameError("닉네임을 입력해 주세요."); return; }
    setNicknameLoading(true);
    setNicknameError("");

    const res = await fetch("/api/user/nickname", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nicknameInput.trim() }),
    });

    const data = await res.json();
    setNicknameLoading(false);

    if (!res.ok) { setNicknameError(data.error || "오류가 발생했습니다."); return; }

    // 세션 업데이트
    await updateSession({ name: data.nickname });
    setIsEditingNickname(false);
  };

  const handleGameFinished = (reason: string) => {
    setIsPlaying(false);
    setGameStartInfo(null);
    setMatchState("IDLE");
    setOpponent(null);
    setRoomName(null);

    const userId = session?.user ? ((session.user as any).id || session.user.email || "default") : null;

    if (reason === "defeat") {
      if (userId) {
        const newLosses = losses + 1;
        setLosses(newLosses);
        localStorage.setItem(`user_losses_${userId}`, newLosses.toString());
      }
      alert("패배했습니다! 다음엔 꼭 이겨보세요. 💪");
    } else if (reason === "victory" || reason === "opponent_left") {
      if (userId) {
        const newWins = wins + 1;
        setWins(newWins);
        localStorage.setItem(`user_wins_${userId}`, newWins.toString());
      }
      if (reason === "opponent_left") {
        alert("상대방이 게임에서 탈주하여 승리했습니다! 🏆");
      } else {
        alert("승리했습니다! 🏆 훌륭한 포격이었어요!");
      }
    } else {
      alert("게임이 종료되었습니다!");
    }
  };

  useEffect(() => {
    return () => { /* socket cleaned up in the creation effect */ };
  }, []);

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

  // If in active gameplay screen, render the Canvas HUD instead of Lobby
  if (isPlaying && gameStartInfo && socketRef.current && roomName && opponent) {
    return (
      <div style={styles.gameWrapper}>
        <GameCanvas
          socket={socketRef.current}
          roomName={roomName}
          myProfile={{
            id: (session.user as any).id || session.user.email || "me",
            name: session.user.name || "나",
            image: displayAvatar,
            tankId: selectedTankId,
          }}
          opponentProfile={opponent}
          initialSeed={gameStartInfo.seed}
          playersInfo={gameStartInfo.players}
          activeSocketId={gameStartInfo.activeSocketId}
          onGameEnded={handleGameFinished}
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.navBrand}>💣 <span style={{ fontWeight: "bold" }}>탱크</span></div>
        
        <div style={styles.navUser}>

          {/* 닉네임 편집 */}
          {isEditingNickname ? (
            <div style={styles.nicknameEditRow}>
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                style={styles.nicknameInput}
                maxLength={20}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") cancelEditingNickname(); }}
              />
              <button onClick={saveNickname} disabled={nicknameLoading} style={styles.iconBtn} title="저장">
                <Check size={15} color="#10b981" />
              </button>
              <button onClick={cancelEditingNickname} style={styles.iconBtn} title="취소">
                <X size={15} color="#94a3b8" />
              </button>
            </div>
          ) : (
            <button onClick={startEditingNickname} style={styles.nicknameBtn} title="닉네임 변경">
              <span>{session.user.name}</span>
              <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: "bold", backgroundColor: "rgba(56, 189, 248, 0.15)", padding: "2px 8px", borderRadius: "12px", marginLeft: "4px" }}>
                승률 {winRate}% ({wins}승 {losses}패)
              </span>
              <Pencil size={12} color="#6366f1" />
            </button>
          )}

          <div style={styles.avatarWrapper}>
            <img src={displayAvatar} alt="Avatar" style={styles.navAvatar} />
            <button onClick={() => setIsEditingAvatar(true)} style={styles.drawBadge} title="프로필 이미지 직접 그리기">
              <Palette size={12} color="#ffffff" />
            </button>
          </div>

          <button onClick={() => authSignOut({ callbackUrl: "/auth/signin" })} style={styles.logoutBtn}>
            <LogOut size={16} />
            <span>로그아웃</span>
          </button>
        </div>
      </nav>

      <main style={styles.main}>
        <div style={styles.glassLobby}>
          <div style={styles.lobbyHeader}>
            <div style={styles.onlineBadge}>
              <Users size={16} />
              <span>현재 접속자: {onlineCount}명</span>
            </div>
            <h2 style={styles.lobbyTitle}>배틀 센터</h2>
          </div>

          <div style={styles.lobbyBody}>
            {matchState === "IDLE" && (
              <div style={styles.idleState}>
                <div style={styles.profileBox}>
                  <img src={displayAvatar} alt="Profile" style={styles.largeAvatar} />
                  <button onClick={() => setIsEditingAvatar(true)} style={styles.largeDrawBtn}>
                    <Palette size={16} />
                    <span>프로필 직접 그리기</span>
                  </button>
                </div>
                {nicknameError && <div style={styles.inlineError}>{nicknameError}</div>}
                <h3 style={styles.readyText}>전투 준비가 되셨나요?</h3>
                <p style={styles.readySubtext}>플레이 버튼을 눌러 상대를 찾고 포격전을 시작하세요!</p>
                <div style={styles.actionRow}>
                  <button onClick={() => setIsGarageOpen(true)} style={styles.lobbyGarageBtn}>
                    🔧 정비소
                  </button>
                  <button onClick={handleStartMatchmaking} style={styles.playBtn}>
                    <Play size={20} fill="#fff" />
                    <span>플레이 (랜덤 매칭)</span>
                  </button>
                </div>
              </div>
            )}

            {matchState === "SEARCHING" && (
              <div style={styles.searchingState}>
                <div style={styles.radarOuter}><div style={styles.radarInner}></div></div>
                <h3 style={styles.searchText}>상대를 찾는 중...</h3>
                <p style={styles.searchTime}>대기 시간: {searchDuration}초</p>
                <button onClick={handleCancelMatchmaking} style={styles.cancelBtn}>매칭 취소</button>
              </div>
            )}

            {matchState === "MATCHED" && (
              <div style={styles.matchedState}>
                <div style={styles.versusContainer}>
                  <div style={styles.versusPlayer}>
                    <img src={displayAvatar} alt="You" style={styles.vsAvatar} />
                    <div style={styles.vsName}>{session.user.name}</div>
                    <div style={styles.vsLabel}>나</div>
                  </div>
                  <div style={styles.vsCircle}>VS</div>
                  <div style={styles.versusPlayer}>
                    <img src={opponent?.image} alt="Opponent" style={styles.vsAvatar} />
                    <div style={styles.vsName}>{opponent?.name}</div>
                    <div style={styles.vsLabel}>상대방</div>
                  </div>
                </div>
                <div style={styles.matchedSuccess}>
                  <Sparkles size={20} color="#eab308" />
                  <span>매칭 성공! 게임 준비 중...</span>
                </div>
                <p style={styles.matchedSubtext}>잠시 후 대전 맵으로 진입합니다...</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Drawing Avatar Editor */}
      {isEditingAvatar && (
        <AvatarEditor initialImage={customAvatar} onSave={saveCustomAvatar} onClose={() => setIsEditingAvatar(false)} />
      )}

      {/* Garage Workshop Modal */}
      {isGarageOpen && (
        <GarageModal
          currentTankId={selectedTankId}
          onSelectTank={selectTank}
          onClose={() => setIsGarageOpen(false)}
        />
      )}

      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", background: "linear-gradient(135deg, #090d16 0%, #15102a 100%)", color: "#f8fafc", display: "flex", flexDirection: "column" },
  gameWrapper: { minHeight: "100vh", background: "#090d16", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" },
  navBrand: { fontSize: "18px", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "8px" },
  navUser: { display: "flex", alignItems: "center", gap: "12px" },
  nicknameEditRow: { display: "flex", alignItems: "center", gap: "6px" },
  nicknameInput: { padding: "5px 10px", borderRadius: "6px", border: "1px solid #6366f1", background: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px", outline: "none", width: "130px" },
  iconBtn: { background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" },
  nicknameBtn: { display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: "#e2e8f0", fontSize: "14px", fontWeight: "500", cursor: "pointer", padding: "4px 8px", borderRadius: "6px" },
  avatarWrapper: { position: "relative", width: "36px", height: "36px" },
  navAvatar: { width: "36px", height: "36px", borderRadius: "50%", border: "2px solid #6366f1", backgroundColor: "#ffffff", objectFit: "cover" },
  drawBadge: { position: "absolute", bottom: "-2px", right: "-2px", backgroundColor: "#6366f1", border: "1px solid #090d16", borderRadius: "50%", padding: "4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  logoutBtn: { display: "flex", alignItems: "center", gap: "6px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "6px 12px", borderRadius: "6px", color: "#ef4444", fontSize: "12px", fontWeight: "bold", cursor: "pointer" },
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" },
  glassLobby: { width: "100%", maxWidth: "600px", background: "rgba(30, 41, 59, 0.5)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "16px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)", overflow: "hidden" },
  lobbyHeader: { padding: "24px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" },
  onlineBadge: { display: "flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" },
  lobbyTitle: { fontSize: "20px", fontWeight: "bold", background: "linear-gradient(to right, #6366f1, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  lobbyBody: { padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "320px" },
  idleState: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  profileBox: { marginBottom: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" },
  largeAvatar: { width: "96px", height: "96px", borderRadius: "50%", border: "3px solid #6366f1", backgroundColor: "#ffffff", objectFit: "cover", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" },
  largeDrawBtn: { display: "flex", alignItems: "center", gap: "6px", background: "rgba(99, 102, 241, 0.15)", border: "1px solid rgba(99, 102, 241, 0.3)", padding: "6px 12px", borderRadius: "20px", color: "#818cf8", fontSize: "12px", fontWeight: "bold", cursor: "pointer" },
  inlineError: { color: "#f87171", fontSize: "13px", marginBottom: "8px" },
  readyText: { fontSize: "22px", fontWeight: "bold", marginBottom: "8px" },
  readySubtext: { color: "#94a3b8", fontSize: "14px", maxWidth: "340px", marginBottom: "24px", lineHeight: "1.5" },
  playBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", background: "linear-gradient(135deg, #4f46e5 0%, #d946ef 100%)", color: "#fff", border: "none", padding: "16px 40px", borderRadius: "12px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 14px 0 rgba(99, 102, 241, 0.5)" },
  searchingState: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  radarOuter: { width: "80px", height: "80px", borderRadius: "50%", border: "2px solid rgba(99, 102, 241, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: "20px" },
  radarInner: { width: "40px", height: "40px", borderRadius: "50%", background: "rgba(99, 102, 241, 0.2)", border: "2px solid #6366f1", animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite" },
  searchText: { fontSize: "18px", fontWeight: "600", marginBottom: "4px" },
  searchTime: { color: "#94a3b8", fontSize: "14px", marginBottom: "24px" },
  cancelBtn: { background: "transparent", color: "#94a3b8", border: "1px solid rgba(255, 255, 255, 0.1)", padding: "10px 24px", borderRadius: "8px", fontSize: "14px", cursor: "pointer" },
  matchedState: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  versusContainer: { display: "flex", alignItems: "center", justifyContent: "space-around", width: "100%", marginBottom: "30px" },
  versusPlayer: { display: "flex", flexDirection: "column", alignItems: "center", width: "120px" },
  vsAvatar: { width: "64px", height: "64px", borderRadius: "50%", border: "3px solid #6366f1", marginBottom: "10px", background: "#ffffff", objectFit: "cover" },
  vsName: { fontSize: "14px", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", marginBottom: "4px" },
  vsLabel: { fontSize: "10px", background: "#4f46e5", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontWeight: "600" },
  vsCircle: { width: "48px", height: "48px", borderRadius: "50%", background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", boxShadow: "0 0 15px rgba(239, 68, 68, 0.5)" },
  matchedSuccess: { display: "flex", alignItems: "center", gap: "8px", background: "rgba(234, 179, 8, 0.15)", color: "#f59e0b", padding: "10px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: "600", marginBottom: "10px", border: "1px solid rgba(234, 179, 8, 0.3)" },
  matchedSubtext: { color: "#94a3b8", fontSize: "13px" },
  loadingContainer: { minHeight: "100vh", background: "#090d16", color: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", fontSize: "16px" },
  spinner: { width: "40px", height: "40px", border: "4px solid rgba(99, 102, 241, 0.2)", borderTop: "4px solid #6366f1", borderRadius: "50%", animation: "spin 1s linear infinite" },
  actionRow: {
    display: "flex",
    gap: "12px",
    marginTop: "8px",
  },
  lobbyGarageBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    background: "rgba(99, 102, 241, 0.15)",
    border: "1.5px solid rgba(99, 102, 241, 0.4)",
    padding: "16px 32px",
    borderRadius: "12px",
    color: "#818cf8",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "background 0.2s, transform 0.2s",
  },
};
