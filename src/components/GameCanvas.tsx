"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { Shield, Zap } from "lucide-react";

interface GameCanvasProps {
  socket: Socket;
  roomName: string;
  myProfile: { id: string; name: string; image: string };
  opponentProfile: { id: string; name: string; image: string };
  initialSeed: number;
  playersInfo: Array<{ socketId: string; x: number; hp: number }>;
  activeSocketId: string;
  onGameEnded: (reason: string) => void;
}

type WeaponType = "heavy" | "sniper" | "cluster";

interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: WeaponType;
  splitTimer?: number;
  isSplit?: boolean;
  owner: "me" | "opp";
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: string; radius: number;
  life: number; maxLife: number;
}

const CANVAS_W = 800;
const CANVAS_H = 500;
const GRAVITY = 0.25;
const WEAPONS: WeaponType[] = ["heavy", "sniper", "cluster"];
const WEAPON_LABELS: Record<WeaponType, string> = {
  heavy: "해비탄 💣",
  sniper: "저격탄 ⚡",
  cluster: "집속탄 ✴️",
};

export function GameCanvas({
  socket,
  roomName,
  myProfile,
  opponentProfile,
  initialSeed,
  playersInfo,
  activeSocketId,
  onGameEnded,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // All mutable game state in a single ref to avoid stale closures
  const G = useRef({
    terrain: [] as number[],
    myX: playersInfo.find(p => p.socketId === socket.id)?.x ?? 150,
    myY: 0,
    myHp: 100,
    myFuel: 100,
    myDir: 1,
    oppX: playersInfo.find(p => p.socketId !== socket.id)?.x ?? 650,
    oppY: 0,
    oppHp: 100,
    oppDir: -1,
    projectiles: [] as Projectile[],
    particles: [] as Particle[],
    isMyTurn: activeSocketId === socket.id,
    activeSocketId: activeSocketId,
    angle: 45,
    power: 50,
    weapon: "heavy" as WeaponType,
    keys: {} as Record<string, boolean>,
    turnEndEmitted: false,
    gameOver: false,
    turnTimer: 20,
    firedThisTurn: false,
  });

  // React UI state (only for display)
  const [uiMyHp, setUiMyHp] = useState(100);
  const [uiOppHp, setUiOppHp] = useState(100);
  const [uiMyFuel, setUiMyFuel] = useState(100);
  const [uiWeapon, setUiWeapon] = useState<WeaponType>("heavy");
  const [uiIsMyTurn, setUiIsMyTurn] = useState(activeSocketId === socket.id);
  const [uiTimer, setUiTimer] = useState(20);
  const [uiAngle, setUiAngle] = useState(45);
  const [uiPower, setUiPower] = useState(50);

  // ── Terrain generation ──────────────────────────────────────────────
  useEffect(() => {
    const g = G.current;
    const terrain: number[] = [];
    for (let x = 0; x < CANVAS_W; x++) {
      const h = 330
        + Math.sin(x * 0.008 + initialSeed * 10) * 60
        + Math.sin(x * 0.02 + initialSeed) * 20
        + Math.cos(x * 0.003 - initialSeed) * 40;
      terrain.push(Math.min(CANVAS_H - 20, Math.max(150, h)));
    }
    g.terrain = terrain;
    g.myY = terrain[Math.round(g.myX)];
    g.oppY = terrain[Math.round(g.oppX)];
  }, [initialSeed]);

  // ── Keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => { G.current.keys[e.code] = true; };
    const up = (e: KeyboardEvent) => { G.current.keys[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ── Turn timer ───────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const g = G.current;
      if (g.gameOver || g.projectiles.length > 0) return;
      g.turnTimer = Math.max(0, g.turnTimer - 1);
      setUiTimer(g.turnTimer);
      if (g.turnTimer === 0 && g.isMyTurn && !g.turnEndEmitted) {
        g.turnEndEmitted = true;
        socket.emit("game-turn-end", { roomName });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [socket, roomName]);

  // ── Socket events ────────────────────────────────────────────────────
  useEffect(() => {
    const onAction = (action: any) => {
      const g = G.current;
      if (action.type === "move") {
        g.oppX = action.x;
        g.oppDir = action.direction;
        if (g.terrain.length) g.oppY = g.terrain[Math.round(g.oppX)];
      } else if (action.type === "fire") {
        spawnProjectile(action.x, action.y, action.angle, action.power, action.weapon, "opp");
      }
    };

    const onNewTurn = ({ activeSocketId: asid }: { activeSocketId: string }) => {
      const g = G.current;
      g.activeSocketId = asid;
      g.isMyTurn = asid === socket.id;
      g.turnEndEmitted = false;
      g.firedThisTurn = false;
      g.turnTimer = 20;
      setUiIsMyTurn(g.isMyTurn);
      setUiTimer(20);
      if (g.isMyTurn) { g.myFuel = 100; setUiMyFuel(100); }
    };

    const onEnded = ({ reason }: { reason: string }) => {
      G.current.gameOver = true;
      onGameEnded(reason);
    };

    socket.on("game-action", onAction);
    socket.on("game-new-turn", onNewTurn);
    socket.on("game-ended", onEnded);
    return () => {
      socket.off("game-action", onAction);
      socket.off("game-new-turn", onNewTurn);
      socket.off("game-ended", onEnded);
    };
  }, [socket, onGameEnded]);

  // ── Helpers ──────────────────────────────────────────────────────────
  const destructTerrain = (cx: number, cy: number, radius: number) => {
    const t = G.current.terrain;
    const start = Math.max(0, Math.floor(cx - radius));
    const end = Math.min(CANVAS_W - 1, Math.ceil(cx + radius));
    for (let x = start; x <= end; x++) {
      const dx = x - cx;
      if (Math.abs(dx) < radius) {
        const dy = Math.sqrt(radius * radius - dx * dx);
        const targetY = cy + dy;
        if (t[x] < targetY) t[x] = Math.min(CANVAS_H, Math.max(t[x], targetY));
      }
    }
  };

  const spawnParticles = (ex: number, ey: number, count = 25, size = 4) => {
    const colors = ["#ff5722", "#ff9800", "#ffeb3b", "#9e9e9e", "#fff"];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = Math.random() * 4 + 1;
      G.current.particles.push({
        x: ex, y: ey,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        radius: Math.random() * size + 1,
        life: 0, maxLife: Math.random() * 30 + 15,
      });
    }
  };

  const spawnProjectile = (
    sx: number, sy: number,
    ang: number, pwr: number,
    wep: WeaponType, owner: "me" | "opp"
  ) => {
    const angRad = (ang * Math.PI) / 180;
    const spd = pwr * 0.15;
    const proj: Projectile = {
      id: Math.random().toString(36).slice(2),
      x: sx, y: sy - 12,
      vx: Math.cos(angRad) * spd,
      vy: -Math.sin(angRad) * spd,
      type: wep, owner,
    };
    if (wep === "cluster") { proj.splitTimer = 45; proj.isSplit = false; }
    G.current.projectiles.push(proj);
  };

  const handleExplosion = (p: Projectile) => {
    const g = G.current;
    if (p.x < 0 || p.x >= CANVAS_W) return;

    let radius = 30, maxDmg = 20;
    if (p.type === "heavy") { radius = 42; maxDmg = 20; destructTerrain(p.x, p.y, 38); spawnParticles(p.x, p.y, 35, 6); }
    else if (p.type === "sniper") { radius = 18; maxDmg = 20; destructTerrain(p.x, p.y, 12); spawnParticles(p.x, p.y, 15, 3); }
    else { radius = 22; maxDmg = p.isSplit ? 5 : 8; destructTerrain(p.x, p.y, 16); spawnParticles(p.x, p.y, 12, 3); }

    const applyDmg = (tx: number, ty: number, isMe: boolean) => {
      const dist = Math.hypot(tx - p.x, ty - p.y);
      if (dist < radius) {
        const dmg = Math.round(maxDmg * (1 - dist / radius));
        if (isMe) {
          const newHp = Math.max(0, g.myHp - dmg);
          g.myHp = newHp; setUiMyHp(newHp);
          if (newHp <= 0 && !g.gameOver) {
            g.gameOver = true;
            socket.emit("report-game-end", { roomName, reason: "defeat" });
          }
        } else {
          const newHp = Math.max(0, g.oppHp - dmg);
          g.oppHp = newHp; setUiOppHp(newHp);
          if (newHp <= 0 && !g.gameOver) {
            g.gameOver = true;
            socket.emit("report-game-end", { roomName, reason: "victory" });
          }
        }
      }
    };

    applyDmg(g.myX, g.myY, true);
    applyDmg(g.oppX, g.oppY, false);
  };

  // ── Main Canvas Loop ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let lastFuelUpdate = Date.now();

    const loop = () => {
      const g = G.current;
      if (g.terrain.length === 0) { raf = requestAnimationFrame(loop); return; }

      // ─ Movement ─
      if (g.isMyTurn && g.myFuel > 0 && g.projectiles.length === 0 && !g.firedThisTurn && !g.gameOver) {
        const now = Date.now();
        const dt = (now - lastFuelUpdate) / 1000;
        let moved = false;

        if (g.keys["KeyA"]) {
          g.myX = Math.max(10, g.myX - 1.5);
          g.myDir = -1;
          moved = true;
        } else if (g.keys["KeyD"]) {
          g.myX = Math.min(CANVAS_W - 10, g.myX + 1.5);
          g.myDir = 1;
          moved = true;
        }

        if (moved) {
          g.myFuel = Math.max(0, g.myFuel - 30 * dt);
          lastFuelUpdate = now;
          setUiMyFuel(Math.round(g.myFuel));
          socket.emit("game-action", { roomName, action: { type: "move", x: g.myX, direction: g.myDir } });
        } else {
          lastFuelUpdate = now;
        }
      }

      // ─ Gravity: snap tanks to terrain ─
      if (g.terrain[Math.round(g.myX)] !== undefined) g.myY = g.terrain[Math.round(g.myX)];
      if (g.terrain[Math.round(g.oppX)] !== undefined) g.oppY = g.terrain[Math.round(g.oppX)];

      // ─ Projectile physics ─
      const toRemove: number[] = [];
      for (let i = g.projectiles.length - 1; i >= 0; i--) {
        const p = g.projectiles[i];
        p.x += p.vx; p.y += p.vy; p.vy += GRAVITY;

        // Sniper drills terrain in-flight
        if (p.type === "sniper" && p.x >= 0 && p.x < CANVAS_W) {
          if (p.y >= g.terrain[Math.round(p.x)]) destructTerrain(p.x, p.y, 7);
        }

        // Cluster split
        if (p.type === "cluster" && !p.isSplit && p.splitTimer !== undefined) {
          p.splitTimer--;
          if (p.splitTimer <= 0) {
            p.isSplit = true;
            for (let j = -1; j <= 1; j++) {
              g.projectiles.push({ id: Math.random().toString(), x: p.x, y: p.y, vx: p.vx + j * 1.8, vy: p.vy - 1, type: "cluster", isSplit: true, owner: p.owner });
            }
            spawnParticles(p.x, p.y, 8, 2);
            toRemove.push(i);
            continue;
          }
        }

        const outOfBounds = p.x < 0 || p.x >= CANVAS_W || p.y > CANVAS_H;
        const hitTerrain = p.x >= 0 && p.x < CANVAS_W && p.y >= g.terrain[Math.round(p.x)];
        if (outOfBounds || hitTerrain) {
          handleExplosion(p);
          toRemove.push(i);
        }
      }
      toRemove.forEach(i => g.projectiles.splice(i, 1));

      // When all projectiles land → end turn
      if (g.projectiles.length === 0 && g.firedThisTurn && !g.turnEndEmitted && !g.gameOver) {
        g.turnEndEmitted = true;
        socket.emit("game-turn-end", { roomName });
      }

      // ─ Particles ─
      for (let i = g.particles.length - 1; i >= 0; i--) {
        const pt = g.particles[i];
        pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.06; pt.life++;
        if (pt.life >= pt.maxLife) g.particles.splice(i, 1);
      }

      // ─ Render ─
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      sky.addColorStop(0, "#0b0f19"); sky.addColorStop(1, "#1c1537");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Stars
      for (let s = 0; s < 60; s++) {
        const sx = (initialSeed * 999 + s * 137) % CANVAS_W;
        const sy = (initialSeed * 777 + s * 233) % 200;
        ctx.beginPath(); ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();
      }

      // Terrain fill
      ctx.beginPath(); ctx.moveTo(0, CANVAS_H);
      for (let x = 0; x < CANVAS_W; x++) ctx.lineTo(x, g.terrain[x]);
      ctx.lineTo(CANVAS_W, CANVAS_H); ctx.closePath();
      const tGrad = ctx.createLinearGradient(0, 200, 0, CANVAS_H);
      tGrad.addColorStop(0, "#2d3748"); tGrad.addColorStop(1, "#0f172a");
      ctx.fillStyle = tGrad; ctx.fill();

      // Terrain top glow
      ctx.beginPath(); ctx.moveTo(0, g.terrain[0]);
      for (let x = 1; x < CANVAS_W; x++) ctx.lineTo(x, g.terrain[x]);
      ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 2.5; ctx.stroke();

      // Particles
      g.particles.forEach(pt => {
        const alpha = 1 - pt.life / pt.maxLife;
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.radius * alpha, 0, Math.PI * 2);
        ctx.fillStyle = pt.color; ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Draw tank helper
      const drawTank = (tx: number, ty: number, isMe: boolean, ang: number, pwr: number) => {
        const rx = Math.round(tx);
        const lx = Math.max(0, rx - 6), rx2 = Math.min(CANVAS_W - 1, rx + 6);
        const slope = Math.atan2(g.terrain[rx2] - g.terrain[lx], 12);

        ctx.save(); ctx.translate(tx, ty); ctx.rotate(slope);

        // Treads
        ctx.fillStyle = "#1e293b";
        ctx.beginPath(); ctx.roundRect(-16, -2, 32, 7, 3); ctx.fill();
        ctx.strokeStyle = "#475569"; ctx.lineWidth = 1; ctx.stroke();

        // Body
        ctx.fillStyle = isMe ? "#7889a4" : "#94a3b8";
        ctx.beginPath(); ctx.roundRect(-14, -9, 28, 8, 2); ctx.fill();
        ctx.strokeStyle = "#475569"; ctx.lineWidth = 1; ctx.stroke();

        // Turret dome
        ctx.fillStyle = "#64748b";
        ctx.beginPath(); ctx.arc(0, -9, 6, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "#475569"; ctx.stroke();

        ctx.restore();

        // Aim guide for my tank on my turn
        if (isMe && g.isMyTurn && g.projectiles.length === 0 && !g.firedThisTurn) {
          const aRad = (ang * Math.PI) / 180;
          let gx = tx, gy = ty - 9;
          const gs = pwr * 0.15;
          let gvx = Math.cos(aRad) * gs, gvy = -Math.sin(aRad) * gs;

          ctx.beginPath(); ctx.setLineDash([4, 5]);
          ctx.strokeStyle = "rgba(99,102,241,0.45)"; ctx.lineWidth = 1.5;
          ctx.moveTo(gx, gy);
          for (let step = 0; step < 90; step++) {
            gx += gvx; gy += gvy; gvy += GRAVITY;
            const rxg = Math.round(gx);
            if (gx < 0 || gx >= CANVAS_W || gy > CANVAS_H || (rxg >= 0 && rxg < CANVAS_W && gy >= g.terrain[rxg])) break;
            ctx.lineTo(gx, gy);
          }
          ctx.stroke(); ctx.setLineDash([]);

          // Barrel
          ctx.save(); ctx.translate(tx, ty - 9);
          ctx.rotate(-aRad);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0);
          ctx.strokeStyle = "#475569"; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        } else {
          // Static barrel for opponent
          const oppRad = isMe ? 0 : Math.PI;
          ctx.save(); ctx.translate(tx, ty - 9); ctx.rotate(oppRad);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, -3);
          ctx.strokeStyle = "#475569"; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        }
      };

      drawTank(g.myX, g.myY, true, g.angle, g.power);
      drawTank(g.oppX, g.oppY, false, 180 - g.angle, g.power);

      // Projectiles
      g.projectiles.forEach(p => {
        const color = p.type === "heavy" ? "#ef4444" : p.type === "sniper" ? "#60a5fa" : "#a78bfa";
        const r = p.type === "heavy" ? 6 : p.type === "sniper" ? 3 : 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        // Trail
        if (Math.random() < 0.5) {
          g.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.08, vy: -p.vy * 0.08, color, radius: Math.random() * 2 + 0.5, life: 0, maxLife: 8 });
        }
      });

      // Player name labels above tanks
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#818cf8";
      ctx.fillText(myProfile.name, g.myX, g.myY - 28);
      ctx.fillStyle = "#f87171";
      ctx.fillText(opponentProfile.name, g.oppX, g.oppY - 28);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [socket, roomName, myProfile, opponentProfile, initialSeed, onGameEnded]);

  // ── Mouse aiming ─────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = G.current;
    if (!g.isMyTurn || g.projectiles.length > 0 || g.firedThisTurn || g.gameOver) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - g.myX;
    const dy = (g.myY - 9) - my;
    let ang = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    ang = Math.max(0, Math.min(180, ang));
    const pwr = Math.min(100, Math.max(10, Math.round(Math.hypot(dx, dy) * 0.4)));
    g.angle = ang; g.power = pwr;
    setUiAngle(ang); setUiPower(pwr);
  };

  const handleClick = () => {
    const g = G.current;
    if (!g.isMyTurn || g.projectiles.length > 0 || g.firedThisTurn || g.gameOver) return;
    g.firedThisTurn = true;
    spawnProjectile(g.myX, g.myY, g.angle, g.power, g.weapon, "me");
    socket.emit("game-action", {
      roomName,
      action: { type: "fire", x: g.myX, y: g.myY, angle: g.angle, power: g.power, weapon: g.weapon },
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const g = G.current;
    if (!g.isMyTurn) return;
    const idx = WEAPONS.indexOf(g.weapon);
    const next = WEAPONS[(idx + (e.deltaY > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length];
    g.weapon = next;
    setUiWeapon(next);
  };

  const weaponColor = uiWeapon === "heavy" ? "#ef4444" : uiWeapon === "sniper" ? "#60a5fa" : "#a78bfa";

  return (
    <div style={styles.wrapper}>
      {/* HUD Top */}
      <div style={styles.hud}>
        {/* My stats */}
        <div style={styles.hudSide}>
          <img src={myProfile.image} alt="me" style={{ ...styles.hudAvatar, borderColor: "#6366f1" }} />
          <div style={styles.hudInfo}>
            <div style={styles.hudName}>{myProfile.name}</div>
            <StatBar label="HP" value={uiMyHp} color="#ef4444" icon={<Shield size={11} />} />
            <StatBar label="연료" value={uiMyFuel} color="#eab308" icon={<Zap size={11} />} />
          </div>
        </div>

        {/* Center turn info */}
        <div style={styles.hudCenter}>
          {uiIsMyTurn
            ? <div style={styles.myTurn}>내 차례 💥</div>
            : <div style={styles.oppTurn}>상대방 차례 ⏳</div>}
          <div style={styles.timer}>{uiTimer}초</div>
        </div>

        {/* Opp stats */}
        <div style={{ ...styles.hudSide, flexDirection: "row-reverse" }}>
          <img src={opponentProfile.image} alt="opp" style={{ ...styles.hudAvatar, borderColor: "#f87171" }} />
          <div style={{ ...styles.hudInfo, alignItems: "flex-end" }}>
            <div style={styles.hudName}>{opponentProfile.name}</div>
            <StatBar label="HP" value={uiOppHp} color="#ef4444" icon={<Shield size={11} />} />
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={styles.canvas}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onWheel={handleWheel}
        />
      </div>

      {/* Footer HUD */}
      <div style={styles.footer}>
        <span style={styles.hint}><kbd style={styles.kbd}>A</kbd><kbd style={styles.kbd}>D</kbd> 이동</span>
        <span style={styles.hint}><kbd style={styles.kbd}>마우스 이동</kbd> 조준  <kbd style={styles.kbd}>클릭</kbd> 발사</span>
        <span style={styles.hint}><kbd style={styles.kbd}>스크롤</kbd> 무기 전환</span>
        <span style={{ ...styles.weaponLabel, color: weaponColor }}>
          {WEAPON_LABELS[uiWeapon]}
        </span>
        <span style={styles.hint}>각도 {uiAngle}°  세기 {uiPower}</span>
      </div>
    </div>
  );
}

function StatBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "3px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "#cbd5e1", marginBottom: "2px" }}>
        {icon}<span>{label}: {value}</span>
      </div>
      <div style={{ width: "130px", height: "5px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: "3px", transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "840px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "18px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6)" },
  hud: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: "12px" },
  hudSide: { display: "flex", alignItems: "center", gap: "10px", width: "230px" },
  hudAvatar: { width: "46px", height: "46px", borderRadius: "50%", border: "2px solid", objectFit: "cover", background: "#fff", flexShrink: 0 },
  hudInfo: { display: "flex", flexDirection: "column" },
  hudName: { fontSize: "13px", fontWeight: "700", color: "#e2e8f0", marginBottom: "4px" },
  hudCenter: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" },
  myTurn: { background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", padding: "5px 16px", borderRadius: "20px", fontWeight: "bold", fontSize: "13px", boxShadow: "0 0 12px rgba(16,185,129,0.4)" },
  oppTurn: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "4px 14px", borderRadius: "20px", fontWeight: "bold", fontSize: "13px" },
  timer: { fontSize: "11px", color: "#94a3b8" },
  canvasWrap: { borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)", cursor: "crosshair" },
  canvas: { display: "block" },
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(15,23,42,0.4)", borderRadius: "8px", padding: "10px 16px", flexWrap: "wrap", gap: "8px" },
  hint: { fontSize: "11px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "4px" },
  kbd: { background: "#334155", border: "1px solid #475569", color: "#f8fafc", padding: "1px 5px", borderRadius: "3px", fontFamily: "monospace", fontSize: "10px" },
  weaponLabel: { fontSize: "13px", fontWeight: "bold" },
};
