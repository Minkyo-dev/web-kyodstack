import { describe, expect, it } from "vitest";
import { moveItem } from "@/features/direction/domain/reorder";
import { reorderIdentitiesSchema } from "@/features/direction/schemas/direction.schema";

describe("moveItem", () => {
  it("swaps with the neighbour and returns a new array", () => {
    const ids = ["a", "b", "c"];
    expect(moveItem(ids, 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(ids, 0, 1)).toEqual(["b", "a", "c"]);
    expect(ids).toEqual(["a", "b", "c"]);
  });
  it("is a no-op at the edges", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("reorderIdentitiesSchema", () => {
  const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
  it("needs distinct ids", () => {
    expect(reorderIdentitiesSchema.safeParse({ identityIds: [id(1), id(2)] }).success).toBe(true);
    expect(reorderIdentitiesSchema.safeParse({ identityIds: [id(1), id(1)] }).success).toBe(false);
    expect(reorderIdentitiesSchema.safeParse({ identityIds: [] }).success).toBe(false);
  });
});
