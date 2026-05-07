/** Branch row shape returned by GET /api/branches and used by roadmap / mark modals. */
export type ApiBranchRow = {
  id: string;
  limbId: string;
  name?: string | null;
  label?: string | null;
  goal?: string | null;
  goalValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  parentBranchId?: string | null;
  turningPointId?: string | null;
  order?: number;
  createdAt: string;
};
