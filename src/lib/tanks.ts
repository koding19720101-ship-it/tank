// 탱크 및 무기 설정 데이터
export type WeaponId = "heavy" | "sniper" | "cluster" | "buckshot" | "incendiary" | "mine";

export interface WeaponDef {
  label: string;
  color: string;
  radius: number;      // 폭발 반경
  maxDmg: number;       // 직격 데미지 (중심부 기준)
  splitCount?: number;  // 분열 개수 (집속탄류)
  splitDamage?: number; // 분열탄 개당 데미지
  incendiary?: boolean; // 적중시 화상(도트뎀) 부여
  isMine?: boolean;     // 지뢰류 (착탄시 즉시 폭발하지 않고 설치됨)
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  heavy: { label: "해비탄 💣", color: "#ef4444", radius: 42, maxDmg: 20 },
  sniper: { label: "저격탄 ⚡", color: "#60a5fa", radius: 18, maxDmg: 20 },
  cluster: { label: "집속탄 ✴️", color: "#a78bfa", radius: 22, maxDmg: 8, splitCount: 3, splitDamage: 5 },
  buckshot: { label: "집속탄 🔹", color: "#38bdf8", radius: 16, maxDmg: 3, splitCount: 5, splitDamage: 3 },
  incendiary: { label: "소이탄 🔥", color: "#f97316", radius: 16, maxDmg: 3, splitCount: 5, splitDamage: 3, incendiary: true },
  mine: { label: "지뢰 💠", color: "#84cc16", radius: 34, maxDmg: 26, isMine: true },
};

export type TankId = "chrome" | "shotgun";

export interface TankConfig {
  id: TankId;
  name: string;
  tag: string;
  bodyColor: string;
  maxHp: number;
  maxFuel: number;
  weapons: WeaponId[];
  description: string;
}

export const TANKS: Record<TankId, TankConfig> = {
  chrome: {
    id: "chrome",
    name: "크롬 (Chrome)",
    tag: "기본형 탱크",
    bodyColor: "#7889a4",
    maxHp: 100,
    maxFuel: 100,
    weapons: ["heavy", "sniper", "cluster"],
    description: "회색의 날렵한 바디를 가진 탱크입니다. 균형 잡힌 기동력과 고성능 조준 시스템을 기반으로 한 전술 포격에 최적화되어 있습니다.",
  },
  shotgun: {
    id: "shotgun",
    name: "샷건 (Shotgun)",
    tag: "근접 산탄형 탱크",
    bodyColor: "#38bdf8",
    maxHp: 80,
    maxFuel: 150,
    weapons: ["buckshot", "incendiary", "mine"],
    description: "하늘색 바디의 기동형 탱크. 체력은 낮지만 넉넉한 연료로 재빠르게 움직이며, 산탄과 화염, 지뢰로 전장을 뒤흔듭니다.",
  },
};

export const DEFAULT_TANK_ID: TankId = "chrome";
export const TANK_ORDER: TankId[] = ["chrome", "shotgun"];
