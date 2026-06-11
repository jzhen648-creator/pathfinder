import { PATCH as patchCategoryReorder } from "../../../branches/[branchId]/reorder/route";

type RouteProps = { params: Promise<{ categoryId: string }> };

/** Reorder category line — alias for `/api/branches/[branchId]/reorder`. */
export async function PATCH(request: Request, { params }: RouteProps) {
  const { categoryId } = await params;
  return patchCategoryReorder(request, { params: Promise.resolve({ branchId: categoryId }) });
}
