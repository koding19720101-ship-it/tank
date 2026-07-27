// 패치노트 기록 - 최신 항목이 배열 맨 앞에 오도록 추가해주세요.
export interface PatchNote {
  date: string; // YYYY.MM.DD
  title: string;
  changes: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    date: "2026.07.27",
    title: "밸런스 조정",
    changes: [
      "[포레스트 너프] 체력 135 → 125",
      "[포레스트 너프] 세계수탄 피해량 20 → 15",
      "[포레스트 버프] 플라워탄 각도 변환 범위 ±15 → ±17",
      "[포레스트 버프] 덩쿨탄 이동속도 감소량 50% → 15% (단, 중첩 가능)",
      "[볼트 너프] EMP탄 피해량 15 → 10",
    ],
  },
];
