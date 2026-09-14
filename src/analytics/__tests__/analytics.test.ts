import { describe, expect, it } from "vitest";
import {
  buildTrend,
  descriptiveStatistics,
  percentageChange,
  topN,
} from "../engine";
import { validateChartSpec } from "../chart";
import { checkNumericalGrounding } from "../grounding";

describe("deterministic analytics", () => {
  it("calculates stable descriptive statistics", () => {
    expect(descriptiveStatistics([10, 20, 30])).toMatchObject({
      count: 3,
      min: 10,
      max: 30,
      mean: 20,
      median: 20,
    });
  });

  it("calculates period-over-period change", () => {
    expect(percentageChange(100, 125)).toBe(25);
    expect(
      buildTrend(
        [
          { month: "2026-01", revenue: 100 },
          { month: "2026-02", revenue: 125 },
        ],
        "month",
        "revenue",
      )[1],
    ).toMatchObject({ change: 25, percentageChange: 25 });
  });

  it("ranks a deterministic top-N", () => {
    expect(
      topN([{ value: 2 }, { value: 7 }, { value: 4 }], "value", 2),
    ).toEqual([{ value: 7 }, { value: 4 }]);
  });
});

describe("chart and insight grounding", () => {
  it("accepts a chart whose columns exist", () => {
    expect(
      validateChartSpec(
        {
          type: "line",
          title: "Revenue trend",
          x: "month",
          y: ["revenue"],
          rationale: "Time series",
        },
        ["month", "revenue"],
      ).type,
    ).toBe("line");
  });

  it("rejects a hallucinated chart column", () => {
    expect(() =>
      validateChartSpec(
        {
          type: "bar",
          title: "Invalid",
          x: "company",
          y: ["profit"],
          rationale: "Comparison",
        },
        ["company", "revenue"],
      ),
    ).toThrow(/not returned/i);
  });

  it("accepts numerical claims traceable to results", () => {
    expect(
      checkNumericalGrounding("2 rows include revenue 10 and 20.", [
        { revenue: 10 },
        { revenue: 20 },
      ]).grounded,
    ).toBe(true);
  });

  it("rejects a numerical claim absent from evidence", () => {
    const result = checkNumericalGrounding("Revenue was 999.", [
      { revenue: 10 },
    ]);
    expect(result).toMatchObject({
      grounded: false,
      unsupportedNumbers: [999],
    });
  });
});
