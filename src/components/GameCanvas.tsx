"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { Shield, Zap } from "lucide-react";
import { WEAPON_DEFS, WeaponId, TANKS, TankId, DEFAULT_TANK_ID } from "@/lib/tanks";

type GameMode = "1v1" | "2v2" | "3v3";

interface PlayerSlot {
  socketId: string;
  team: "red" | "blue";
  slotIndex: number;
  x: number;
  hp: number;
  profile: {
    id: string;
    name: string;
    image: string;
    tankId?: TankId;
    winRate?: number;
    wins?: number;
    losses?: number;
  };
}

interface GameCanvasProps {
  socket: Socket;
  roomName: string;
  myProfile: { id: string; name: string; image: string; tankId?: TankId; winRate?: number; wins?: number; losses?: number };
  initialSeed: number;
  allPlayers: PlayerSlot[];
  turnOrder: string[];
  activeSocketId: string;
  mode: GameMode;
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
  ownerSocketId: string;
  railgunPhase?: "beam" | "growing";
  railgunAge?: number;
  railgunWidth?: number;
  railgunTargetX?: number;
  railgunTargetY?: number;
  isMinigunBullet?: boolean;
  bounces?: number;    // 탱탱볼: 남은 튕김 횟수
  tsAge?: number;      // 트릭샷: 경과 프레임
  tsFalling?: boolean; // 트릭샷: 급강하 전환 여부
  embedded?: boolean;  // 지옥의 불: 착탄 후 지형에 박혀 폭발 대기 중
  fuseAge?: number;    // 지옥의 불: 박힌 후 경과 프레임
  constellationGroupId?: string; // 별자리: 같은 발사 묶음 식별자
  constellationIndex?: number;   // 별자리: 발사 순서 (연결선 순서 결정)
}

interface Hazard {
  id: string;
  x: number;
  y: number;
  kind: "mine" | "vine" | "tree" | "emp" | "fire" | "beam" | "blackhole";
  plantedAt: number;
  lastTriggerMap?: Record<string, number>;
  empPhase?: "vibrate" | "explode" | "done";
  empRadius?: number;
  empExplodeAt?: number;
  empLastDamageSet?: Set<string>;
  fireRadius?: number;         // 지속 화염: 피해 반경
  fireUntil?: number;          // 지속 화염: 꺼지는 시각(ms epoch)
  fireLastTick?: Record<string, number>; // 지속 화염: 탱크별 마지막 틱 시각
  beamUntil?: number;          // 위성폭격 빔: 종료 시각(ms epoch)
  beamWidth?: number;          // 위성폭격 빔: 현재 폭
  beamLastTick?: number;       // 위성폭격 빔: 마지막 데미지 틱 시각
  ownerSocketId?: string;      // 위성폭격 빔: 발사자 (자신은 피해 제외)
  blackholeUntil?: number;     // 블랙홀: 종료 시각(ms epoch)
  blackholeStartedAt?: number; // 블랙홀: 시작 시각(ms epoch)
  blackholeLastTick?: number;  // 블랙홀: 마지막 데미지 틱 시각
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

interface TankState {
  socketId: string;
  team: "red" | "blue";
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  fuel: number;
  maxFuel: number;
  dir: number;
  burn: BurnState | null;
  slowPending: number;
  slowThisTurn: number;
  launch: { active: boolean; vy: number; vx?: number; isMoveShot?: boolean };
  dead: boolean;
  tankId: TankId;
  bodyColor: string;
  profile: PlayerSlot["profile"];
}

const WORLD_W = 2400;
const CANVAS_H = 550;
// Viewport size (what the player sees)
const VIEW_W = 900;
const VIEW_H = 550;
const GRAVITY = 0.25;
const BURN_DMG_PER_TICK = 2;
const BURN_TICKS = 4;
const GROUND_FIRE_DMG_PER_TICK = 3;
const GROUND_FIRE_TICK_MS = 700;
const MINE_TRIGGER_RADIUS = 13;
const TREE_CONVERT_MS = 4000;
const TREE_BOUNCE_VY = -7.5;
const EMP_VIBRATE_MS = 1500;
const EMP_EXPLODE_RADIUS = 64;
const RAILGUN_BEAM_FRAMES = 18;
const RAILGUN_GROW_FRAMES = 30;
const RAILGUN_DMG_INTERVAL = 200;
const TREE_TRIGGER_COOLDOWN_MS = 1500;
const TREE_TRIGGER_RADIUS = 26;
const TREE_MOUND_RADIUS = 50;
const TREE_VISUAL_SCALE = 3.0;
const BEAM_TICK_MS = 500;
const BLACKHOLE_DURATION_MS = 4000;
const BLACKHOLE_DMG_PER_SEC = 7;
const BLACKHOLE_TICK_MS = 500;
const BLACKHOLE_MAX_RADIUS = 85;
const BLACKHOLE_PULL_RADIUS = 140;

export function GameCanvas({
  socket,
  roomName,
  myProfile,
  initialSeed,
  allPlayers,
  turnOrder,
  activeSocketId,
  mode,
  onGameEnded,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Build initial tank states
  const buildInitialTanks = (): TankState[] => {
    return allPlayers.map(p => {
      const tankId = p.profile.tankId ?? DEFAULT_TANK_ID;
      const tankDef = TANKS[tankId];
      return {
        socketId: p.socketId,
        team: p.team,
        x: p.x,
        y: 0,
        hp: tankDef.maxHp,
        maxHp: tankDef.maxHp,
        fuel: tankDef.maxFuel,
        maxFuel: tankDef.maxFuel,
        dir: p.team === "red" ? 1 : -1,
        burn: null,
        slowPending: 0,
        slowThisTurn: 0,
        launch: { active: false, vy: 0 },
        dead: false,
        tankId,
        bodyColor: tankDef.bodyColor,
        profile: p.profile,
      };
    });
  };

  const mySocketId = socket.id ?? "";
  const myTankDef = TANKS[myProfile.tankId ?? DEFAULT_TANK_ID];
  const myWeapons = myTankDef.weapons;

  const G = useRef({
    terrain: [] as number[],
    tanks: buildInitialTanks(),
    projectiles: [] as Projectile[],
    hazards: [] as Hazard[],
    particles: [] as Particle[],
    turnOrder: turnOrder,
    activeSocketId: activeSocketId,
    isMyTurn: activeSocketId === mySocketId,
    angle: 45,
    power: 50,
    weapon: myWeapons[0] as WeaponId,
    keys: {} as Record<string, boolean>,
    turnEndEmitted: false,
    gameOver: false,
    turnTimer: 20,
    firedThisTurn: false,
    railgunLastDmgTime: 0,
    minigunQueue: [] as Array<{
      remaining: number;
      sx: number; sy: number;
      ang: number; pwr: number;
      ownerSocketId: string;
      lastSpawn: number;
    }>,
    constellationQueue: [] as Array<{
      remaining: number; total: number;
      sx: number; sy: number;
      ang: number; pwr: number;
      ownerSocketId: string;
      lastSpawn: number;
      groupId: string;
    }>,
    chainQueue: [] as Array<{
      x: number; y: number; ownerSocketId: string; delay: number;
    }>,
    constellationLineHits: new Set<string>(),
    // Camera
    camX: 0,
    camTargetX: 0,
  });

  // UI state
  const myTank = () => G.current.tanks.find(t => t.socketId === mySocketId);
  const [uiMyHp, setUiMyHp] = useState(myTankDef.maxHp);
  const [uiMyFuel, setUiMyFuel] = useState(myTankDef.maxFuel);
  const [uiWeapon, setUiWeapon] = useState<WeaponId>(myWeapons[0]);
  const [uiIsMyTurn, setUiIsMyTurn] = useState(activeSocketId === mySocketId);
  const [uiTimer, setUiTimer] = useState(20);
  const [uiAngle, setUiAngle] = useState(45);
  const [uiPower, setUiPower] = useState(50);
  const [uiActiveName, setUiActiveName] = useState<string>(() => {
    const ap = allPlayers.find(p => p.socketId === activeSocketId);
    return ap?.profile.name ?? "";
  });
  const [uiTankHps, setUiTankHps] = useState<Record<string, number>>(() =>
    Object.fromEntries(allPlayers.map(p => [p.socketId, TANKS[p.profile.tankId ?? DEFAULT_TANK_ID].maxHp]))
  );

  // ── Terrain generation (확장 맵 2400px) ─────────────────────────────────
  useEffect(() => {
    const g = G.current;
    const terrain: number[] = [];
    for (let x = 0; x < WORLD_W; x++) {
      const h = 330
        + Math.sin(x * 0.008 + initialSeed * 10) * 70
        + Math.sin(x * 0.02 + initialSeed) * 30
        + Math.cos(x * 0.003 - initialSeed) * 50
        + Math.sin(x * 0.005 + initialSeed * 3) * 25;
      terrain.push(Math.min(CANVAS_H - 20, Math.max(150, h)));
    }
    g.terrain = terrain;

    // Place tanks on terrain
    g.tanks.forEach(t => {
      const rx = Math.round(Math.min(WORLD_W - 1, Math.max(0, t.x)));
      t.y = terrain[rx] ?? CANVAS_H;
    });

    // Set camera to my tank's position initially
    const me = g.tanks.find(t => t.socketId === mySocketId);
    if (me) {
      g.camX = Math.max(0, Math.min(WORLD_W - VIEW_W, me.x - VIEW_W / 2));
      g.camTargetX = g.camX;
    }
  }, [initialSeed]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => { G.current.keys[e.code] = true; };
    const up = (e: KeyboardEvent) => { G.current.keys[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ── Turn timer ───────────────────────────────────────────────────────────
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

  // ── Socket events ────────────────────────────────────────────────────────
  useEffect(() => {
    const onAction = (action: any) => {
      const g = G.current;
      const tank = g.tanks.find(t => t.socketId === action.socketId);
      if (!tank) return;
      if (action.type === "move") {
        tank.x = action.x;
        tank.dir = action.direction;
        if (g.terrain.length) tank.y = g.terrain[Math.round(Math.min(WORLD_W - 1, Math.max(0, tank.x)))];
      } else if (action.type === "fire") {
        if (WEAPON_DEFS[action.weapon as WeaponId]?.isMoveShot) {
          launchMoveShot(action.socketId, action.angle, action.power);
        } else {
          spawnProjectile(action.x, action.y, action.angle, action.power, action.weapon, action.socketId);
        }
      }
    };

    const onNewTurn = ({ activeSocketId: asid }: { activeSocketId: string }) => {
      const g = G.current;
      g.activeSocketId = asid;
      g.isMyTurn = asid === mySocketId;
      g.turnEndEmitted = false;
      g.firedThisTurn = false;
      g.turnTimer = 20;
      setUiIsMyTurn(g.isMyTurn);
      setUiTimer(20);

      // Update active player name in UI
      const activeTank = g.tanks.find(t => t.socketId === asid);
      setUiActiveName(activeTank?.profile.name ?? "");

      if (g.isMyTurn) {
        const me = g.tanks.find(t => t.socketId === mySocketId);
        if (me) {
          me.fuel = me.maxFuel;
          setUiMyFuel(me.maxFuel);
          me.slowThisTurn = me.slowPending;
          me.slowPending = 0;
        }
      }

      // Camera: move toward active tank
      const nextActiveTank = g.tanks.find(t => t.socketId === asid);
      if (nextActiveTank) {
        g.camTargetX = Math.max(0, Math.min(WORLD_W - VIEW_W, nextActiveTank.x - VIEW_W / 2));
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

  // ── Helpers ──────────────────────────────────────────────────────────────
  const destructTerrain = (cx: number, cy: number, radius: number) => {
    const t = G.current.terrain;
    const start = Math.max(0, Math.floor(cx - radius));
    const end = Math.min(WORLD_W - 1, Math.ceil(cx + radius));
    for (let x = start; x <= end; x++) {
      const dx = x - cx;
      if (Math.abs(dx) < radius) {
        const dy = Math.sqrt(radius * radius - dx * dx);
        const targetY = cy + dy;
        if (t[x] < targetY) t[x] = Math.min(CANVAS_H, Math.max(t[x], targetY));
      }
    }
  };

  const growTerrainMound = (cx: number, baseY: number, radius: number) => {
    const t = G.current.terrain;
    const start = Math.max(0, Math.floor(cx - radius));
    const end = Math.min(WORLD_W - 1, Math.ceil(cx + radius));
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
    wep: WeaponId, ownerSocketId: string
  ) => {
    const def = WEAPON_DEFS[wep];
    const angRad = (ang * Math.PI) / 180;
    const spd = pwr * 0.15;
    const g = G.current;

    if (def.isMinigun) {
      g.minigunQueue.push({ remaining: 20, sx, sy, ang, pwr, ownerSocketId, lastSpawn: 0 });
      return;
    }

    if (def.isConstellation) {
      const groupId = Math.random().toString(36).slice(2);
      g.constellationQueue.push({
        remaining: def.orbCount ?? 7, total: def.orbCount ?? 7,
        sx, sy, ang, pwr, ownerSocketId, lastSpawn: 0, groupId,
      });
      return;
    }

    if (def.isFlamethrower) {
      fireFlamethrower(ownerSocketId, sx, sy, ang);
      return;
    }

    if (def.isRailgun) {
      const railSpd = 20;
      let tx = sx, ty = sy - 12;
      const tvx = Math.cos(angRad) * railSpd;
      const tvy = -Math.sin(angRad) * railSpd;
      for (let step = 0; step < 400; step++) {
        tx += tvx; ty += tvy;
        const rix = Math.round(tx);
        if (tx < 0 || tx >= WORLD_W || ty > CANVAS_H ||
          (rix >= 0 && rix < WORLD_W && ty >= g.terrain[rix])) break;
      }
      g.projectiles.push({
        id: Math.random().toString(36).slice(2),
        x: sx, y: sy - 12,
        vx: tvx, vy: tvy,
        type: wep, ownerSocketId,
        railgunPhase: "beam", railgunAge: 0, railgunWidth: 0.5,
        railgunTargetX: tx, railgunTargetY: ty,
      });
      return;
    }

    const proj: Projectile = {
      id: Math.random().toString(36).slice(2),
      x: sx, y: sy - 12,
      vx: Math.cos(angRad) * spd,
      vy: -Math.sin(angRad) * spd,
      type: wep, ownerSocketId,
    };
    if (def.splitCount) { proj.splitTimer = def.splitDelay ?? 45; proj.isSplit = false; }
    g.projectiles.push(proj);
  };

  const igniteTank = (socketId: string, ticks?: number) => {
    const g = G.current;
    const tank = g.tanks.find(t => t.socketId === socketId);
    if (!tank) return;
    const dur = ticks ?? BURN_TICKS;
    if (!tank.burn) tank.burn = { ticksLeft: dur, lastTick: Date.now() };
    else tank.burn.ticksLeft = Math.max(tank.burn.ticksLeft, dur);
  };

  // 세계수(나무)/덩쿨탄 지형지물을 반경 내에서 태워 없앰 (인페르노 전용 상호작용)
  const burnNearbyHazards = (ex: number, ey: number, radius: number) => {
    const g = G.current;
    g.hazards = g.hazards.filter(h => {
      if ((h.kind === "vine" || h.kind === "tree") && Math.hypot(h.x - ex, h.y - ey) < radius) {
        spawnParticles(h.x, h.y, 10, 2, ["#f97316", "#fde047", "#7c2d12"]);
        return false;
      }
      return true;
    });
  };

  // 지형에 몇 초간 불이 붙는 지속 화염 지대를 생성 (소이탄/화산/지옥의 불/화염방사기 공통)
  const igniteGround = (x: number, y: number, radius: number, durationMs: number) => {
    const g = G.current;
    const fx = Math.max(0, Math.min(WORLD_W - 1, Math.round(x)));
    const fy = g.terrain[fx] ?? y;
    g.hazards.push({
      id: Math.random().toString(36).slice(2),
      x, y: fy,
      kind: "fire",
      plantedAt: Date.now(),
      fireRadius: radius,
      fireUntil: Date.now() + durationMs,
    });
  };

  // 지옥의 불 폭발시 소이탄을 위로 한 번 더 쏘아 올림 (2차 화염 확산)
  const launchIncendiaryBurst = (x: number, y: number, ownerSocketId: string) => {
    const g = G.current;
    const idef = WEAPON_DEFS.incendiary;
    const upSpd = 13 + Math.random() * 3;
    const angDeg = 90 + (Math.random() * 20 - 10);
    const angRad = (angDeg * Math.PI) / 180;
    g.projectiles.push({
      id: Math.random().toString(36).slice(2),
      x, y: y - 6,
      vx: Math.cos(angRad) * upSpd,
      vy: -Math.sin(angRad) * upSpd,
      type: "incendiary",
      ownerSocketId,
      splitTimer: idef.splitDelay ?? 45,
      isSplit: false,
    });
  };

  const applyHpDamage = (socketId: string, dmg: number) => {
    const g = G.current;
    if (dmg <= 0) return;
    const tank = g.tanks.find(t => t.socketId === socketId);
    if (!tank || tank.dead) return;
    const newHp = Math.max(0, tank.hp - dmg);
    tank.hp = newHp;

    // Update UI hp map
    setUiTankHps(prev => ({ ...prev, [socketId]: newHp }));
    if (socketId === mySocketId) setUiMyHp(newHp);

    if (newHp <= 0 && !tank.dead) {
      tank.dead = true;
      spawnParticles(tank.x, tank.y, 40, 6, ["#ef4444", "#f97316", "#fbbf24", "#fff"]);

      // 코스모 패시브: 사망시 그 자리에 블랙홀 소환 (4초간 지속, 초당 7뎀)
      const hasBlackhole = TANKS[tank.tankId]?.passive === "blackhole";
      if (hasBlackhole) {
        const nowD = Date.now();
        g.hazards.push({
          id: Math.random().toString(36).slice(2),
          x: tank.x, y: tank.y,
          kind: "blackhole",
          plantedAt: nowD,
          blackholeStartedAt: nowD,
          blackholeUntil: nowD + BLACKHOLE_DURATION_MS,
          blackholeLastTick: nowD,
        });
      }

      // Check game over locally
      const redAlive = g.tanks.filter(t => t.team === "red" && !t.dead).length;
      const blueAlive = g.tanks.filter(t => t.team === "blue" && !t.dead).length;
      const endsGame = redAlive === 0 || blueAlive === 0;

      const reportDeath = () => {
        socket.emit("report-player-dead", { roomName, deadSocketId: socketId });
        if (endsGame) g.gameOver = true;
      };

      if (endsGame && hasBlackhole) {
        // 블랙홀이 다 사라질 때까지는 게임이 끝나지 않도록 결과 보고를 지연시킴
        setTimeout(reportDeath, BLACKHOLE_DURATION_MS + 200);
      } else {
        reportDeath();
      }
    }
  };

  const explodeAt = (ex: number, ey: number, wep: WeaponId, isSplit: boolean, overrideRadius?: number, overrideDmg?: number) => {
    const g = G.current;
    const def = WEAPON_DEFS[wep];
    const radius = overrideRadius ?? def.radius;
    const maxDmg = overrideDmg ?? (isSplit ? (def.splitDamage ?? def.maxDmg) : def.maxDmg);
    const destructRadius = wep === "heavy" ? 38 : wep === "hellfire" ? 60 : wep === "sniper" ? 12 : wep === "mine" ? 30 : 16;
    const particleCount = wep === "heavy" ? 35 : wep === "hellfire" ? 42 : wep === "mine" ? 30 : wep === "sniper" ? 15 : 12;
    const palette = def.incendiary ? ["#f97316", "#fb923c", "#fde047", "#7c2d12"] : undefined;

    destructTerrain(ex, ey, destructRadius);
    spawnParticles(ex, ey, particleCount, 4, palette);
    if (def.burnsHazards) burnNearbyHazards(ex, ey, radius);
    if (def.incendiary) {
      const groundDur = 3000 + (def.burnTicks ?? BURN_TICKS) * 500;
      igniteGround(ex, ey, Math.max(30, radius * 0.85), groundDur);
    }

    g.tanks.forEach(tank => {
      if (tank.dead) return;
      const dist = Math.hypot(tank.x - ex, tank.y - ey);
      if (dist < radius) {
        const dmg = Math.round(maxDmg * (1 - dist / radius));
        applyHpDamage(tank.socketId, dmg);
        if (def.incendiary) igniteTank(tank.socketId, def.burnTicks);
        if (def.flowerEffect && tank.socketId === mySocketId) {
          const delta = Math.random() * 34 - 17;
          const newAngle = Math.max(0, Math.min(180, Math.round(G.current.angle + delta)));
          G.current.angle = newAngle;
          setUiAngle(newAngle);
        }
      }
    });
  };

  const handleExplosion = (p: Projectile) => {
    if (p.x < 0 || p.x >= WORLD_W) return;
    explodeAt(p.x, p.y, p.type, !!p.isSplit);
  };

  // ── 이동탄(moveshot): 자신의 몸이 포탄 대신 날아감 ────────────────────────
  const launchMoveShot = (socketId: string, ang: number, pwr: number) => {
    const g = G.current;
    const tank = g.tanks.find(t => t.socketId === socketId);
    if (!tank || tank.dead) return;
    const angRad = (ang * Math.PI) / 180;
    const spd = pwr * 0.15;
    tank.launch = {
      active: true,
      vy: -Math.sin(angRad) * spd,
      vx: Math.cos(angRad) * spd,
      isMoveShot: true,
    };
  };

  // 착지(또는 적 근접) 시점에 호출: 20데미지, 적중시에만 자신도 7데미지
  const moveShotImpact = (socketId: string, ex: number, ey: number) => {
    const g = G.current;
    const def = WEAPON_DEFS.moveshot;
    destructTerrain(ex, ey, 30);
    spawnParticles(ex, ey, 30, 4, ["#f8fafc", "#f9a8d4", "#e2e8f0"]);
    let hitEnemy = false;
    g.tanks.forEach(tank => {
      if (tank.dead || tank.socketId === socketId) return;
      const dist = Math.hypot(tank.x - ex, tank.y - ey);
      if (dist < def.radius) {
        const dmg = Math.round(def.maxDmg * (1 - dist / def.radius));
        applyHpDamage(tank.socketId, dmg);
        hitEnemy = true;
      }
    });
    if (hitEnemy) applyHpDamage(socketId, def.selfDamage ?? 7);
  };

  // ── 화염방사기: 전방 원뿔형으로 즉시 화염을 내뿜음 ─────────────────────────
  const fireFlamethrower = (ownerSocketId: string, sx: number, sy: number, ang: number) => {
    const g = G.current;
    const def = WEAPON_DEFS.flamethrower;
    const angRad = (ang * Math.PI) / 180;
    const range = def.flameRange ?? 130;
    const dirX = Math.cos(angRad), dirY = -Math.sin(angRad);
    const sx0 = sx, sy0 = sy - 12;

    // 화염 파티클 (시각효과)
    for (let k = 0; k < 20; k++) {
      const t = k / 19;
      const spread = (Math.random() - 0.5) * 16 * t;
      const px = sx0 + dirX * range * t + -dirY * spread;
      const py = sy0 + dirY * range * t + dirX * spread;
      g.particles.push({ x: px, y: py, vx: dirX * 1.2, vy: dirY * 1.2, color: Math.random() < 0.5 ? "#fb923c" : "#fde047", radius: Math.random() * 3 + 1.5, life: 0, maxLife: 16 });
    }

    g.tanks.forEach(tank => {
      if (tank.dead || tank.socketId === ownerSocketId) return;
      const t = Math.max(0, Math.min(1, ((tank.x - sx0) * dirX + (tank.y - sy0) * dirY) / range));
      const cx = sx0 + dirX * range * t;
      const cy = sy0 + dirY * range * t;
      const dist = Math.hypot(tank.x - cx, tank.y - cy);
      if (t > 0 && dist < 20) {
        const dmg = Math.round(def.maxDmg * (1 - dist / 20));
        applyHpDamage(tank.socketId, dmg);
        igniteTank(tank.socketId, def.burnTicks);
      }
    });

    if (def.burnsHazards) {
      burnNearbyHazards(sx0 + dirX * range * 0.5, sy0 + dirY * range * 0.5, range * 0.65);
    }
    const groundDur = 3000 + (def.burnTicks ?? BURN_TICKS) * 500;
    igniteGround(sx0 + dirX * range * 0.45, sy0 + dirY * range * 0.45, 32, groundDur);
    igniteGround(sx0 + dirX * range * 0.9, sy0 + dirY * range * 0.9, 32, groundDur);
  };

  // ── Main Canvas Loop ─────────────────────────────────────────────────────
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

      const me = g.tanks.find(t => t.socketId === mySocketId);

      // ─ Camera smooth follow ─
      // Follow active tank or fired projectile
      const activeTank = g.tanks.find(t => t.socketId === g.activeSocketId && !t.dead);
      const flyingMoveTank = g.tanks.find(t => t.launch.active && t.launch.isMoveShot);
      let targetCamX = g.camTargetX;
      if (flyingMoveTank) {
        targetCamX = Math.max(0, Math.min(WORLD_W - VIEW_W, flyingMoveTank.x - VIEW_W / 2));
      } else if (g.projectiles.length > 0) {
        const firstProj = g.projectiles[0];
        targetCamX = Math.max(0, Math.min(WORLD_W - VIEW_W, firstProj.x - VIEW_W / 2));
      } else if (activeTank) {
        targetCamX = Math.max(0, Math.min(WORLD_W - VIEW_W, activeTank.x - VIEW_W / 2));
      }
      g.camTargetX = targetCamX;
      g.camX += (g.camTargetX - g.camX) * 0.08;

      const camOffset = g.camX;

      // ─ Movement (my tank) ─
      if (g.isMyTurn && me && !me.dead && me.fuel > 0 && g.projectiles.length === 0 && !g.firedThisTurn && !g.gameOver) {
        const now = Date.now();
        const dt = (now - lastFuelUpdate) / 1000;
        let moved = false;
        const currX = Math.round(me.x);
        const y0 = g.terrain[currX] ?? 0;
        let speedMultiplier = 1;

        if (g.keys["KeyA"] || g.keys["KeyD"]) {
          const targetDir = g.keys["KeyA"] ? -1 : 1;
          const nextX = Math.min(WORLD_W - 1, Math.max(0, currX + targetDir * 3));
          const y1 = g.terrain[nextX] ?? y0;
          const dy = y0 - y1;
          if (dy > 0) {
            const slopeAngleDeg = (Math.atan2(dy, 3) * 180) / Math.PI;
            if (slopeAngleDeg >= 80) speedMultiplier = 0.5;
          }
        }

        const slowMultiplier = Math.max(0.15, 1 - 0.15 * me.slowThisTurn);
        const moveSpeed = 1.5 * slowMultiplier * speedMultiplier;

        if (g.keys["KeyA"]) { me.x = Math.max(10, me.x - moveSpeed); me.dir = -1; moved = true; }
        else if (g.keys["KeyD"]) { me.x = Math.min(WORLD_W - 10, me.x + moveSpeed); me.dir = 1; moved = true; }

        if (moved) {
          me.fuel = Math.max(0, me.fuel - 30 * dt);
          lastFuelUpdate = now;
          setUiMyFuel(Math.round(me.fuel));
          socket.emit("game-action", { roomName, action: { type: "move", x: me.x, direction: me.dir, socketId: mySocketId } });
        } else { lastFuelUpdate = now; }
      }

      // ─ Gravity: snap tanks to terrain ─
      g.tanks.forEach(t => {
        if (t.dead) return;
        if (t.launch.active) {
          t.y += t.launch.vy;
          if (t.launch.vx) {
            t.x = Math.max(10, Math.min(WORLD_W - 10, t.x + t.launch.vx));
          }
          t.launch.vy += GRAVITY * (t.launch.isMoveShot ? 1 : 0.6);
          const groundY = g.terrain[Math.round(Math.min(WORLD_W - 1, Math.max(0, t.x)))];
          if (groundY !== undefined && t.y >= groundY) {
            t.y = groundY;
            const wasMoveShot = t.launch.isMoveShot;
            t.launch.active = false;
            if (wasMoveShot) moveShotImpact(t.socketId, t.x, t.y);
          }
        } else {
          const rx = Math.round(Math.min(WORLD_W - 1, Math.max(0, t.x)));
          if (g.terrain[rx] !== undefined) t.y = g.terrain[rx];
        }
      });

      // ─ Burn DOT ─
      const now2 = Date.now();
      g.tanks.forEach(t => {
        if (!t.burn || t.dead) return;
        if (now2 - t.burn.lastTick >= 1000) {
          applyHpDamage(t.socketId, BURN_DMG_PER_TICK);
          t.burn.ticksLeft -= 1;
          t.burn.lastTick = now2;
          if (t.burn.ticksLeft <= 0) t.burn = null;
        }
      });

      // ─ Hazards ─
      if (g.hazards.length > 0) {
        const now3 = Date.now();
        const hzToRemove = new Set<number>();
        g.hazards.forEach((h, idx) => {
          if (!h.lastTriggerMap) h.lastTriggerMap = {};

          g.tanks.forEach(tank => {
            if (tank.dead) return;
            const hitDist = Math.abs(tank.x - h.x);
            const hitMe = hitDist < MINE_TRIGGER_RADIUS;
            const treeHit = hitDist < TREE_TRIGGER_RADIUS;

            if (h.kind === "mine") {
              if (hitMe) { explodeAt(h.x, h.y, "mine", false); hzToRemove.add(idx); }
            } else if (h.kind === "vine") {
              if (hitMe) {
                explodeAt(h.x, h.y, "vine", true);
                tank.slowPending += 1;
                spawnParticles(h.x, h.y, 10, 2, ["#65a30d", "#a3e635"]);
                hzToRemove.add(idx);
              }
            } else if (h.kind === "tree") {
              const lastTrig = h.lastTriggerMap![tank.socketId] ?? 0;
              if (treeHit && !tank.launch.active && (now3 - lastTrig > TREE_TRIGGER_COOLDOWN_MS)) {
                tank.launch = { active: true, vy: TREE_BOUNCE_VY };
                if (!lastTrig) applyHpDamage(tank.socketId, WEAPON_DEFS.tree.maxDmg);
                spawnParticles(h.x, h.y, 10, 3, ["#16a34a", "#4ade80"]);
                h.lastTriggerMap![tank.socketId] = now3;
              }
            } else if (h.kind === "fire") {
              if (!h.fireLastTick) h.fireLastTick = {};
              const distX = Math.abs(tank.x - h.x);
              if (distX < (h.fireRadius ?? 40)) {
                const lastTick = h.fireLastTick![tank.socketId] ?? 0;
                if (now3 - lastTick >= GROUND_FIRE_TICK_MS) {
                  applyHpDamage(tank.socketId, GROUND_FIRE_DMG_PER_TICK);
                  h.fireLastTick![tank.socketId] = now3;
                  spawnParticles(tank.x, tank.y - 12, 3, 2, ["#f97316", "#fde047"]);
                }
              }
            }
          });

          if (h.kind === "fire") {
            if (Math.random() < 0.35) {
              const spreadX = (Math.random() - 0.5) * (h.fireRadius ?? 40) * 1.6;
              spawnParticles(h.x + spreadX, h.y - 2, 1, 1, ["#f97316", "#fde047", "#dc2626"]);
            }
            if (now3 >= (h.fireUntil ?? 0)) hzToRemove.add(idx);
          }

          if (h.kind === "tree" && now3 - h.plantedAt > TREE_CONVERT_MS) {
            growTerrainMound(h.x, h.y, TREE_MOUND_RADIUS);
            hzToRemove.add(idx);
          }

          if (h.kind === "emp") {
            const age = now3 - h.plantedAt;
            if (!h.empPhase) h.empPhase = "vibrate";
            if (!h.empLastDamageSet) h.empLastDamageSet = new Set();
            if (h.empPhase === "vibrate") {
              h.empRadius = 18 + Math.sin(age * 0.025) * 5 + (age / EMP_VIBRATE_MS) * 8;
              if (age >= EMP_VIBRATE_MS) { h.empPhase = "explode"; h.empExplodeAt = now3; }
            } else if (h.empPhase === "explode") {
              const explodeAge = now3 - (h.empExplodeAt ?? now3);
              const progress = Math.min(1, explodeAge / 600);
              const blastRadius = EMP_EXPLODE_RADIUS * progress;
              g.tanks.forEach(tank => {
                if (tank.dead || h.empLastDamageSet!.has(tank.socketId)) return;
                if (Math.hypot(tank.x - h.x, tank.y - h.y) < blastRadius + 20) {
                  applyHpDamage(tank.socketId, WEAPON_DEFS.emp.maxDmg);
                  tank.slowPending += 3;
                  h.empLastDamageSet!.add(tank.socketId);
                  spawnParticles(h.x, h.y, 20, 4, ["#facc15", "#38bdf8", "#fff", "#bae6fd"]);
                }
              });
              destructTerrain(h.x, h.y, blastRadius * 0.7);
              if (progress >= 1) hzToRemove.add(idx);
            }
          }
        });
        if (hzToRemove.size) g.hazards = g.hazards.filter((_, idx) => !hzToRemove.has(idx));
      }

      // ─ Projectile physics ─
      const toRemove: number[] = [];
      for (let i = g.projectiles.length - 1; i >= 0; i--) {
        const p = g.projectiles[i];
        const def = WEAPON_DEFS[p.type];

        if (p.embedded) {
          // 지옥의 불: 지형에 박힌 채 점점 붉어지다가 퓨즈가 다 되면 폭발
          p.fuseAge = (p.fuseAge ?? 0) + 1;
          if (p.fuseAge >= (def.fuseFrames ?? 60)) {
            handleExplosion(p);
            if (def.hellfire) launchIncendiaryBurst(p.x, p.y, p.ownerSocketId);
            toRemove.push(i);
          } else if (p.fuseAge % 8 === 0) {
            spawnParticles(p.x, p.y - 2, 2, 1, ["#78716c", "#f97316", "#dc2626"]);
          }
          continue;
        }

        if (def.isRailgun) {
          p.railgunAge = (p.railgunAge ?? 0) + 1;
          if (p.railgunPhase === "beam" && p.railgunAge >= RAILGUN_BEAM_FRAMES) {
            p.railgunPhase = "growing"; p.railgunAge = 0;
          } else if (p.railgunPhase === "growing") {
            p.railgunWidth = 0.5 + Math.min(1, p.railgunAge / RAILGUN_GROW_FRAMES) * 8;
            const now4 = Date.now();
            if (now4 - g.railgunLastDmgTime > RAILGUN_DMG_INTERVAL) {
              g.railgunLastDmgTime = now4;
              const sx0 = p.x + p.vx * 1.5, sy0 = p.y + p.vy * 1.5;
              const tx0 = p.railgunTargetX ?? p.x, ty0 = p.railgunTargetY ?? p.y;
              const len = Math.hypot(tx0 - sx0, ty0 - sy0);
              g.tanks.forEach(tank => {
                if (tank.dead || tank.socketId === p.ownerSocketId) return;
                if (len <= 0) return;
                const t = ((tank.x - sx0) * (tx0 - sx0) + (tank.y - sy0) * (ty0 - sy0)) / (len * len);
                const clampT = Math.max(0, Math.min(1, t));
                const cx = sx0 + clampT * (tx0 - sx0);
                const cy = sy0 + clampT * (ty0 - sy0);
                if (Math.hypot(tank.x - cx, tank.y - cy) < 18) applyHpDamage(tank.socketId, WEAPON_DEFS.railgun.maxDmg);
              });
            }
            if (p.railgunAge >= RAILGUN_GROW_FRAMES) {
              toRemove.push(i);
              spawnParticles(p.railgunTargetX ?? p.x, p.railgunTargetY ?? p.y, 15, 3, ["#38bdf8", "#7dd3fc", "#fff"]);
            }
          }
          continue;
        }

        if (def.trickshot) {
          // 트릭샷: 일직선으로 날다가 아래에 상대 탱크가 감지되면 90도로 급강하
          if (!p.tsFalling) {
            const belowTank = g.tanks.find(t =>
              !t.dead && t.socketId !== p.ownerSocketId && Math.abs(t.x - p.x) < 20
            );
            if (belowTank) {
              p.tsFalling = true;
              p.vx = 0;
              p.vy = 9;
            }
          }
          p.x += p.vx; p.y += p.vy;
        } else {
          p.x += p.vx; p.y += p.vy;
          if (!p.isMinigunBullet) p.vy += GRAVITY; else p.vy += GRAVITY * 0.15;
        }

        if (p.type === "sniper" && p.x >= 0 && p.x < WORLD_W) {
          const rix = Math.round(p.x);
          if (rix >= 0 && rix < WORLD_W && p.y >= g.terrain[rix]) destructTerrain(p.x, p.y, 7);
        }

        if (def.splitCount && !p.isSplit && p.splitTimer !== undefined) {
          p.splitTimer--;
          if (p.splitTimer <= 0) {
            p.isSplit = true;
            const count = def.splitCount;
            if (def.splitAngleDeg !== undefined) {
              const totalRad = (def.splitAngleDeg * Math.PI) / 180;
              const baseAngle = Math.atan2(p.vy, p.vx);
              const speed = Math.hypot(p.vx, p.vy);
              for (let j = 0; j < count; j++) {
                const t = count > 1 ? j / (count - 1) - 0.5 : 0;
                const ang = baseAngle + t * totalRad;
                g.projectiles.push({ id: Math.random().toString(36).slice(2), x: p.x, y: p.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, type: p.type, isSplit: true, ownerSocketId: p.ownerSocketId, bounces: def.bouncy ? def.maxBounces : undefined });
              }
            } else {
              const spread = def.spreadFactor ?? 1.7;
              for (let j = 0; j < count; j++) {
                const offset = j - (count - 1) / 2;
                g.projectiles.push({ id: Math.random().toString(36).slice(2), x: p.x, y: p.y, vx: p.vx + offset * spread, vy: p.vy - 1, type: p.type, isSplit: true, ownerSocketId: p.ownerSocketId });
              }
            }
            spawnParticles(p.x, p.y, 8, 2);
            toRemove.push(i);
            continue;
          }
        }

        const outOfBounds = p.x < 0 || p.x >= WORLD_W || p.y > CANVAS_H;
        const rix = Math.round(p.x);
        const hitTerrain = p.x >= 0 && p.x < WORLD_W && p.y >= g.terrain[Math.max(0, Math.min(WORLD_W - 1, rix))];

        if (p.isMinigunBullet) {
          let hitAnyone = false;
          for (const tank of g.tanks) {
            if (tank.dead || tank.socketId === p.ownerSocketId) continue;
            if (Math.hypot(tank.x - p.x, tank.y - p.y) < 24) {
              applyHpDamage(tank.socketId, 1);
              spawnParticles(p.x, p.y, 4, 2, ["#cbd5e1", "#fff"]);
              toRemove.push(i); hitAnyone = true; break;
            }
          }
          if (hitAnyone) continue;
          if (outOfBounds || hitTerrain) {
            if (hitTerrain) destructTerrain(p.x, p.y, 5);
            toRemove.push(i); continue;
          }
        }

        if (outOfBounds || hitTerrain) {
          if (def.hellfire) {
            // 지옥의 불: 지형에 닿으면 즉시 터지지 않고 박혀서 점점 붉어지다가 지연 폭발
            if (hitTerrain) {
              p.embedded = true;
              p.vx = 0; p.vy = 0;
              p.fuseAge = 0;
              spawnParticles(p.x, p.y, 8, 2, ["#78716c", "#a8a29e", "#44403c"]);
            } else {
              toRemove.push(i);
            }
          } else if (def.bouncy && hitTerrain && (p.bounces ?? def.maxBounces ?? 0) > 0) {
            // 탱탱볼: 닿을시 약간 터지고(개당 데미지) 튕겨나감 — 아직 튕길 횟수가 남음
            explodeAt(p.x, p.y, p.type, true);
            p.vy = -Math.abs(p.vy) * 0.55;
            p.vx *= 0.85;
            p.y -= 3;
            p.bounces = (p.bounces ?? def.maxBounces ?? 5) - 1;
          } else if (def.isSatellite && hitTerrain) {
            // 위성폭격: 착탄 지점에 직접 폭발하는 대신 위에서 내려오는 성장형 빔을 소환
            const rx3 = Math.max(0, Math.min(WORLD_W - 1, rix));
            g.hazards.push({
              id: Math.random().toString(36).slice(2),
              x: p.x, y: g.terrain[rx3],
              kind: "beam",
              plantedAt: Date.now(),
              beamUntil: Date.now() + (def.beamDurationMs ?? 2600),
              beamWidth: 0,
              beamLastTick: Date.now(),
              ownerSocketId: p.ownerSocketId,
            });
            spawnParticles(p.x, p.y, 10, 3, ["#a78bfa", "#ddd6fe", "#fff"]);
            toRemove.push(i);
          } else if (def.groundEffect) {
            if (hitTerrain) {
              const rx2 = Math.max(0, Math.min(WORLD_W - 1, rix));
              const hazard: Hazard = { id: Math.random().toString(36).slice(2), x: p.x, y: g.terrain[rx2], kind: def.groundEffect, plantedAt: Date.now() };
              if (def.groundEffect === "emp") { hazard.empPhase = "vibrate"; hazard.empRadius = 18; }
              g.hazards.push(hazard);
              const palette = def.groundEffect === "vine" ? ["#65a30d", "#a3e635"] : def.groundEffect === "tree" ? ["#16a34a", "#4ade80", "#166534"] : def.groundEffect === "emp" ? ["#facc15", "#38bdf8", "#fff"] : undefined;
              spawnParticles(p.x, p.y, 6, 2, palette);
            }
            toRemove.push(i);
          } else {
            if (def.bouncy && hitTerrain) {
              explodeAt(p.x, p.y, p.type, true);
            } else {
              handleExplosion(p);
              if (def.isSupernova && p.x >= 0 && p.x < WORLD_W) {
                const extra = (def.chainCount ?? 7) - 1;
                for (let c = 0; c < extra; c++) {
                  g.chainQueue.push({
                    x: p.x, y: p.y,
                    ownerSocketId: p.ownerSocketId,
                    delay: (def.chainDelayFrames ?? 10) * (c + 1),
                  });
                }
              }
            }
            toRemove.push(i);
          }
        }
      }
      toRemove.forEach(i => g.projectiles.splice(i, 1));

      // ─ 초신성 연쇄 폭발 대기열 ─
      if (g.chainQueue.length > 0) {
        const supDef = WEAPON_DEFS.supernova;
        for (let c = g.chainQueue.length - 1; c >= 0; c--) {
          const item = g.chainQueue[c];
          item.delay--;
          if (item.delay <= 0) {
            const rad = Math.random() * Math.PI * 2;
            const dist = 18 + Math.random() * 34;
            const cx = Math.max(0, Math.min(WORLD_W - 1, item.x + Math.cos(rad) * dist));
            const cy = item.y + Math.sin(rad) * dist * 0.5;
            explodeAt(cx, cy, "supernova", false, supDef.chainRadius, supDef.chainDmg);
            g.chainQueue.splice(c, 1);
          }
        }
      }

      // ─ 별자리 발사 대기열 (연속 발사 + 탄 사이 연결선 데미지) ─
      if (g.constellationQueue.length > 0) {
        const nowC = Date.now();
        const csDef = WEAPON_DEFS.constellation;
        for (let q = g.constellationQueue.length - 1; q >= 0; q--) {
          const item = g.constellationQueue[q];
          if (nowC - item.lastSpawn >= (csDef.orbDelayFrames ?? 6) * 16.7) {
            item.lastSpawn = nowC;
            const idx = item.total - item.remaining;
            item.remaining--;
            const angRad2 = (item.ang * Math.PI) / 180;
            const spd2 = item.pwr * 0.15;
            const jitter = (Math.random() - 0.5) * 0.05;
            g.projectiles.push({
              id: Math.random().toString(36).slice(2),
              x: item.sx, y: item.sy - 12,
              vx: Math.cos(angRad2 + jitter) * spd2, vy: -Math.sin(angRad2 + jitter) * spd2 - idx * 0.3,
              type: "constellation", ownerSocketId: item.ownerSocketId,
              constellationGroupId: item.groupId, constellationIndex: idx,
            });
            if (item.remaining <= 0) g.constellationQueue.splice(q, 1);
          }
        }
      }

      // ─ 별자리 연결선 데미지 (같은 그룹의 인접한 탄 사이 선에 닿으면 소량 피해) ─
      const constellationOrbs = g.projectiles.filter(p => p.type === "constellation");
      if (constellationOrbs.length >= 2) {
        const csDef = WEAPON_DEFS.constellation;
        const groups = new Map<string, Projectile[]>();
        constellationOrbs.forEach(o => {
          const arr = groups.get(o.constellationGroupId ?? "") ?? [];
          arr.push(o);
          groups.set(o.constellationGroupId ?? "", arr);
        });
        groups.forEach(orbs => {
          orbs.sort((a, b) => (a.constellationIndex ?? 0) - (b.constellationIndex ?? 0));
          for (let oi = 0; oi < orbs.length - 1; oi++) {
            const a = orbs[oi], b = orbs[oi + 1];
            g.tanks.forEach(tank => {
              if (tank.dead || tank.socketId === a.ownerSocketId) return;
              const dx = b.x - a.x, dy = b.y - a.y;
              const lenSq = dx * dx + dy * dy || 1;
              const t = Math.max(0, Math.min(1, ((tank.x - a.x) * dx + (tank.y - a.y) * dy) / lenSq));
              const cx = a.x + t * dx, cy = a.y + t * dy;
              if (Math.hypot(tank.x - cx, tank.y - cy) < 10) {
                const key = `${a.id}_${b.id}`;
                if (!G.current.constellationLineHits.has(key + "_" + tank.socketId)) {
                  G.current.constellationLineHits.add(key + "_" + tank.socketId);
                  applyHpDamage(tank.socketId, csDef.lineDamage ?? 3);
                  spawnParticles(cx, cy, 5, 1.5, ["#f8fafc", "#e2e8f0"]);
                }
              }
            });
          }
        });
      }

      // ─ 위성폭격 빔 / 블랙홀 지속 효과 ─
      if (g.hazards.some(h => h.kind === "beam" || h.kind === "blackhole")) {
        const nowB = Date.now();
        const satDef = WEAPON_DEFS.satellite;
        const bhRemove = new Set<number>();
        g.hazards.forEach((h, idx) => {
          if (h.kind === "beam") {
            const total = (h.beamUntil ?? nowB) - h.plantedAt;
            const elapsed = nowB - h.plantedAt;
            const growProgress = Math.min(1, elapsed / Math.max(1, total * 0.4));
            h.beamWidth = (satDef.beamMaxWidth ?? 70) * growProgress;
            if (Math.random() < 0.6) destructTerrain(h.x, h.y, (h.beamWidth ?? 10) * 0.5);
            if (nowB - (h.beamLastTick ?? 0) >= BEAM_TICK_MS) {
              h.beamLastTick = nowB;
              g.tanks.forEach(tank => {
                if (tank.dead || tank.socketId === h.ownerSocketId) return;
                if (Math.abs(tank.x - h.x) < (h.beamWidth ?? 10) / 2 + 12) {
                  applyHpDamage(tank.socketId, Math.round((satDef.beamDmgPerSec ?? 10) * (BEAM_TICK_MS / 1000)));
                  spawnParticles(tank.x, tank.y - 10, 4, 2, ["#a78bfa", "#ddd6fe"]);
                }
              });
            }
            if (nowB >= (h.beamUntil ?? 0)) bhRemove.add(idx);
          } else if (h.kind === "blackhole") {
            const elapsed = nowB - (h.blackholeStartedAt ?? h.plantedAt);
            const progress = Math.min(1, elapsed / BLACKHOLE_DURATION_MS);
            const curRadius = BLACKHOLE_MAX_RADIUS * progress;
            g.tanks.forEach(tank => {
              if (tank.dead) return;
              const dist = Math.hypot(tank.x - h.x, tank.y - h.y);
              if (dist < BLACKHOLE_PULL_RADIUS) {
                const pull = (1 - dist / BLACKHOLE_PULL_RADIUS) * 1.6;
                const dir = tank.x > h.x ? -1 : 1;
                tank.x = Math.max(10, Math.min(WORLD_W - 10, tank.x + dir * pull));
              }
              if (dist < curRadius + 16 && nowB - (h.blackholeLastTick ?? 0) >= BLACKHOLE_TICK_MS) {
                applyHpDamage(tank.socketId, Math.round(BLACKHOLE_DMG_PER_SEC * (BLACKHOLE_TICK_MS / 1000)));
              }
            });
            if (nowB - (h.blackholeLastTick ?? 0) >= BLACKHOLE_TICK_MS) h.blackholeLastTick = nowB;
            if (nowB >= (h.blackholeUntil ?? 0)) bhRemove.add(idx);
          }
        });
        if (bhRemove.size) g.hazards = g.hazards.filter((_, idx) => !bhRemove.has(idx));
      }

      // ─ Minigun burst queue ─
      if (g.minigunQueue.length > 0) {
        const nowM = Date.now();
        for (let q = g.minigunQueue.length - 1; q >= 0; q--) {
          const item = g.minigunQueue[q];
          if (nowM - item.lastSpawn >= 45) {
            item.lastSpawn = nowM; item.remaining--;
            const angRad = (item.ang * Math.PI) / 180;
            const bulletSpd = 15;
            const jitter = (Math.random() - 0.5) * 0.04;
            g.projectiles.push({ id: Math.random().toString(36).slice(2), x: item.sx, y: item.sy - 12, vx: Math.cos(angRad + jitter) * (bulletSpd + Math.random()), vy: -Math.sin(angRad + jitter) * (bulletSpd + Math.random()), type: "minigun", ownerSocketId: item.ownerSocketId, isMinigunBullet: true });
            if (item.remaining <= 0) g.minigunQueue.splice(q, 1);
          }
        }
      }

      // Auto end turn
      const hasActiveEmp = g.hazards.some(h => h.kind === "emp" && h.empPhase !== "done");
      const hasActiveBeam = g.hazards.some(h => h.kind === "beam");
      const hasFlyingMoveShot = g.tanks.some(t => t.launch.active && t.launch.isMoveShot);
      const hasPendingBursts = g.constellationQueue.length > 0 || g.chainQueue.length > 0;
      if (g.projectiles.length === 0 && g.minigunQueue.length === 0 && !hasActiveEmp && !hasActiveBeam && !hasFlyingMoveShot && !hasPendingBursts && g.firedThisTurn && !g.turnEndEmitted && !g.gameOver) {
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
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      ctx.translate(-camOffset, 0);

      // Sky
      const sky = ctx.createLinearGradient(camOffset, 0, camOffset, CANVAS_H);
      sky.addColorStop(0, "#fde9c8");
      sky.addColorStop(0.45, "#f6c88f");
      sky.addColorStop(1, "#e0a458");
      ctx.fillStyle = sky;
      ctx.fillRect(camOffset, 0, VIEW_W, CANVAS_H);

      // Sun
      const sunX = camOffset + VIEW_W * 0.78;
      const sunY = 90;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 70);
      sunGrad.addColorStop(0, "rgba(255,247,214,0.95)");
      sunGrad.addColorStop(1, "rgba(255,247,214,0)");
      ctx.fillStyle = sunGrad;
      ctx.beginPath(); ctx.arc(sunX, sunY, 70, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
      ctx.fillStyle = "#fff3d6"; ctx.fill();

      // Background dunes
      ctx.beginPath(); ctx.moveTo(camOffset, CANVAS_H);
      for (let x = Math.floor(camOffset); x <= camOffset + VIEW_W + 20; x += 20) {
        const dy = 260 + Math.sin(x * 0.01 + initialSeed * 5) * 18;
        ctx.lineTo(x, dy);
      }
      ctx.lineTo(camOffset + VIEW_W, CANVAS_H); ctx.closePath();
      ctx.fillStyle = "rgba(196,140,84,0.35)"; ctx.fill();

      // Terrain fill
      ctx.beginPath(); ctx.moveTo(camOffset, CANVAS_H);
      for (let x = Math.max(0, Math.floor(camOffset)); x <= Math.min(WORLD_W - 1, Math.ceil(camOffset + VIEW_W)); x++) {
        ctx.lineTo(x, g.terrain[x]);
      }
      ctx.lineTo(Math.min(WORLD_W - 1, camOffset + VIEW_W), CANVAS_H); ctx.closePath();
      const tGrad = ctx.createLinearGradient(0, 150, 0, CANVAS_H);
      tGrad.addColorStop(0, "#e8c48a");
      tGrad.addColorStop(0.35, "#c9975c");
      tGrad.addColorStop(1, "#8a6238");
      ctx.fillStyle = tGrad; ctx.fill();

      // Terrain ridge
      ctx.beginPath();
      for (let x = Math.max(0, Math.floor(camOffset)); x <= Math.min(WORLD_W - 1, Math.ceil(camOffset + VIEW_W)); x++) {
        if (x === Math.max(0, Math.floor(camOffset))) ctx.moveTo(x, g.terrain[x]);
        else ctx.lineTo(x, g.terrain[x]);
      }
      ctx.strokeStyle = "#f2d9a8"; ctx.lineWidth = 2.5; ctx.stroke();

      // Hazards
      g.hazards.forEach(h => {
        if (h.x < camOffset - 60 || h.x > camOffset + VIEW_W + 60) return;
        ctx.save();
        ctx.translate(h.x, h.y - 3);
        if (h.kind === "mine") {
          ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(7, 0); ctx.lineTo(0, 7); ctx.lineTo(-7, 0); ctx.closePath();
          ctx.fillStyle = "#4d7c0f"; ctx.fill();
          ctx.strokeStyle = "#bef264"; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fillStyle = "#facc15"; ctx.fill();
        } else if (h.kind === "vine") {
          ctx.strokeStyle = "#4d7c0f"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(-4, -8, 0, -6); ctx.quadraticCurveTo(4, -4, 6, 4); ctx.stroke();
          ctx.fillStyle = "#84cc16";
          ctx.beginPath(); ctx.arc(-4, -3, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(4, -1, 2, 0, Math.PI * 2); ctx.fill();
        } else if (h.kind === "tree") {
          const age = Math.min(1, (Date.now() - h.plantedAt) / TREE_CONVERT_MS);
          const scale = (0.55 + age * 0.45) * TREE_VISUAL_SCALE;
          ctx.scale(scale, scale);
          ctx.fillStyle = "#7c4a20"; ctx.fillRect(-3, -8, 6, 20);
          ctx.fillStyle = "#166534"; ctx.beginPath(); ctx.arc(0, -20, 16, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#16a34a"; ctx.beginPath(); ctx.arc(-9, -14, 11, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(9, -14, 11, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(0, -26, 9, 0, Math.PI * 2); ctx.fill();
        } else if (h.kind === "emp") {
          const empR = h.empRadius ?? 18;
          if (h.empPhase === "vibrate") {
            const wiggle = Math.sin(Date.now() * 0.02) * 2;
            ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
            ctx.beginPath(); ctx.arc(wiggle, wiggle - 3, empR, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(-wiggle, -wiggle - 3, empR * 0.65, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(0, -3, 4, 0, Math.PI * 2); ctx.fill();
          } else if (h.empPhase === "explode") {
            const prog = Math.min(1, (Date.now() - (h.empExplodeAt ?? Date.now())) / 600);
            const blastR = EMP_EXPLODE_RADIUS * prog;
            ctx.globalAlpha = 1 - prog;
            ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3 + prog * 6;
            ctx.beginPath(); ctx.arc(0, -3, blastR, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(0, -3, blastR * 0.6, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
          }
        } else if (h.kind === "fire") {
          const remainMs = (h.fireUntil ?? 0) - Date.now();
          const fadeAlpha = Math.max(0, Math.min(1, remainMs / 800));
          const fr = h.fireRadius ?? 40;
          const flicker = Math.sin(Date.now() * 0.012 + h.x) * 3;
          ctx.globalAlpha = 0.85 * fadeAlpha;
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, fr);
          grad.addColorStop(0, "rgba(253,224,71,0.55)");
          grad.addColorStop(0.5, "rgba(249,115,22,0.35)");
          grad.addColorStop(1, "rgba(124,45,18,0)");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.ellipse(0, -2, fr, 10, 0, 0, Math.PI * 2); ctx.fill();
          for (let fk = 0; fk < 4; fk++) {
            const fx = (fk - 1.5) * (fr / 3.2);
            const fh = 10 + Math.sin(Date.now() * 0.01 + fk * 2) * 4 + flicker;
            ctx.fillStyle = fk % 2 === 0 ? "#f97316" : "#fde047";
            ctx.beginPath();
            ctx.moveTo(fx, 2);
            ctx.quadraticCurveTo(fx - 4, -fh * 0.5, fx, -fh);
            ctx.quadraticCurveTo(fx + 4, -fh * 0.5, fx, 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else if (h.kind === "beam") {
          const satDef = WEAPON_DEFS.satellite;
          const w = h.beamWidth ?? 4;
          const elapsed = Date.now() - h.plantedAt;
          const total = (h.beamUntil ?? Date.now()) - h.plantedAt;
          const fadeAlpha = Math.max(0, Math.min(1, (total - elapsed) / Math.max(1, total * 0.25)));
          ctx.save();
          ctx.globalAlpha = 0.75 * Math.max(0.35, fadeAlpha);
          const beamGrad = ctx.createLinearGradient(0, -CANVAS_H, 0, 0);
          beamGrad.addColorStop(0, "rgba(167,139,250,0)");
          beamGrad.addColorStop(0.4, "rgba(167,139,250,0.55)");
          beamGrad.addColorStop(1, "rgba(221,214,254,0.85)");
          ctx.fillStyle = beamGrad;
          ctx.fillRect(-w / 2, -CANVAS_H, Math.max(2, w), CANVAS_H);
          ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 1.5;
          ctx.strokeRect(-w / 2, -CANVAS_H, Math.max(2, w), CANVAS_H);
          if (Math.random() < 0.4) {
            g.particles.push({ x: h.x + (Math.random() - 0.5) * w, y: 0, vx: 0, vy: -1, color: "#a78bfa", radius: Math.random() * 2 + 1, life: 0, maxLife: 12 });
          }
          void satDef;
          ctx.restore();
        } else if (h.kind === "blackhole") {
          const elapsed = Date.now() - (h.blackholeStartedAt ?? h.plantedAt);
          const progress = Math.min(1, elapsed / BLACKHOLE_DURATION_MS);
          const r = BLACKHOLE_MAX_RADIUS * progress;
          ctx.save();
          const bhGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          bhGrad.addColorStop(0, "rgba(0,0,0,1)");
          bhGrad.addColorStop(0.7, "rgba(30,10,50,0.9)");
          bhGrad.addColorStop(1, "rgba(139,92,246,0.15)");
          ctx.fillStyle = bhGrad;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(196,181,253,0.6)"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
          if (Math.random() < 0.5) {
            const a = Math.random() * Math.PI * 2;
            const d = BLACKHOLE_PULL_RADIUS * (0.6 + Math.random() * 0.4);
            g.particles.push({ x: h.x + Math.cos(a) * d, y: (h.y - 3) + Math.sin(a) * d * 0.4, vx: -Math.cos(a) * 2, vy: -Math.sin(a) * 1, color: "#a78bfa", radius: Math.random() * 2 + 1, life: 0, maxLife: 20 });
          }
          ctx.restore();
        }
        ctx.restore();
      });

      // Constellation connecting lines
      {
        const csOrbs = g.projectiles.filter(p => p.type === "constellation");
        if (csOrbs.length >= 2) {
          const csGroups = new Map<string, Projectile[]>();
          csOrbs.forEach(o => {
            const arr = csGroups.get(o.constellationGroupId ?? "") ?? [];
            arr.push(o);
            csGroups.set(o.constellationGroupId ?? "", arr);
          });
          csGroups.forEach(orbs => {
            orbs.sort((a, b) => (a.constellationIndex ?? 0) - (b.constellationIndex ?? 0));
            ctx.save();
            ctx.strokeStyle = "rgba(248,250,252,0.75)";
            ctx.lineWidth = 1.2;
            ctx.shadowColor = "#fff"; ctx.shadowBlur = 4;
            ctx.beginPath();
            orbs.forEach((o, oi) => { if (oi === 0) ctx.moveTo(o.x, o.y); else ctx.lineTo(o.x, o.y); });
            ctx.stroke();
            ctx.restore();
          });
        }
      }

      // Railgun visuals
      g.projectiles.forEach(p => {
        const def = WEAPON_DEFS[p.type];
        if (!def.isRailgun || !p.railgunPhase) return;
        const tx2 = p.railgunTargetX ?? p.x;
        const ty2 = p.railgunTargetY ?? p.y;
        const alpha = p.railgunPhase === "beam" ? 0.7 : 1;
        const w = p.railgunWidth ?? 0.5;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.railgunPhase === "beam" ? "#7dd3fc" : "#38bdf8";
        ctx.lineWidth = w; ctx.lineCap = "round";
        ctx.shadowColor = "#38bdf8"; ctx.shadowBlur = p.railgunPhase === "growing" ? w * 4 : 4;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx2, ty2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
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

      // Draw tank
      const drawTank = (tank: TankState, showAim: boolean) => {
        if (tank.dead) return;
        const tx = tank.x, ty = tank.y;
        const rx = Math.round(Math.min(WORLD_W - 1, Math.max(0, tx)));
        const lx = Math.max(0, rx - 6), rx2 = Math.min(WORLD_W - 1, rx + 6);
        const slope = Math.atan2(g.terrain[rx2] - g.terrain[lx], 12);

        ctx.save(); ctx.translate(tx, ty); ctx.rotate(slope);
        // Treads
        ctx.fillStyle = "#3a2c1a";
        ctx.beginPath(); ctx.roundRect(-16, -2, 32, 7, 3); ctx.fill();
        ctx.strokeStyle = "#5c4526"; ctx.lineWidth = 1; ctx.stroke();
        // Body
        ctx.fillStyle = tank.bodyColor;
        ctx.beginPath(); ctx.roundRect(-14, -9, 28, 8, 2); ctx.fill();
        ctx.strokeStyle = "#334155"; ctx.lineWidth = 1; ctx.stroke();
        // Team outline
        ctx.strokeStyle = tank.team === "red" ? "#f87171" : "#60a5fa";
        ctx.lineWidth = 1.5; ctx.stroke();
        // 탱크별 강조 테두리 (예: 오트의 분홍 테두리) — 팀 색상 위에 그려 항상 보이도록 함
        const accentColor = TANKS[tank.tankId]?.accentColor;
        if (accentColor) {
          ctx.beginPath(); ctx.roundRect(-14, -9, 28, 8, 2);
          ctx.strokeStyle = accentColor; ctx.lineWidth = 1.5; ctx.stroke();
        }
        // Turret
        ctx.fillStyle = "#64748b";
        ctx.beginPath(); ctx.arc(0, -9, 6, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "#334155"; ctx.stroke();
        ctx.restore();

        // Burn effect
        if (tank.burn) {
          ctx.save(); ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 100) * 0.2;
          ctx.beginPath(); ctx.arc(tx, ty - 16, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#f97316"; ctx.fill();
          ctx.globalAlpha = 1; ctx.restore();
        }

        // Aim guide (only for this client's tank on their turn)
        if (showAim && g.projectiles.length === 0 && !g.firedThisTurn) {
          const aRad = (g.angle * Math.PI) / 180;
          const curDef = WEAPON_DEFS[g.weapon];

          if (curDef.isRailgun) {
            let gx = tx, gy = ty - 9;
            const gvx2 = Math.cos(aRad) * 20, gvy2 = -Math.sin(aRad) * 20;
            ctx.beginPath(); ctx.setLineDash([6, 4]);
            ctx.strokeStyle = "rgba(56,189,248,0.7)"; ctx.lineWidth = 1.5; ctx.moveTo(gx, gy);
            for (let step = 0; step < 120; step++) {
              gx += gvx2; gy += gvy2;
              const rxg = Math.round(gx);
              if (gx < 0 || gx >= WORLD_W || gy > CANVAS_H || (rxg >= 0 && rxg < WORLD_W && gy >= g.terrain[rxg])) break;
              ctx.lineTo(gx, gy);
            }
            ctx.stroke(); ctx.setLineDash([]);
          } else if (curDef.isMinigun) {
            ctx.beginPath(); ctx.setLineDash([2, 6]);
            ctx.strokeStyle = "rgba(241,245,249,0.6)"; ctx.lineWidth = 1;
            ctx.moveTo(tx, ty - 9); ctx.lineTo(tx + Math.cos(aRad) * 80, ty - 9 - Math.sin(aRad) * 80);
            ctx.stroke(); ctx.setLineDash([]);
          } else {
            let gx = tx, gy = ty - 9;
            const gs = g.power * 0.15;
            let gvx = Math.cos(aRad) * gs, gvy = -Math.sin(aRad) * gs;
            ctx.beginPath(); ctx.setLineDash([4, 5]);
            ctx.strokeStyle = "rgba(99,102,241,0.5)"; ctx.lineWidth = 1.5; ctx.moveTo(gx, gy);
            for (let step = 0; step < 90; step++) {
              gx += gvx; gy += gvy; gvy += GRAVITY;
              const rxg = Math.round(gx);
              if (gx < 0 || gx >= WORLD_W || gy > CANVAS_H || (rxg >= 0 && rxg < WORLD_W && gy >= g.terrain[rxg])) break;
              ctx.lineTo(gx, gy);
            }
            ctx.stroke(); ctx.setLineDash([]);
          }

          // Barrel
          ctx.save(); ctx.translate(tx, ty - 9); ctx.rotate(-aRad);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0);
          ctx.strokeStyle = accentColor ?? "#334155"; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        } else {
          // Static barrel (pointing toward enemy team)
          const barrelDir = tank.dir >= 0 ? 0 : Math.PI;
          ctx.save(); ctx.translate(tx, ty - 9); ctx.rotate(barrelDir);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, -3);
          ctx.strokeStyle = accentColor ?? "#334155"; ctx.lineWidth = 3; ctx.stroke();
          ctx.restore();
        }

        // Name label
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = tank.team === "red" ? "#fca5a5" : "#93c5fd";
        ctx.fillText(tank.profile.name, tx, ty - 30);
      };

      // Draw all tanks
      g.tanks.forEach(tank => {
        const isMyTankAndMyTurn = tank.socketId === mySocketId && g.isMyTurn;
        drawTank(tank, isMyTankAndMyTurn);
      });

      // Projectiles
      g.projectiles.forEach(p => {
        const def = WEAPON_DEFS[p.type];
        if (def.isRailgun) return;
        const color = def.color;
        if (p.isMinigunBullet) {
          ctx.save(); ctx.strokeStyle = "#f1f5f9"; ctx.lineWidth = 1.5;
          ctx.shadowColor = "#38bdf8"; ctx.shadowBlur = 3;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.4, p.y - p.vy * 0.4);
          ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();
          return;
        }
        if (def.hellfire) {
          // 회색 길쭉한 탄. 박힌 뒤에는 퓨즈 진행도에 따라 점점 붉어짐
          const fuseFrac = p.embedded ? Math.min(1, (p.fuseAge ?? 0) / (def.fuseFrames ?? 60)) : 0;
          const r = Math.round(120 + fuseFrac * 135); // 78 -> ~220
          const g2 = Math.round(113 - fuseFrac * 90);
          const b2 = Math.round(108 - fuseFrac * 90);
          ctx.save();
          ctx.translate(p.x, p.y);
          const ang2 = p.embedded ? 0 : Math.atan2(p.vy, p.vx);
          ctx.rotate(ang2);
          ctx.fillStyle = `rgb(${r},${g2},${b2})`;
          ctx.beginPath(); ctx.roundRect(-9, -2.5, 18, 5, 2.5); ctx.fill();
          ctx.restore();
          if (p.embedded && Math.random() < fuseFrac * 0.5) {
            g.particles.push({ x: p.x, y: p.y - 2, vx: 0, vy: -0.3, color: "#f97316", radius: Math.random() * 1.5 + 0.5, life: 0, maxLife: 10 });
          }
          return;
        }
        const r = p.type === "heavy" ? 6 : p.type === "sniper" ? 3 : p.type === "mine" ? 5 : p.type === "emp" ? 5 : p.type === "constellation" ? 4.5 : p.type === "supernova" ? 6 : 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (p.type === "constellation" || p.type === "supernova") {
          ctx.save();
          ctx.shadowColor = color; ctx.shadowBlur = 10;
          ctx.fillStyle = color; ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = color; ctx.fill();
        }
        if (Math.random() < 0.5) {
          g.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.08, vy: -p.vy * 0.08, color, radius: Math.random() * 2 + 0.5, life: 0, maxLife: 8 });
        }
      });

      ctx.restore(); // end camera transform

      // ─ Mini-map (no camera offset) ─
      const mmW = 160, mmH = 36, mmX = VIEW_W - mmW - 8, mmY = 8;
      const mmScaleX = mmW / WORLD_W, mmScaleH = mmH / CANVAS_H;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath(); ctx.roundRect(mmX, mmY, mmW, mmH, 6); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1; ctx.stroke();
      // Terrain line on minimap
      ctx.beginPath();
      for (let x = 0; x < WORLD_W; x += 4) {
        const mx = mmX + x * mmScaleX;
        const my = mmY + g.terrain[x] * mmScaleH;
        if (x === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
      }
      ctx.strokeStyle = "#c9975c"; ctx.lineWidth = 1; ctx.stroke();
      // Tanks on minimap
      g.tanks.forEach(t => {
        if (t.dead) return;
        const mx = mmX + t.x * mmScaleX;
        const my = mmY + t.y * mmScaleH;
        ctx.beginPath(); ctx.arc(mx, my - 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = t.team === "red" ? "#f87171" : "#60a5fa";
        // Highlight current active tank
        if (t.socketId === g.activeSocketId) {
          ctx.shadowColor = t.team === "red" ? "#f87171" : "#60a5fa"; ctx.shadowBlur = 6;
        }
        ctx.fill(); ctx.shadowBlur = 0;
      });
      // Camera viewport indicator
      const vx1 = mmX + camOffset * mmScaleX;
      const vx2 = mmX + (camOffset + VIEW_W) * mmScaleX;
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1;
      ctx.strokeRect(vx1, mmY, vx2 - vx1, mmH);
      ctx.restore();

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [socket, roomName, myProfile, initialSeed, onGameEnded]);

  // ── Mouse & Touch Aiming ────────────────────────────────────────────────
  const isPointerDownRef = useRef(false);

  const updateAiming = (clientX: number, clientY: number) => {
    const g = G.current;
    if (!g.isMyTurn || g.projectiles.length > 0 || g.firedThisTurn || g.gameOver || !canvasRef.current) return;
    const me = g.tanks.find(t => t.socketId === mySocketId);
    if (!me || me.dead) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = VIEW_W / rect.width;
    const scaleY = VIEW_H / rect.height;
    // Convert screen position to world position using camera offset
    const mx = (clientX - rect.left) * scaleX + g.camX;
    const my = (clientY - rect.top) * scaleY;
    const dx = mx - me.x;
    const dy = (me.y - 9) - my;
    let ang = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    ang = Math.max(0, Math.min(180, ang));
    const pwr = Math.min(100, Math.max(10, Math.round(Math.hypot(dx, dy) * 0.4)));
    g.angle = ang; g.power = pwr;
    setUiAngle(ang); setUiPower(pwr);
  };

  const handleFireBtn = () => {
    const g = G.current;
    if (!g.isMyTurn || g.projectiles.length > 0 || g.firedThisTurn || g.gameOver) return;
    const me = g.tanks.find(t => t.socketId === mySocketId);
    if (!me || me.dead) return;
    g.firedThisTurn = true;
    if (WEAPON_DEFS[g.weapon].isMoveShot) {
      launchMoveShot(mySocketId, g.angle, g.power);
    } else {
      spawnProjectile(me.x, me.y, g.angle, g.power, g.weapon, mySocketId);
    }
    socket.emit("game-action", {
      roomName,
      action: { type: "fire", x: me.x, y: me.y, angle: g.angle, power: g.power, weapon: g.weapon, socketId: mySocketId },
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isPointerDownRef.current = true;
    updateAiming(e.clientX, e.clientY);
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => { updateAiming(e.clientX, e.clientY); };
  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isPointerDownRef.current = false;
    updateAiming(e.clientX, e.clientY);
    handleFireBtn();
  };
  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) updateAiming(e.touches[0].clientX, e.touches[0].clientY);
  };
  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) updateAiming(e.touches[0].clientX, e.touches[0].clientY);
  };

  const cycleWeapon = () => {
    const g = G.current;
    if (!g.isMyTurn) return;
    const idx = myWeapons.indexOf(g.weapon);
    const next = myWeapons[(idx + 1) % myWeapons.length];
    g.weapon = next; setUiWeapon(next);
  };
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => { e.preventDefault(); cycleWeapon(); };

  const handleTouchMoveStart = (code: string) => { G.current.keys[code] = true; };
  const handleTouchMoveEnd = (code: string) => { G.current.keys[code] = false; };

  const weaponDef = WEAPON_DEFS[uiWeapon];

  // Partition players for HUD display
  const redPlayers = allPlayers.filter(p => p.team === "red");
  const bluePlayers = allPlayers.filter(p => p.team === "blue");

  return (
    <div style={styles.wrapper}>
      {/* HUD Top: Red Team | Turn Info | Blue Team */}
      <div style={styles.hud}>
        {/* Red Team */}
        <div style={styles.teamHud}>
          <div style={styles.teamHudLabel}>🔴 레드팀</div>
          {redPlayers.map(p => {
            const maxHp = TANKS[p.profile.tankId ?? DEFAULT_TANK_ID].maxHp;
            const hp = uiTankHps[p.socketId] ?? maxHp;
            const isActive = G.current.activeSocketId === p.socketId;
            const isMe = p.socketId === mySocketId;
            return (
              <div key={p.socketId} style={{ ...styles.playerHudRow, opacity: hp <= 0 ? 0.4 : 1 }}>
                <img src={p.profile.image} alt={p.profile.name} style={{ ...styles.hudAvatar, borderColor: "#f87171", boxShadow: isActive ? "0 0 8px #f87171" : "none" }} />
                <div style={styles.hudInfo}>
                  <div style={styles.hudName}>
                    {isMe && <span style={{ color: "#fbbf24", fontSize: "9px" }}>◀ </span>}
                    {p.profile.name}
                    {isActive && <span style={{ color: "#f87171", fontSize: "9px" }}> ●</span>}
                  </div>
                  <StatBar value={hp} max={maxHp} color="#ef4444" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Center */}
        <div style={styles.hudCenter}>
          {uiIsMyTurn
            ? <div style={styles.myTurn}>내 차례 💥</div>
            : <div style={styles.oppTurn}>{uiActiveName}의 차례 ⏳</div>}
          <div style={styles.timer}>{uiTimer}초</div>
          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>{mode.toUpperCase()}</div>
        </div>

        {/* Blue Team */}
        <div style={{ ...styles.teamHud, alignItems: "flex-end" }}>
          <div style={{ ...styles.teamHudLabel, color: "#60a5fa" }}>🔵 블루팀</div>
          {bluePlayers.map(p => {
            const maxHp = TANKS[p.profile.tankId ?? DEFAULT_TANK_ID].maxHp;
            const hp = uiTankHps[p.socketId] ?? maxHp;
            const isActive = G.current.activeSocketId === p.socketId;
            const isMe = p.socketId === mySocketId;
            return (
              <div key={p.socketId} style={{ ...styles.playerHudRow, flexDirection: "row-reverse", opacity: hp <= 0 ? 0.4 : 1 }}>
                <img src={p.profile.image} alt={p.profile.name} style={{ ...styles.hudAvatar, borderColor: "#60a5fa", boxShadow: isActive ? "0 0 8px #60a5fa" : "none" }} />
                <div style={{ ...styles.hudInfo, alignItems: "flex-end" }}>
                  <div style={styles.hudName}>
                    {isMe && <span style={{ color: "#fbbf24", fontSize: "9px" }}> ▶</span>}
                    {p.profile.name}
                    {isActive && <span style={{ color: "#60a5fa", fontSize: "9px" }}>● </span>}
                  </div>
                  <StatBar value={hp} max={maxHp} color="#ef4444" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Canvas */}
      <div style={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          style={styles.canvas}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onWheel={handleWheel}
        />
      </div>

      {/* Control Bar */}
      <div style={styles.controlBar}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onTouchStart={() => handleTouchMoveStart("KeyA")} onTouchEnd={() => handleTouchMoveEnd("KeyA")} onMouseDown={() => handleTouchMoveStart("KeyA")} onMouseUp={() => handleTouchMoveEnd("KeyA")} style={styles.mobileDirBtn}>◀ A (좌)</button>
          <button onTouchStart={() => handleTouchMoveStart("KeyD")} onTouchEnd={() => handleTouchMoveEnd("KeyD")} onMouseDown={() => handleTouchMoveStart("KeyD")} onMouseUp={() => handleTouchMoveEnd("KeyD")} style={styles.mobileDirBtn}>D (우) ▶</button>
        </div>
        {/* My fuel bar (shown only on my turn) */}
        {uiIsMyTurn && (
          <div style={styles.fuelDisplay}>
            <Zap size={12} color="#eab308" />
            <div style={{ width: "80px", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${(uiMyFuel / myTankDef.maxFuel) * 100}%`, height: "100%", background: "#eab308", borderRadius: "3px", transition: "width 0.1s" }} />
            </div>
            <span style={{ fontSize: "10px", color: "#eab308" }}>{Math.round(uiMyFuel)}</span>
          </div>
        )}
        <button onClick={cycleWeapon} style={{ ...styles.weaponToggleBtn, borderColor: weaponDef.color }}>
          <span style={{ color: weaponDef.color, fontWeight: "bold" }}>{weaponDef.label}</span>
          <span style={{ fontSize: "10px", color: "#94a3b8" }}>(터치하여 무기 변경)</span>
        </button>
        <button onClick={handleFireBtn} disabled={!uiIsMyTurn} style={{ ...styles.fireBtn, opacity: uiIsMyTurn ? 1 : 0.4, cursor: uiIsMyTurn ? "pointer" : "not-allowed" }}>
          🚀 발사! ({uiAngle}° / {uiPower}P)
        </button>
      </div>
    </div>
  );
}

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ width: "100px", height: "5px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden", marginTop: "2px" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "3px", transition: "width 0.3s" }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: "flex", flexDirection: "column", gap: "8px", width: "100%", maxWidth: "960px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "12px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6)", boxSizing: "border-box" },
  hud: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: "10px", gap: "6px" },
  teamHud: { display: "flex", flexDirection: "column", gap: "6px", flex: 1 },
  teamHudLabel: { fontSize: "11px", fontWeight: "bold", color: "#f87171", marginBottom: "2px", letterSpacing: "0.5px" },
  playerHudRow: { display: "flex", alignItems: "center", gap: "6px" },
  hudAvatar: { width: "32px", height: "32px", borderRadius: "50%", border: "2px solid", objectFit: "cover", background: "#fff", flexShrink: 0 },
  hudInfo: { display: "flex", flexDirection: "column", minWidth: 0 },
  hudName: { fontSize: "10px", fontWeight: "700", color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100px" },
  hudCenter: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flexShrink: 0, padding: "0 8px" },
  myTurn: { background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", padding: "4px 12px", borderRadius: "20px", fontWeight: "bold", fontSize: "12px", boxShadow: "0 0 12px rgba(16,185,129,0.4)", whiteSpace: "nowrap" },
  oppTurn: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "4px 10px", borderRadius: "20px", fontWeight: "bold", fontSize: "11px", whiteSpace: "nowrap", maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" },
  timer: { fontSize: "11px", color: "#94a3b8" },
  canvasWrap: { width: "100%", aspectRatio: `${VIEW_W} / ${VIEW_H}`, borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", cursor: "crosshair", position: "relative", touchAction: "none" },
  canvas: { width: "100%", height: "100%", display: "block", touchAction: "none" },
  controlBar: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(15,23,42,0.6)", borderRadius: "12px", padding: "10px 12px", gap: "8px", flexWrap: "wrap" },
  fuelDisplay: { display: "flex", alignItems: "center", gap: "4px" },
  mobileDirBtn: { padding: "10px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.1)", color: "#ffffff", fontSize: "13px", fontWeight: "bold", cursor: "pointer", userSelect: "none", touchAction: "manipulation" },
  weaponToggleBtn: { display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 14px", borderRadius: "8px", border: "1.5px solid", backgroundColor: "rgba(15,23,42,0.8)", cursor: "pointer", touchAction: "manipulation" },
  fireBtn: { flex: 1, minWidth: "120px", padding: "12px 18px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", color: "#ffffff", fontSize: "14px", fontWeight: "bold", boxShadow: "0 4px 12px rgba(239,68,68,0.4)", touchAction: "manipulation" },
};
