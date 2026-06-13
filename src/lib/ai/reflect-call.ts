/** Phase 1 unified reflect — one Gemini call for Reading + pursuit panels. */
export function isReflectCallEnabled(): boolean {
  return process.env.USE_REFLECT_CALL === "true";
}
