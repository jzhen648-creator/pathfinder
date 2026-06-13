export type PursuitEnrichOptions = {
  /** Title disambiguation MC when pursuit is ambiguous. Default true. */
  clarifyTitles?: boolean;
  /** Cross-pursuit connection questions (experimental). Default false. */
  suggestConnections?: boolean;
  /** Include marks in scoped enrich context. Default false on mobile-first product. */
  includeMarks?: boolean;
};

export const DEFAULT_PURSUIT_ENRICH_OPTIONS: Required<PursuitEnrichOptions> = {
  clarifyTitles: true,
  suggestConnections: false,
  includeMarks: false,
};

export function resolvePursuitEnrichOptions(
  raw?: PursuitEnrichOptions | null,
): Required<PursuitEnrichOptions> {
  return {
    clarifyTitles: raw?.clarifyTitles !== false,
    suggestConnections: raw?.suggestConnections === true,
    includeMarks: raw?.includeMarks === true,
  };
}
