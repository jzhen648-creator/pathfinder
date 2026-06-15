import { describe, expect, it } from "vitest";

import { readingPacketToJson } from "@/lib/map/compile-reading-packet";
import { DENSE_READING_PACKET } from "@/lib/map/__fixtures__/dense-map";

describe("reading packet snapshots", () => {
  it("matches canonical dense reading packet JSON", () => {
    expect(readingPacketToJson(DENSE_READING_PACKET)).toMatchSnapshot();
  });
});
