import { describe, expect, it } from "vitest";

import type { FormattedMapContext } from "@/lib/ai/format-map-context";
import { buildMapContextStructureKey } from "@/lib/ai/map-context-cache-key";

describe("map-context-cache-key", () => {
  it("returns the same key for identical structure", () => {
    const mapContext: FormattedMapContext = {
      themes: [
        {
          id: "work",
          label: "Work",
          marks: [],
          categories: [
            {
              id: "cat-1",
              label: "Job",
              categoryLabel: "Job",
              marks: [],
              pursuits: [
                {
                  id: "p1",
                  title: "CeMAP",
                  status: "ACTIVE",
                  milestones: [{ id: "m1", title: "Unit 1", completed: false }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(buildMapContextStructureKey(mapContext)).toBe(
      buildMapContextStructureKey(mapContext),
    );
  });

  it("changes when pursuit title or status changes", () => {
    const base: FormattedMapContext = {
      themes: [
        {
          id: "work",
          label: "Work",
          marks: [],
          categories: [
            {
              id: "cat-1",
              label: "Job",
              categoryLabel: "Job",
              marks: [],
              pursuits: [
                {
                  id: "p1",
                  title: "CeMAP",
                  status: "ACTIVE",
                  milestones: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const renamed: FormattedMapContext = {
      themes: [
        {
          ...base.themes[0],
          categories: [
            {
              ...base.themes[0].categories[0],
              pursuits: [{ ...base.themes[0].categories[0].pursuits[0], title: "CeMAP 2" }],
            },
          ],
        },
      ],
    };

    expect(buildMapContextStructureKey(base)).not.toBe(buildMapContextStructureKey(renamed));
  });
});
