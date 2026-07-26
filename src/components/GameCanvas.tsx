"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { Shield, Zap } from "lucide-react";
import { WEAPON_DEFS, WeaponId, TANKS, TankId, DEFAULT_TANK_ID } from "@/lib/tanks";

interface GameCanvasProps {
  socket: Socket;
  roomName: string;
  myProfile: { id: string; name: string; image: string; tankId?: TankId };
  opponentProfile: { id: string; name: string; image: string; tankId?: TankId };
  initialSeed: number;
  playersInfo: Array<{ socketId: string; x: number; hp: number }>;
  activeSocketId: string;
  onGameEnded: (reason: string) => void;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: WeaponId;
  splitTimer?: number;
  isSplit?: boolean;
  owner: "me" | "opp";
}

interface Hazard {
  id: string;
  x: number;
  y: number;
  kind: "mine" | "vine" | "tree";
  plantedAt: number;
  lastTriggerMe?: number;
  lastTriggerOpp?: number;
}

interface BurnState {
  ticksLeft: number;
  lastTick: number;
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
const BURN_DMG_PER_TICK = 2;
const BURN_TICKS = 4;
const MINE_TRIGGER_RADIUS = 13;
const TREE_CONVERT_MS = 4000;
const TREE_BOUNCE_VY = -7.5;
const TREE_TRIGGER_COOLDOWN_MS = 1500;
const TREE_TRIGGER_RADIUS = 26;
const TREE_MOUND_RADIUS = 50;
const TREE_VISUAL_SCALE = 3.0;

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

  const myTank = TANKS[myProfile.tankId ?? DEFAULT_TANK_ID];
  const oppTank = TANKS[opponentProfile.tankId ?? DEFAULT_TANK_ID];
  const myWeapons = myTank.weapons;

  // All mutable game state in a single ref to avoid stale closures
  const G = useRef({
    terrain: [] as number[],
    myX: playersInfo.find(p => p.socketId === socket.id)?.x ?? 150,
    myY: 0,
    myHp: myTank.maxHp,
    myFuel: myTank.maxFuel,
    myDir: 1,
    oppX: playersInfo.find(p => p.socketId !== socket.id)?.x ?? 650,
    oppY: 0,
    oppHp: oppTank.maxHp,
    oppDir: -1,
    projectiles: [] as Projectile[],
    hazards: [] as Hazard[],
    particles: [] as Particle[],
    myBurn: null as BurnState | null,
    oppBurn: null as BurnState | null,
    mySlowPending: false,
    mySlowThisTurn: false,
    myLaunch: { active: false, vy: 0 },
    oppLaunch: { active: false, vy: 0 },
    isMyTurn: activeSocketId === socket.id,
    activeSocketId: activeSocketId,
    angle: 45,
    power: 50,
    weapon: myWeapons[0] as WeaponId,
    keys: {} as Record<string, boolean>,
    turnEndEmitted: false,
    gameOver: false,
    turnTimer: 20,
    firedThisTurn: false,
  });

  // React UI state (only for display)
  const [uiMyHp, setUiMyHp] = useState(myTank.maxHp);
  const [uiOppHp, setUiOppHp] = useState(oppTank.maxHp);
  const [uiMyFuel, setUiMyFuel] = useState(myTank.maxFuel);
  const [uiWeapon, setUiWeapon] = useState<WeaponId>(myWeapons[0]);
  const [uiIsMyTurn, setUiIsMyTurn] = useState(activeSocketId === socket.id);
  const [uiTimer, setUiTimer] = useState(20);
  const [uiAngle, setUiAngle] = useState(45);
  const [uiPower, setUiPower] = useState(50);

  // ── Terrain generation (모래 지형) ───────────────────────────────────
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
      if (g.isMyTurn) {
        g.myFuel = myTank.maxFuel; setUiMyFuel(myTank.maxFuel);
        g.mySlowThisTurn = g.mySlowPending;
        g.mySlowPending = false;
      }
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

  // 세계수가 지형으로 변할 때 땅을 융기시킴
  const growTerrainMound = (cx: number, baseY: number, radius: number) => {
    const t = G.current.terrain;
    const start = Math.max(0, Math.floor(cx - radius));
    const end = Math.min(CANVAS_W - 1, Math.ceil(cx + radius));
    for (let x = start; x <= end; x++) {
      const dx = x - cx;
      if (Math.abs(dx) < radius) {
        const dy = Math.sqrt(radius * radius - dx * dx);
        const targetY = baseY - dy * 0.6;
        if (t[x] > targetY) t[x] = targetY;
      }
    }
  };

  const spawnParticles = (ex: number, ey: number, count = 25, size = 4, palette?: string[]) => {
    const colors = palette ?? ["#ff5722", "#ff9800", "#ffeb3b", "#c2965b", "#fff"];
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
    wep: WeaponId, owner: "me" | "opp"
  ) => {
    const def = WEAPON_DEFS[wep];
    const angRad = (ang * Math.PI) / 180;
    const spd = pwr * 0.15;
    const proj: Projectile = {
      id: Math.random().toString(36).slice(2),
      x: sx, y: sy - 12,
      vx: Math.cos(angRad) * spd,
      vy: -Math.sin(angRad) * spd,
      type: wep, owner,
    };
    if (def.splitCount) { proj.splitTimer = def.splitDelay ?? 45; proj.isSplit = false; }
    G.current.projectiles.push(proj);
  };

  const igniteTank = (isMe: boolean) => {
    const g = G.current;
    if (isMe) {
      if (!g.myBurn) g.myBurn = { ticksLeft: BURN_TICKS, lastTick: Date.now() };
      else g.myBurn.ticksLeft = BURN_TICKS;
    } else {
      if (!g.oppBurn) g.oppBurn = { ticksLeft: BURN_TICKS, lastTick: Date.now() };
      else g.oppBurn.ticksLeft = BURN_TICKS;
    }
  };

  const applyHpDamage = (isMe: boolean, dmg: number) => {
    const g = G.current;
    if (dmg <= 0) return;
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
  };

  // 폭발 지점 중심의 범위 피해 (자신도 범위 안에 있으면 피해를 입음)
  const explodeAt = (ex: number, ey: number, wep: WeaponId, isSplit: boolean) => {
    const g = G.current;
    const def = WEAPON_DEFS[wep];
    const radius = def.radius;
    const maxDmg = isSplit ? (def.splitDamage ?? def.maxDmg) : def.maxDmg;
    const destructRadius = wep === "heavy" ? 38 : wep === "sniper" ? 12 : wep === "mine" ? 30 : 16;
    const particleCount = wep === "heavy" ? 35 : wep === "mine" ? 30 : wep === "sniper" ? 15 : 12;
    const palette = def.incendiary ? ["#f97316", "#fb923c", "#fde047", "#7c2d12"] : undefined;

    destructTerrain(ex, ey, destructRadius);
    spawnParticles(ex, ey, particleCount, 4, palette);

    const applyToTank = (tx: number, ty: number, isMe: boolean) => {
      const dist = Math.hypot(tx - ex, ty - ey);
      if (dist < radius) {
        const dmg = Math.round(maxDmg * (1 - dist / radius));
        applyHpDamage(isMe, dmg);
        if (def.incendiary) igniteTank(isMe);
        if (def.flowerEffect && isMe) {
          const delta = Math.random() * 30 - 15; // -15 ~ 15
          const newAngle = Math.max(0, Math.min(180, Math.round(g.angle + delta)));
          g.angle = newAngle;
          setUiAngle(newAngle);
        }
      }
    };

    applyToTank(g.myX, g.myY, true);
    applyToTank(g.oppX, g.oppY, false);
  };

  const handleExplosion = (p: Projectile) => {
    if (p.x < 0 || p.x >= CANVAS_W) return;
    explodeAt(p.x, p.y, p.type, !!p.isSplit);
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
        const moveSpeed = g.mySlowThisTurn ? 0.75 : 1.5;

        if (g.keys["KeyA"]) {
          g.myX = Math.max(10, g.myX - moveSpeed);
          g.myDir = -1;
          moved = true;
        } else if (g.keys["KeyD"]) {
          g.myX = Math.min(CANVAS_W - 10, g.myX + moveSpeed);
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

      // ─ Gravity: snap tanks to terrain (세계수에 맞아 튕겨나간 경우는 예외) ─
      if (g.myLaunch.active) {
        g.myY += g.myLaunch.vy;
        g.myLaunch.vy += GRAVITY * 0.6;
        const groundY = g.terrain[Math.round(g.myX)];
        if (groundY !== undefined && g.myY >= groundY) { g.myY = groundY; g.myLaunch.active = false; }
      } else if (g.terrain[Math.round(g.myX)] !== undefined) {
        g.myY = g.terrain[Math.round(g.myX)];
      }
      if (g.oppLaunch.active) {
        g.oppY += g.oppLaunch.vy;
        g.oppLaunch.vy += GRAVITY * 0.6;
        const groundYO = g.terrain[Math.round(g.oppX)];
        if (groundYO !== undefined && g.oppY >= groundYO) { g.oppY = groundYO; g.oppLaunch.active = false; }
      } else if (g.terrain[Math.round(g.oppX)] !== undefined) {
        g.oppY = g.terrain[Math.round(g.oppX)];
      }

      // ─ Burn (화상) DOT 처리 ─
      const now2 = Date.now();
      if (g.myBurn && now2 - g.myBurn.lastTick >= 1000) {
        applyHpDamage(true, BURN_DMG_PER_TICK);
        g.myBurn.ticksLeft -= 1;
        g.myBurn.lastTick = now2;
        if (g.myBurn.ticksLeft <= 0) g.myBurn = null;
      }
      if (g.oppBurn && now2 - g.oppBurn.lastTick >= 1000) {
        applyHpDamage(false, BURN_DMG_PER_TICK);
        g.oppBurn.ticksLeft -= 1;
        g.oppBurn.lastTick = now2;
        if (g.oppBurn.ticksLeft <= 0) g.oppBurn = null;
      }

      // ─ 설치물(지뢰/덩쿨/세계수) 판정 ─
      if (g.hazards.length > 0) {
        const now3 = Date.now();
        const hzToRemove = new Set<number>();
        g.hazards.forEach((h, idx) => {
          const hitMe = Math.abs(g.myX - h.x) < MINE_TRIGGER_RADIUS;
          const hitOpp = Math.abs(g.oppX - h.x) < MINE_TRIGGER_RADIUS;
          const treeHitMe = Math.abs(g.myX - h.x) < TREE_TRIGGER_RADIUS;
          const treeHitOpp = Math.abs(g.oppX - h.x) < TREE_TRIGGER_RADIUS;

          if (h.kind === "mine") {
            if (hitMe || hitOpp) { explodeAt(h.x, h.y, "mine", false); hzToRemove.add(idx); }
          } else if (h.kind === "vine") {
            if (hitMe || hitOpp) { explodeAt(h.x, h.y, "vine", true); }
            if (hitMe) { g.mySlowPending = true; spawnParticles(h.x, h.y, 10, 2, ["#65a30d", "#a3e635"]); hzToRemove.add(idx); }
            else if (hitOpp) { spawnParticles(h.x, h.y, 10, 2, ["#65a30d", "#a3e635"]); hzToRemove.add(idx); }
          } else if (h.kind === "tree") {
            if (treeHitMe && !g.myLaunch.active && (!h.lastTriggerMe || now3 - h.lastTriggerMe > TREE_TRIGGER_COOLDOWN_MS)) {
              g.myLaunch = { active: true, vy: TREE_BOUNCE_VY };
              applyHpDamage(true, WEAPON_DEFS.tree.maxDmg);
              spawnParticles(h.x, h.y, 10, 3, ["#16a34a", "#4ade80"]);
              h.lastTriggerMe = now3;
            }
            if (treeHitOpp && !g.oppLaunch.active && (!h.lastTriggerOpp || now3 - h.lastTriggerOpp > TREE_TRIGGER_COOLDOWN_MS)) {
              g.oppLaunch = { active: true, vy: TREE_BOUNCE_VY };
              applyHpDamage(false, WEAPON_DEFS.tree.maxDmg);
              spawnParticles(h.x, h.y, 10, 3, ["#16a34a", "#4ade80"]);
              h.lastTriggerOpp = now3;
            }
            if (now3 - h.plantedAt > TREE_CONVERT_MS) {
              growTerrainMound(h.x, h.y, TREE_MOUND_RADIUS);
              hzToRemove.add(idx);
            }
          }
        });
        if (hzToRemove.size) {
          g.hazards = g.hazards.filter((_, idx) => !hzToRemove.has(idx));
        }
      }

      // ─ Projectile physics ─
      const toRemove: number[] = [];
      for (let i = g.projectiles.length - 1; i >= 0; i--) {
        const p = g.projectiles[i];
        const def = WEAPON_DEFS[p.type];
        p.x += p.vx; p.y += p.vy; p.vy += GRAVITY;

        // Sniper drills terrain in-flight
        if (p.type === "sniper" && p.x >= 0 && p.x < CANVAS_W) {
          if (p.y >= g.terrain[Math.round(p.x)]) destructTerrain(p.x, p.y, 7);
        }

        // 분열탄 계열 분열 처리 (집속탄/샷건 집속탄/소이탄)
        if (def.splitCount && !p.isSplit && p.splitTimer !== undefined) {
          p.splitTimer--;
          if (p.splitTimer <= 0) {
            p.isSplit = true;
            const count = def.splitCount;
            const spread = def.spreadFactor ?? 1.7;
            for (let j = 0; j < count; j++) {
              const offset = j - (count - 1) / 2;
              g.projectiles.push({
                id: Math.random().toString(36).slice(2),
                x: p.x, y: p.y,
                vx: p.vx + offset * spread, vy: p.vy - 1,
                type: p.type, isSplit: true, owner: p.owner,
              });
            }
            spawnParticles(p.x, p.y, 8, 2);
            toRemove.push(i);
            continue;
          }
        }

        const outOfBounds = p.x < 0 || p.x >= CANVAS_W || p.y > CANVAS_H;
        const hitTerrain = p.x >= 0 && p.x < CANVAS_W && p.y >= g.terrain[Math.round(p.x)];
        if (outOfBounds || hitTerrain) {
          if (def.groundEffect) {
            // 지뢰/덩쿨/세계수는 착탄시 즉시 터지지 않고 설치됨
            if (hitTerrain) {
              g.hazards.push({
                id: Math.random().toString(36).slice(2),
                x: p.x, y: g.terrain[Math.round(p.x)],
                kind: def.groundEffect, plantedAt: Date.now(),
              });
              const palette = def.groundEffect === "vine" ? ["#65a30d", "#a3e635"]
                : def.groundEffect === "tree" ? ["#16a34a", "#4ade80", "#166534"]
                : undefined;
              spawnParticles(p.x, p.y, 6, 2, palette);
            }
          } else {
            handleExplosion(p);
          }
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

      // Sky (사막/모래 느낌의 노을 하늘)
      const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      sky.addColorStop(0, "#fde9c8");
      sky.addColorStop(0.45, "#f6c88f");
      sky.addColorStop(1, "#e0a458");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 태양
      const sunX = (CANVAS_W * 0.78);
      const sunY = 90;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 70);
      sunGrad.addColorStop(0, "rgba(255,247,214,0.95)");
      sunGrad.addColorStop(1, "rgba(255,247,214,0)");
      ctx.fillStyle = sunGrad;
      ctx.beginPath(); ctx.arc(sunX, sunY, 70, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
      ctx.fillStyle = "#fff3d6"; ctx.fill();

      // 멀리 있는 모래 언덕 실루엣
      ctx.beginPath(); ctx.moveTo(0, CANVAS_H);
      for (let x = 0; x <= CANVAS_W; x += 20) {
        const dy = 260 + Math.sin(x * 0.01 + initialSeed * 5) * 18;
        ctx.lineTo(x, dy);
      }
      ctx.lineTo(CANVAS_W, CANVAS_H); ctx.closePath();
      ctx.fillStyle = "rgba(196,140,84,0.35)"; ctx.fill();

      // Terrain fill (모래 지형)
      ctx.beginPath(); ctx.moveTo(0, CANVAS_H);
      for (let x = 0; x < CANVAS_W; x++) ctx.lineTo(x, g.terrain[x]);
      ctx.lineTo(CANVAS_W, CANVAS_H); ctx.closePath();
      const tGrad = ctx.createLinearGradient(0, 150, 0, CANVAS_H);
      tGrad.addColorStop(0, "#e8c48a");
      tGrad.addColorStop(0.35, "#c9975c");
      tGrad.addColorStop(1, "#8a6238");
      ctx.fillStyle = tGrad; ctx.fill();

      // Terrain top glow (모래 능선)
      ctx.beginPath(); ctx.moveTo(0, g.terrain[0]);
      for (let x = 1; x < CANVAS_W; x++) ctx.lineTo(x, g.terrain[x]);
      ctx.strokeStyle = "#f2d9a8"; ctx.lineWidth = 2.5; ctx.stroke();

      // 설치물(지뢰/덩쿨/세계수) 표시
      g.hazards.forEach(h => {
        ctx.save();
        ctx.translate(h.x, h.y - 3);
        if (h.kind === "mine") {
          ctx.beginPath();
          ctx.moveTo(0, -7); ctx.lineTo(7, 0); ctx.lineTo(0, 7); ctx.lineTo(-7, 0);
          ctx.closePath();
          ctx.fillStyle = "#4d7c0f"; ctx.fill();
          ctx.strokeStyle = "#bef264"; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#facc15"; ctx.fill();
        } else if (h.kind === "vine") {
          ctx.strokeStyle = "#4d7c0f"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-6, 4); ctx.quadraticCurveTo(-4, -8, 0, -6);
          ctx.quadraticCurveTo(4, -4, 6, 4);
          ctx.stroke();
          ctx.fillStyle = "#84cc16";
          ctx.beginPath(); ctx.arc(-4, -3, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(4, -1, 2, 0, Math.PI * 2); ctx.fill();
        } else if (h.kind === "tree") {
          const age = Math.min(1, (Date.now() - h.plantedAt) / TREE_CONVERT_MS);
          const scale = (0.55 + age * 0.45) * TREE_VISUAL_SCALE;
          ctx.scale(scale, scale);
          ctx.fillStyle = "#7c4a20";
          ctx.fillRect(-3, -8, 6, 20);
          ctx.fillStyle = "#166534";
          ctx.beginPath(); ctx.arc(0, -20, 16, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#16a34a";
          ctx.beginPath(); ctx.arc(-9, -14, 11, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(9, -14, 11, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#22c55e";
          ctx.beginPath(); ctx.arc(0, -26, 9, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      });

      // Particles
      g.particles.forEach(pt => {
        const alpha = 1 - pt.life / pt.maxLife;
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.radius * alpha, 0, Math.PI * 2);
        ctx.fillStyle = pt.color; ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Draw tank helper
      const drawTank = (tx: number, ty: number, isMe: boolean, ang: number, pwr: number, bodyColor: string, burning: boolean) => {
        const rx = Math.round(tx);
        const lx = Math.max(0, rx - 6), rx2 = Math.min(CANVAS_W - 1, rx + 6);
        const slope = Math.atan2(g.terrain[rx2] - g.terrain[lx], 12);

        ctx.save(); ctx.translate(tx, ty); ctx.rotate(slope);

        // Treads
        ctx.fillStyle = "#3a2c1a";
        ctx.beginPath(); ctx.roundRect(-16, -2, 32, 7, 3); ctx.fill();
        ctx.strokeStyle = "#5c4526"; ctx.lineWidth = 1; ctx.stroke();

        // Body (탱크별 컬러)
        ctx.fillStyle = bodyColor;
        ctx.beginPath(); ctx.roundRect(-14, -9, 28, 8, 2); ctx.fill();
        ctx.strokeStyle = "#334155"; ctx.lineWidth = 1; ctx.stroke();

        // Turret dome
        ctx.fillStyle = "#64748b";
        ctx.beginPath(); ctx.arc(0, -9, 6, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "#334155"; ctx.stroke();

        ctx.restore();

        // 화상 이펙트
        if (burning) {
          ctx.save();
          ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 100) * 0.2;
          ctx.beginPath();
          ctx.arc(tx, ty - 16, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#f97316"; ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // Aim guide for my tank on my turn
        if (isMe && g.isMyTurn && g.projectiles.length === 0 && !g.firedThisTurn) {
          const aRad = (ang * Math.PI) / 180;
          let gx = tx, gy = ty - 9;
          const gs = pwr * 0.15;
          let gvx = Math.cos(aRad) * gs, gvy = -Math.sin(aRad) * gs;

          ctx.beginPath(); ctx.setLineDash([4, 5]);
          ctx.strokeStyle = "rgba(99,102,241,0.5)"; ctx.lineWidth = 1.5;
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
          ctx.strokeStyle = "#334155"; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        } else {
          // Static barrel for opponent
          const oppRad = isMe ? 0 : Math.PI;
          ctx.save(); ctx.translate(tx, ty - 9); ctx.rotate(oppRad);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, -3);
          ctx.strokeStyle = "#334155"; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        }
      };

      drawTank(g.myX, g.myY, true, g.angle, g.power, myTank.bodyColor, !!g.myBurn);
      drawTank(g.oppX, g.oppY, false, 180 - g.angle, g.power, oppTank.bodyColor, !!g.oppBurn);

      // Projectiles
      g.projectiles.forEach(p => {
        const def = WEAPON_DEFS[p.type];
        const color = def.color;
        const r = p.type === "heavy" ? 6 : p.type === "sniper" ? 3 : p.type === "mine" ? 5 : 4;
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
      ctx.fillStyle = "#4338ca";
      ctx.fillText(myProfile.name, g.myX, g.myY - 28);
      ctx.fillStyle = "#b91c1c";
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
    const idx = myWeapons.indexOf(g.weapon);
    const next = myWeapons[(idx + (e.deltaY > 0 ? 1 : -1) + myWeapons.length) % myWeapons.length];
    g.weapon = next;
    setUiWeapon(next);
  };

  const weaponDef = WEAPON_DEFS[uiWeapon];

  return (
    <div style={styles.wrapper}>
      {/* HUD Top */}
      <div style={styles.hud}>
        {/* My stats */}
        <div style={styles.hudSide}>
          <img src={myProfile.image} alt="me" style={{ ...styles.hudAvatar, borderColor: "#6366f1" }} />
          <div style={styles.hudInfo}>
            <div style={styles.hudName}>{myProfile.name}</div>
            <StatBar label="HP" value={uiMyHp} max={myTank.maxHp} color="#ef4444" icon={<Shield size={11} />} />
            <StatBar label="연료" value={uiMyFuel} max={myTank.maxFuel} color="#eab308" icon={<Zap size={11} />} />
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
            <StatBar label="HP" value={uiOppHp} max={oppTank.maxHp} color="#ef4444" icon={<Shield size={11} />} />
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
        <span style={{ ...styles.weaponLabel, color: weaponDef.color }}>
          {weaponDef.label}
        </span>
        <span style={styles.hint}>각도 {uiAngle}°  세기 {uiPower}</span>
      </div>
    </div>
  );
}

function StatBar({ label, value, max, color, icon }: { label: string; value: number; max: number; color: string; icon: React.ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: "3px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "#cbd5e1", marginBottom: "2px" }}>
        {icon}<span>{label}: {value}</span>
      </div>
      <div style={{ width: "130px", height: "5px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "3px", transition: "width 0.3s" }} />
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
