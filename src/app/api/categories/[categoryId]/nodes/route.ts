import { POST as postCategoryNode } from "../../../branches/[branchId]/nodes/route";

type RouteProps = { params: Promise<{ categoryId: string }> };

/** Insert goal/mark on category line — alias for `/api/branches/[branchId]/nodes`. */
export async function POST(request: Request, { params }: RouteProps) {
  const { categoryId } = await params;
  return postCategoryNode(request, { params: Promise.resolve({ branchId: categoryId }) });
}
