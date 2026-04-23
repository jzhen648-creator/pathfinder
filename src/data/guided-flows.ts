/**
 * GUIDED FLOWS — Guided Question Steps
 *
 * This file stores reusable guided flow definitions for map node creation.
 *
 * EDIT THIS FILE WHEN:
 * - Changing guided questions
 * - Adding new guided paths
 * - Updating answer chips
 */

export type GuidedFlowStep = {
  id: string;
  question: string;
  options: string[];
  allowOther?: boolean;
};

export const GUIDED_FLOWS: Record<string, Record<string, { steps: GuidedFlowStep[] }>> = {};

