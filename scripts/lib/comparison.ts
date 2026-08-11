export type ComparisonVerdict = "IMPROVED" | "MIXED" | "NOT_IMPROVED";

type DimensionScores = {
  baseline: number;
  directorCut: number;
};

export const classifyComparisonVerdict = (
  dimensions: Readonly<Record<string, DimensionScores>>,
): ComparisonVerdict => {
  const scores = Object.values(dimensions);
  const totalChange = scores.reduce(
    (total, dimension) => total + dimension.directorCut - dimension.baseline,
    0,
  );
  const allDimensionsImproved = scores.every(
    (dimension) => dimension.directorCut > dimension.baseline,
  );

  if (allDimensionsImproved && totalChange >= 6) return "IMPROVED";
  if (totalChange <= 0) return "NOT_IMPROVED";
  return "MIXED";
};

export const signedScore = (score: number): string => (score >= 0 ? `+${score}` : String(score));
