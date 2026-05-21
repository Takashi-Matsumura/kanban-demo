const STAGE_EQUIPMENT_TYPE: Record<string, string> = {
  firstProof: "proofer",
  finalProof: "proofer",
  bake: "oven",
};

export function equipmentTypeForStage(stageType: string | null): string | null {
  if (!stageType) return null;
  return STAGE_EQUIPMENT_TYPE[stageType] ?? null;
}
