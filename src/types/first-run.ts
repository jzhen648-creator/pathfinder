/** Server-loaded first-run state passed into {@link TreeView}. */
export type TreeFirstRunConfig = {
  completed: boolean;
  primaryLimbId: string | null;
  userName: string | null;
};
