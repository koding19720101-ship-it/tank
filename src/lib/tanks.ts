// 탱크 및 무기 설정 데이터
export type WeaponId =
  | "heavy" | "sniper" | "cluster"
  | "buckshot" | "incendiary" | "mine"
  | "vine" | "tree" | "flower"
  | "emp" | "minigun" | "railgun"
  | "moveshot" | "bouncyball" | "trickshot"
  | "flamethrower" | "volcano" | "hellfire"
  | "satellite" | "constellation" | "supernova"
  | "drill" | "cavern" | "sawblade";

export type GroundEffect = "mine" | "vine" | "tree" | "emp";

export interface WeaponDef {
  label: string;
  color: string;
  radius: number;        // 폭발/효과 반경
  maxDmg: number;         // 직격 데미지 (중심부 기준)
  splitCount?: number;    // 분열 개수 (집속탄류)
  splitDamage?: number;   // 분열탄 개당 데미지
  splitDelay?: number;    // 분열까지 걸리는 프레임 수 (작을수록 즉시 분열)
  spreadFactor?: number;  // 분열탄 퍼짐 정도 (작을수록 좁게 퍼짐)
  splitAngleDeg?: number; // 분열시 전체 퍼짐 각도(도) - 지정시 spreadFactor 대신 이 각도로 균등 분산
  incendiary?: boolean;   // 적중시 화상(도트뎀) 부여
  groundEffect?: GroundEffect; // 착탄시 폭발 대신 설치되는 효과물
  flowerEffect?: boolean; // 적중시 상대(피격자)의 조준 각도를 랜덤하게 흐트러뜨림
  isEmp?: boolean;       // EMP 폭발 효과
  isMinigun?: boolean;   // 미니건 연사 효과
  isRailgun?: boolean;   // 레일건 조준/지속 타격 효과
  isMoveShot?: boolean;  // 이동탄: 자신의 몸이 포탄 대신 날아감
  selfDamage?: number;   // 이동탄류: 적중시 자신이 입는 반동 데미지
  bouncy?: boolean;      // 탱탱볼류: 지형에 닿을때 튕겨다님
  maxBounces?: number;   // 최대 튕김 횟수
  trickshot?: boolean;   // 트릭샷: 일직선 비행 후 급강하
  straightFrames?: number; // 트릭샷: 급강하 전까지 직진하는 프레임 수
  burnTicks?: number;    // 화상 지속 틱 수 커스텀 (미지정시 기본값 사용, 클수록 오래 붙음)
  isFlamethrower?: boolean; // 화염방사기: 전방 원뿔형 즉발 화염
  flameRange?: number;      // 화염방사기 사거리
  hellfire?: boolean;       // 지옥의 불: 착탄 후 지연 폭발(점점 붉어짐)
  fuseFrames?: number;      // 지옥의 불: 착탄 후 폭발까지 걸리는 프레임 수
  burnsHazards?: boolean;   // 세계수(나무)/덩쿨 지형지물을 태워 없앨 수 있음
  isSatellite?: boolean;    // 위성폭격: 착탄 지점에 위에서 내려오는 성장형 레이저 빔 소환
  beamDmgPerSec?: number;   // 위성폭격 빔: 초당 데미지
  beamDurationMs?: number;  // 위성폭격 빔: 지속시간(ms)
  beamMaxWidth?: number;    // 위성폭격 빔: 최대 폭
  isConstellation?: boolean; // 별자리: 빛나는 탄을 연속 발사, 탄끼리 선으로 연결됨
  orbCount?: number;         // 별자리: 발사하는 탄 개수
  orbDelayFrames?: number;   // 별자리: 탄 사이 발사 간격(프레임)
  lineDamage?: number;       // 별자리: 연결선에 닿았을때 데미지
  isSupernova?: boolean;     // 초신성: 적중시 연쇄 폭발
  chainCount?: number;       // 초신성: 총 연쇄 폭발 횟수(최초 폭발 포함)
  chainDelayFrames?: number; // 초신성: 연쇄 폭발 사이 간격(프레임)
  chainRadius?: number;      // 초신성: 연쇄 폭발 개별 반경
  chainDmg?: number;         // 초신성: 연쇄 폭발 개별 데미지
  isDrill?: boolean;         // 드릴: 지형을 뚫고 지나가며 적 근접시 폭발
  isCavern?: boolean;        // 동굴: 자신이 전진하며 굴착, 전방에 거대 드릴 등장
  caveDurationMs?: number;   // 동굴: 굴착 지속시간(ms)
  caveDmgPerTick?: number;   // 동굴: 전방 드릴의 초당 데미지
  caveMoveSpeed?: number;    // 동굴: 굴착 중 이동 속도
  caveTunnelRadius?: number; // 동굴: 굴착 터널 반경
  isSawblade?: boolean;      // 회전톱: 지형을 따라 굴러가는 원형톱
  rollDurationMs?: number;   // 회전톱: 굴러가는 지속시간(ms)
  rollSpeed?: number;        // 회전톱: 굴러가는 속도
  rollHitCooldownMs?: number; // 회전톱: 동일 탱크 재피격 쿨다운(ms)
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  heavy: { label: "해비탄 💣", color: "#ef4444", radius: 42, maxDmg: 20 },
  sniper: { label: "저격탄 ⚡", color: "#60a5fa", radius: 18, maxDmg: 20 },
  cluster: { label: "집속탄 ✴️", color: "#a78bfa", radius: 22, maxDmg: 8, splitCount: 3, splitDamage: 5, splitDelay: 45, spreadFactor: 1.7 },
  buckshot: { label: "집속탄 🔹", color: "#38bdf8", radius: 16, maxDmg: 6, splitCount: 5, splitDamage: 6, splitDelay: 2, splitAngleDeg: 30 },
  incendiary: { label: "소이탄 🔥", color: "#f97316", radius: 16, maxDmg: 3, splitCount: 5, splitDamage: 3, splitDelay: 2, splitAngleDeg: 30, incendiary: true },
  mine: { label: "지뢰 💠", color: "#84cc16", radius: 34, maxDmg: 20, groundEffect: "mine" },
  vine: { label: "덩쿨탄 🌿", color: "#65a30d", radius: 16, maxDmg: 2, splitCount: 5, splitDamage: 2, splitDelay: 2, spreadFactor: 1.05, groundEffect: "vine" },
  tree: { label: "세계수 🌳", color: "#16a34a", radius: 34, maxDmg: 15, groundEffect: "tree" },
  flower: { label: "플라워탄 🌸", color: "#f472b6", radius: 24, maxDmg: 12, flowerEffect: true },
  emp: { label: "EMP탄 ⚡", color: "#facc15", radius: 32, maxDmg: 10, isEmp: true, groundEffect: "emp" },
  minigun: { label: "미니건 🔫", color: "#cbd5e1", radius: 6, maxDmg: 1, isMinigun: true },
  railgun: { label: "레일건 🔮", color: "#38bdf8", radius: 12, maxDmg: 10, isRailgun: true },
  moveshot: { label: "이동탄 💨", color: "#f8fafc", radius: 26, maxDmg: 20, isMoveShot: true, selfDamage: 7 },
  bouncyball: { label: "탱탱볼 🎀", color: "#f9a8d4", radius: 18, maxDmg: 5, splitCount: 5, splitDamage: 5, splitDelay: 2, splitAngleDeg: 30, bouncy: true, maxBounces: 5 },
  trickshot: { label: "트릭샷 🎯", color: "#fda4af", radius: 30, maxDmg: 22, trickshot: true, straightFrames: 32 },
  flamethrower: { label: "화염방사기 🔥", color: "#fb923c", radius: 20, maxDmg: 3, isFlamethrower: true, flameRange: 130, burnTicks: 4, burnsHazards: true },
  volcano: { label: "화산 🌋", color: "#f97316", radius: 20, maxDmg: 7, splitCount: 5, splitDamage: 7, splitDelay: 2, splitAngleDeg: 32, incendiary: true, burnTicks: 8, burnsHazards: true },
  hellfire: { label: "지옥의 불 😈", color: "#78716c", radius: 95, maxDmg: 17, hellfire: true, fuseFrames: 75, incendiary: true, burnTicks: 8, burnsHazards: true },
  satellite: { label: "위성폭격 🛰️", color: "#a78bfa", radius: 26, maxDmg: 0, isSatellite: true, beamDmgPerSec: 10, beamDurationMs: 2600, beamMaxWidth: 70 },
  constellation: { label: "별자리 ✨", color: "#f8fafc", radius: 16, maxDmg: 8, isConstellation: true, orbCount: 7, orbDelayFrames: 6, lineDamage: 3 },
  supernova: { label: "초신성 🌟", color: "#fef9c3", radius: 46, maxDmg: 11, isSupernova: true, chainCount: 7, chainDelayFrames: 10, chainRadius: 48, chainDmg: 9 },
  drill: { label: "드릴 🔩", color: "#a16207", radius: 22, maxDmg: 14, splitCount: 3, splitDamage: 14, splitDelay: 2, splitAngleDeg: 22, isDrill: true },
  cavern: { label: "동굴 🕳️", color: "#78350f", radius: 0, maxDmg: 0, isCavern: true, caveDurationMs: 1800, caveDmgPerTick: 5, caveMoveSpeed: 3.2, caveTunnelRadius: 30 },
  sawblade: { label: "회전톱 ⚙️", color: "#71717a", radius: 16, maxDmg: 7, isSawblade: true, rollDurationMs: 3000, rollSpeed: 3.5, rollHitCooldownMs: 500 },
};

export type TankId = "chrome" | "shotgun" | "forest" | "bolt" | "oat" | "inferno" | "cosmo" | "mole";

export interface TankConfig {
  id: TankId;
  name: string;
  tag: string;
  bodyColor: string;
  maxHp: number;
  maxFuel: number;
  weapons: WeaponId[];
  description: string;
  accentColor?: string; // 몸체 테두리 강조색 (지정시 바디 테두리에 표시)
  passive?: "blackhole"; // 특수 패시브: 사망시 발동하는 효과
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
  forest: {
    id: "forest",
    name: "포레스트 (Forest)",
    tag: "자연 교란형 탱크",
    bodyColor: "#22c55e",
    maxHp: 125,
    maxFuel: 60,
    weapons: ["vine", "tree", "flower"],
    description: "숲의 힘을 다루는 탱크. 직접적인 화력보다는 덩쿨, 나무, 꽃가루로 전장의 지형과 상대의 움직임/조준을 교란시킵니다.",
  },
  bolt: {
    id: "bolt",
    name: "볼트 (Bolt)",
    tag: "전자기 제어형 탱크",
    bodyColor: "#ffffff",
    maxHp: 110,
    maxFuel: 110,
    weapons: ["emp", "minigun", "railgun"],
    description: "순백의 바디를 가진 첨단 전자기 탱크. EMP 수류탄으로 이동을 방해하고, 20연사 미니건과 일직선 감응형 레일건으로 압도적 화력을 퍼붓습니다.",
  },
  oat: {
    id: "oat",
    name: "오트 (Oat)",
    tag: "특수 기동형 탱크",
    bodyColor: "#ffffff",
    maxHp: 90,
    maxFuel: 100,
    weapons: ["moveshot", "bouncyball", "trickshot"],
    description: "하얀 몸체에 분홍 테두리를 두른 탱크. 자신의 몸을 직접 포탄처럼 날리는 이동탄, 튕겨다니는 탱탱볼, 급강하하는 트릭샷 등 예측 불가능한 기동형 공격을 구사합니다.",
    accentColor: "#f472b6",
  },
  inferno: {
    id: "inferno",
    name: "인페르노 (Inferno)",
    tag: "화염 특화형 탱크",
    bodyColor: "#c2410c",
    maxHp: 110,
    maxFuel: 120,
    weapons: ["flamethrower", "volcano", "hellfire"],
    description: "짙은 주황 몸체에 옅은 주황 테두리를 두른 화염 특화 탱크. 화염방사기, 화산탄, 지옥의 불로 전장을 불태웁니다. 세계수의 나무와 덩쿨탄의 덩쿨 같은 식물성 지형지물을 태워 없앨 수 있습니다.",
    accentColor: "#fdba74",
  },
  cosmo: {
    id: "cosmo",
    name: "코스모 (Cosmo)",
    tag: "우주 재해형 탱크",
    bodyColor: "#0f172a",
    maxHp: 95,
    maxFuel: 90,
    weapons: ["satellite", "constellation", "supernova"],
    description: "검은 몸체에 하얀 테두리를 두른 우주 재해형 탱크. 위성에서 내려찍는 레이저 빔, 서로 이어진 별자리탄, 연쇄 폭발하는 초신성으로 전장을 재앙에 빠뜨립니다. 사망 시 그 자리에 블랙홀을 남겨 주변을 빨아들이며 피해를 입힙니다.",
    accentColor: "#ffffff",
    passive: "blackhole",
  },
  mole: {
    id: "mole",
    name: "몰 (Mole)",
    tag: "굴착 특화형 탱크",
    bodyColor: "#78350f",
    maxHp: 110,
    maxFuel: 120,
    weapons: ["drill", "cavern", "sawblade"],
    description: "갈색 몸체의 굴착 특화 탱크. 회전하는 드릴로 지형을 뚫고, 스스로 파고드는 동굴 돌진으로 밀어붙이며, 굴러가는 회전톱으로 지나가는 길목을 초토화시킵니다.",
  },
};

export const DEFAULT_TANK_ID: TankId = "chrome";
export const TANK_ORDER: TankId[] = ["chrome", "shotgun", "forest", "bolt", "oat", "inferno", "cosmo", "mole"];
