export const ALMANAC_PROTOCOL_VERSION = "ALMANAC/1";
export const ALMANAC_IMPORT_SCOPES = ["chat", "project", "bootstrap"] as const;
export const ALMANAC_UPDATE_STATES = ["NOW", "DONE", "NEXT", "OPEN"] as const;

export type AlmanacImportScopeValue = (typeof ALMANAC_IMPORT_SCOPES)[number];
export type AlmanacUpdateStateValue = (typeof ALMANAC_UPDATE_STATES)[number];

export const ALMANAC_UPDATE_LIMITS: Readonly<Record<AlmanacImportScopeValue, number>> = {
  chat: 5,
  project: 10,
  bootstrap: 12,
};

export const ALMANAC_RAW_PACKET_MAX_LENGTH = 20_000;
export const ALMANAC_PLACE_NAME_MAX_LENGTH = 80;
export const ALMANAC_UPDATE_TEXT_MAX_LENGTH = 500;

export type AlmanacPacketErrorCode =
  | "invalid_header"
  | "invalid_scope"
  | "excess_updates"
  | "invalid_delimiters"
  | "missing_place"
  | "place_too_long"
  | "invalid_state"
  | "missing_statement"
  | "statement_too_long";

export type AlmanacPacketError = {
  code: AlmanacPacketErrorCode;
  lineNumber: number;
  raw: string;
  message: string;
};

export type AlmanacParsedUpdate = {
  lineNumber: number;
  raw: string;
  placeName: string;
  state: AlmanacUpdateStateValue;
  statement: string;
};

export type AlmanacParsedPacket = {
  rawPacket: string;
  scope: AlmanacImportScopeValue | null;
  updateLineCount: number;
  updates: AlmanacParsedUpdate[];
  invalidLines: AlmanacPacketError[];
  fatalErrors: AlmanacPacketError[];
};

export function normaliseAlmanacText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-GB");
}

export function normaliseAlmanacPlaceName(value: string): string {
  return normaliseAlmanacText(value);
}

export function almanacUpdateFingerprint(
  state: AlmanacUpdateStateValue,
  statement: string,
): string {
  return `${state}\u001f${normaliseAlmanacText(statement)}`;
}

function isScope(value: string): value is AlmanacImportScopeValue {
  return (ALMANAC_IMPORT_SCOPES as readonly string[]).includes(value);
}

function isState(value: string): value is AlmanacUpdateStateValue {
  return (ALMANAC_UPDATE_STATES as readonly string[]).includes(value);
}

function issue(
  code: AlmanacPacketErrorCode,
  lineNumber: number,
  raw: string,
  message: string,
): AlmanacPacketError {
  return { code, lineNumber, raw, message };
}

export function parseAlmanacPacket(rawPacket: string): AlmanacParsedPacket {
  const lines = rawPacket.split(/\r?\n/u).map((raw, index) => ({
    raw,
    text: raw.trim(),
    lineNumber: index + 1,
  }));
  const nonBlank = lines.filter((line) => line.text.length > 0);
  const fatalErrors: AlmanacPacketError[] = [];
  const invalidLines: AlmanacPacketError[] = [];

  const header = nonBlank[0];
  if (!header || header.text !== ALMANAC_PROTOCOL_VERSION) {
    fatalErrors.push(
      issue(
        "invalid_header",
        header?.lineNumber ?? 1,
        header?.raw ?? "",
        `The first non-blank line must be exactly ${ALMANAC_PROTOCOL_VERSION}.`,
      ),
    );
  }

  const scopeLine = nonBlank[1];
  const scopeValue = scopeLine?.text.startsWith("scope: ")
    ? scopeLine.text.slice("scope: ".length)
    : "";
  const scope = isScope(scopeValue) ? scopeValue : null;
  if (!scopeLine || !scope) {
    fatalErrors.push(
      issue(
        "invalid_scope",
        scopeLine?.lineNumber ?? (header?.lineNumber ?? 1) + 1,
        scopeLine?.raw ?? "",
        "The second non-blank line must be scope: chat, scope: project or scope: bootstrap.",
      ),
    );
  }

  const body = nonBlank.slice(2);
  if (scope && body.length > ALMANAC_UPDATE_LIMITS[scope]) {
    fatalErrors.push(
      issue(
        "excess_updates",
        body[ALMANAC_UPDATE_LIMITS[scope]]?.lineNumber ?? scopeLine?.lineNumber ?? 2,
        body[ALMANAC_UPDATE_LIMITS[scope]]?.raw ?? "",
        `${scope[0]!.toUpperCase()}${scope.slice(1)} packets allow at most ${ALMANAC_UPDATE_LIMITS[scope]} Update lines.`,
      ),
    );
  }

  const updates: AlmanacParsedUpdate[] = [];
  for (const line of body) {
    const fields = line.raw.split("|");
    if (fields.length !== 3) {
      invalidLines.push(
        issue(
          "invalid_delimiters",
          line.lineNumber,
          line.raw,
          "Use exactly two | delimiters: Place | State | Statement.",
        ),
      );
      continue;
    }

    const placeName = fields[0]!.trim();
    const stateValue = fields[1]!.trim();
    const statement = fields[2]!.trim();
    if (!placeName) {
      invalidLines.push(issue("missing_place", line.lineNumber, line.raw, "Place is required."));
      continue;
    }
    if (placeName.length > ALMANAC_PLACE_NAME_MAX_LENGTH) {
      invalidLines.push(
        issue(
          "place_too_long",
          line.lineNumber,
          line.raw,
          `Place must be ${ALMANAC_PLACE_NAME_MAX_LENGTH} characters or fewer.`,
        ),
      );
      continue;
    }
    if (!isState(stateValue)) {
      invalidLines.push(
        issue(
          "invalid_state",
          line.lineNumber,
          line.raw,
          "State must be NOW, DONE, NEXT or OPEN.",
        ),
      );
      continue;
    }
    if (!statement) {
      invalidLines.push(
        issue("missing_statement", line.lineNumber, line.raw, "Statement is required."),
      );
      continue;
    }
    if (statement.length > ALMANAC_UPDATE_TEXT_MAX_LENGTH) {
      invalidLines.push(
        issue(
          "statement_too_long",
          line.lineNumber,
          line.raw,
          `Statement must be ${ALMANAC_UPDATE_TEXT_MAX_LENGTH} characters or fewer.`,
        ),
      );
      continue;
    }
    updates.push({ lineNumber: line.lineNumber, raw: line.raw, placeName, state: stateValue, statement });
  }

  return {
    rawPacket,
    scope,
    updateLineCount: body.length,
    updates,
    invalidLines,
    fatalErrors,
  };
}
