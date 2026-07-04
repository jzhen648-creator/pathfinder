import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildPursuitsOnlyMapContext } from "@/lib/ai/generate-reflect";
import type { ReflectResponse } from "@/lib/ai/reflect-types";
import type { FormattedMapContext } from "@/lib/ai/format-map-context";
import {
  DENSE_ALL_PURSUIT_IDS,
  DENSE_MAP_CONTEXT,
} from "@/lib/map/__fixtures__/dense-map";

function flattenPursuitMeta(map: FormattedMapContext): Map<
  string,
  { themeId: string; categoryId: string }
> {
  const meta = new Map<string, { themeId: string; categoryId: string }>();
  for (const theme of map.themes) {
    for (const category of theme.categories) {
      for (const pursuit of category.pursuits) {
        meta.set(pursuit.id, { themeId: theme.id, categoryId: category.id });
      }
    }
  }
  return meta;
}

function buildReflectResponseForIds(ids: readonly string[]): ReflectResponse {
  const pursuits: ReflectResponse["pursuits"] = {};
  for (const id of ids) {
    pursuits[id] = {
      tone: "worth_a_look",
      headline: "Test headline for panel completeness",
      body: "Test body grounded in map facts.",
      clarifiers: [],
      suggestedMilestones: null,
    };
  }
  return { themes: {}, pursuits };
}

function assertReflectPursuitCompleteness(dirtyPursuitIds: readonly string[], reflect: ReflectResponse): void {
  for (const id of dirtyPursuitIds) {
    expect(reflect.pursuits[id], `missing pursuit panel for ${id}`).toBeDefined();
  }
}

describe("generate-reflect discovery properties", () => {
  const maxDirtySubset = Math.min(20, DENSE_ALL_PURSUIT_IDS.length);

  it("P1: reflect output contains every dirty pursuit id (1–20 pursuits)", () => {
    fc.assert(
      fc.property(
        fc.subarray([...DENSE_ALL_PURSUIT_IDS], { minLength: 1, maxLength: maxDirtySubset }),
        (dirtyIds) => {
          const uniqueIds = [...new Set(dirtyIds)];
          const reflect = buildReflectResponseForIds(uniqueIds);
          assertReflectPursuitCompleteness(uniqueIds, reflect);
          expect(Object.keys(reflect.pursuits)).toHaveLength(uniqueIds.length);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("P1: missing a dirty pursuit fails completeness", () => {
    fc.assert(
      fc.property(
        fc.subarray([...DENSE_ALL_PURSUIT_IDS], { minLength: 2, maxLength: 12 }),
        (dirtyIds) => {
          const uniqueIds = [...new Set(dirtyIds)];
          const incomplete = buildReflectResponseForIds(uniqueIds.slice(0, -1));
          expect(() => assertReflectPursuitCompleteness(uniqueIds, incomplete)).toThrow(
            /missing pursuit panel/,
          );
        },
      ),
      { numRuns: 80 },
    );
  });

  it("P2: pursuits-only map context never includes pursuits outside dirty categories", () => {
    const meta = flattenPursuitMeta(DENSE_MAP_CONTEXT);

    fc.assert(
      fc.property(
        fc.subarray([...DENSE_ALL_PURSUIT_IDS], { minLength: 1, maxLength: DENSE_ALL_PURSUIT_IDS.length }),
        (dirtyIds) => {
          const uniqueDirty = [...new Set(dirtyIds)];
          const allowedCategoryIds = new Set(
            uniqueDirty
              .map((id) => meta.get(id)?.categoryId)
              .filter((id): id is string => Boolean(id)),
          );

          const sliced = buildPursuitsOnlyMapContext(DENSE_MAP_CONTEXT, uniqueDirty);
          const slicedIds = sliced.themes.flatMap((theme) =>
            theme.categories.flatMap((category) => category.pursuits.map((pursuit) => pursuit.id)),
          );

          for (const id of uniqueDirty) {
            if (meta.has(id)) {
              expect(slicedIds).toContain(id);
            }
          }

          for (const id of slicedIds) {
            const categoryId = meta.get(id)?.categoryId;
            expect(categoryId, `unexpected pursuit ${id} in scoped context`).toBeDefined();
            expect(allowedCategoryIds.has(categoryId!)).toBe(true);
          }

          for (const theme of sliced.themes) {
            for (const category of theme.categories) {
              expect(allowedCategoryIds.has(category.id)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
