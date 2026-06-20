import { describe, expect, it } from "vitest";

import { readingPacketToJson } from "@/lib/map/compile-reading-packet";
import { buildDeltaUserMessage } from "@/lib/map/generate-reading-delta";
import type { ReadingPacket } from "@/lib/map/compile-reading-packet";

const RELATIONSHIP_PACKET: ReadingPacket = {
  changeEvents: ["relationship created"],
  confirmedRelationships: [
    {
      goalAId: "sales-id",
      goalBId: "broker-id",
      goalATitle: "New Homes Sales Executive",
      goalBTitle: "Mortgage Broker",
      label: "groundwork for",
    },
  ],
  categorySignals: [],
  recentEvents: { past: [], upcoming: [] },
  mapAggregates: {
    totalPursuits: 2,
    upcomingDeadlines14d: 0,
    upcomingDeadlines30d: 0,
    recentCompletions90d: 1,
    highSignificanceActive: ["Mortgage Broker"],
  },
  gapFacts: [],
  milestonePaceFacts: [],
};

describe("buildDeltaUserMessage", () => {
  it("includes confirmedRelationships in the reading packet block", () => {
    const user = buildDeltaUserMessage({
      previousSeasonRead: "Previous prose.",
      previousGeneratedAt: "2026-06-01T00:00:00.000Z",
      userContext: "Name: Alex",
      readingPacketJson: readingPacketToJson(RELATIONSHIP_PACKET),
    });

    expect(user).toContain("confirmedRelationships");
    expect(user).toContain("New Homes Sales Executive");
    expect(user).toContain("Mortgage Broker");
    expect(user).toContain("groundwork for");
    expect(user).toContain("Reading packet since last reading");
  });
});
