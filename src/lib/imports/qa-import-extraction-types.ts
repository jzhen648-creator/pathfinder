import type { ImportExtractionCandidate } from "./extraction-contract";

export type ImportInformationType = ImportExtractionCandidate["informationType"];
export type ImportMemoryDestination = ImportExtractionCandidate["memoryDestination"];
export type ImportSubjectType = ImportExtractionCandidate["subjectType"];
export type ImportTemporalState = ImportExtractionCandidate["temporal"]["state"];
export type { ImportExtractionCandidate };
