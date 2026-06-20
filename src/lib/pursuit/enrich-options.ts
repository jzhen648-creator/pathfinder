export type PursuitEnrichOptions = {
  /** Title disambiguation MC when pursuit is ambiguous. Default true. */
  clarifyTitles?: boolean;
};

export const DEFAULT_PURSUIT_ENRICH_OPTIONS: Required<PursuitEnrichOptions> = {
  clarifyTitles: true,
};

export function resolvePursuitEnrichOptions(
  raw?: PursuitEnrichOptions | null,
): Required<PursuitEnrichOptions> {
  return {
    clarifyTitles: raw?.clarifyTitles !== false,
  };
}
