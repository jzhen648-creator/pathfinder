/**
 * DRAG SUGGESTION API
 * Feature flag: AI_DRAG_SUGGESTIONS
 * Status: scaffolded — returns mock response
 *
 * When fully implemented this will:
 * 1. Receive two node ids and the user's map
 * 2. Call Groq AI with context about both nodes
 * 3. Return a suggestion about their connection
 *
 * POST /api/life-map/drag-suggestion
 * Body: { fromNodeId, toNodeId, allNodes }
 * Returns: AIDragSuggestion
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type AIDragSuggestion = {
  connectionType: string;
  suggestionText: string;
  confidence: number;
  shouldConnect: boolean;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fromNodeId, toNodeId, allNodes } = await request.json();

  // SCAFFOLDED — not yet implemented
  // TODO: Replace with real Groq AI call
  // TODO: Build prompt from node context
  // TODO: Parse and validate AI response

  console.log("[DRAG SUGGESTION] Scaffolded route called");
  console.log("From node:", fromNodeId);
  console.log("To node:", toNodeId);
  console.log("Total nodes in context:", allNodes?.length);

  const mockSuggestion: AIDragSuggestion = {
    connectionType: "connected_to",
    suggestionText: "AI drag suggestions coming soon",
    confidence: 0,
    shouldConnect: false,
  };

  return NextResponse.json({
    suggestion: mockSuggestion,
    scaffolded: true,
    message: "Enable AI_DRAG_SUGGESTIONS flag to activate",
  });
}
