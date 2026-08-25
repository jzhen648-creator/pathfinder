export const ALMANAC_DOGFOOD_SERVER_FLAG = "ALMANAC_PERSISTED_DOGFOOD_ENABLED";

export function parseAlmanacDogfoodFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function almanacDogfoodEnabled(): boolean {
  return parseAlmanacDogfoodFlag(process.env[ALMANAC_DOGFOOD_SERVER_FLAG]);
}
