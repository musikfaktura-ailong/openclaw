import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import {
  buildResearchTaskTemplate,
  listOpportunityCategories,
  recordCategorySelection,
  requiredUnderrepresentedCategory,
} from "./goals-registry.js";

describe("WS-E goals registry", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("tracks category diversity and builds mission-scoped research templates", () => {
    const now = 1_000_000;
    for (let index = 0; index < 5; index += 1) {
      recordCategorySelection("trading", now + index);
    }

    expect(requiredUnderrepresentedCategory(now + 10)).not.toBeNull();
    expect(listOpportunityCategories().some((category) => category.tag === "api_service")).toBe(true);
    expect(buildResearchTaskTemplate({ phase: "pick", requiredCategory: "api_service" }).details).toContain(
      "truth first",
    );
  });
});
