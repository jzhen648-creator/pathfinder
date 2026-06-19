export type PursuitEnrichOptions = {
  /** Title disambiguation MC when pursuit is ambiguous. Default true. */
  clarifyTitles?: boolean;
  /** Include marks in scoped enrich context. Default false on mobile-first product. */
  includeMarks?: boolean;
};

export const DEFAULT_PURSUIT_ENRICH_OPTIONS: Required<PursuitEnrichOptions> = {
  clarifyTitles: true,
  includeMarks: false,
};

export function resolvePursuitEnrichOptions(
  raw?: PursuitEnrichOptions | null,
): Required<PursuitEnrichOptions> {
  return {
    clarifyTitles: raw?.clarifyTitles !== false,
    includeMarks: raw?.includeMarks === true,
  };
}
