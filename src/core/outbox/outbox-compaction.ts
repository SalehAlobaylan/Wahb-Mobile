/**
 * Document the compaction invariant independently of SQLite: progress can
 * replace a prior checkpoint only when no semantic event sits between them.
 */
export function canCompactProgress(
  priorSequence: number,
  latestSemanticSequence: number | null,
): boolean {
  return (
    latestSemanticSequence === null || priorSequence > latestSemanticSequence
  );
}
