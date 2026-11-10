import { useElementSize } from "@mantine/hooks";
import { useMemo } from "react";
import { VegaEmbed } from "react-vega";
import type { VisualizationSpec } from "vega-embed";
import { ACCENT, CONTEXT, INK, MIN_GAMES, scoreWithCI, sumResults } from "../lib/chess";
import { useData } from "../lib/data";
import { useEloFilter } from "../lib/eloRange";
import { TabSection } from "../lib/TabSection";
import { Tex } from "../lib/Tex";

type Row = {
  gap: number;
  elo_bracket: number;
  games: number;
  white: number;
  draw: number;
  black: number;
};

const series = {
  scale: { domain: ["Actual score", "Elo prediction"], range: [ACCENT, INK] },
  legend: { title: null, orient: "top-left" }
} as const;

// The x range follows the data (the group's sample drops games with a gap over 100),
// padded by half a bin so the outer histogram bars aren't cut.
// The same x axis under every panel, labeled at the bin centers (the gaps the data uses).
const gapAxis = (max: number) => ({
  title: "Rating gap (white − black)",
  axis: {
    values: Array.from(
      { length: Math.floor(max / 25) * 2 + 1 },
      (_, i) => -Math.floor(max / 25) * 25 + i * 25
    )
  }
});

// Vega-Lite's width: 'container' doesn't work in a vconcat, so the panels get a pixel width
// measured from the page: the container minus the room the y axes take on the left.
const AXIS_GUTTER = 75;
const makeSpec = (max: number, width: number): VisualizationSpec => ({
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  data: { name: "table" }, // placeholder, filled in below
  vconcat: [
    {
      width,
      height: 340,
      layer: [
        {
          mark: { type: "rule", color: "#d8d6d0" },
          encoding: { y: { datum: 0.5 } }
        },
        {
          // Expected score under the Elo formula, drawn as a smooth curve.
          data: {
            sequence: { start: -max, stop: max + 1, step: 5, as: "gap" }
          },
          transform: [
            {
              calculate: "1 / (1 + pow(10, -datum.gap / 400))",
              as: "expected"
            }
          ],
          mark: { type: "line", strokeWidth: 2, strokeDash: [6, 4] },
          encoding: {
            x: { field: "gap", type: "quantitative" },
            y: { field: "expected", type: "quantitative" },
            color: { datum: "Elo prediction", ...series }
          }
        },
        {
          mark: { type: "area", opacity: 0.18, color: ACCENT },
          encoding: {
            x: { field: "gap", type: "quantitative" },
            y: { field: "lo", type: "quantitative" },
            y2: { field: "hi" }
          }
        },
        {
          mark: {
            type: "line",
            strokeWidth: 2,
            point: { size: 64, filled: true }
          },
          encoding: {
            x: {
              field: "gap",
              type: "quantitative",
              scale: { domain: [-max - 12.5, max + 12.5] },
              ...gapAxis(max)
            },
            y: {
              field: "score",
              type: "quantitative",
              title: "Score (win = 1, draw = ½)",
              scale: { domain: [0, 1] },
              axis: { format: ".0%" }
            },
            color: { datum: "Actual score", ...series },
            tooltip: [
              { field: "gap", title: "Rating gap" },
              { field: "score", title: "Actual score", format: ".1%" },
              { field: "expected", title: "Elo prediction", format: ".1%" },
              { field: "games", title: "Games", format: "," }
            ]
          }
        }
      ]
    },
    {
      // The difference itself: the curves above sit close together, so the gap between
      // them is hard to judge by eye. Here it is on its own common baseline (0 = as predicted).
      width,
      height: 150,
      layer: [
        {
          mark: { type: "rule", color: INK, strokeDash: [6, 4] },
          encoding: { y: { datum: 0 } }
        },
        {
          mark: { type: "rule", color: CONTEXT, strokeWidth: 1.5 },
          encoding: {
            x: { field: "gap", type: "quantitative" },
            y: { field: "diff_lo", type: "quantitative" },
            y2: { field: "diff_hi" }
          }
        },
        {
          mark: { type: "circle", color: ACCENT, size: 40, opacity: 1 },
          encoding: {
            x: {
              field: "gap",
              type: "quantitative",
              scale: { domain: [-max - 12.5, max + 12.5] },
              ...gapAxis(max)
            },
            y: {
              field: "diff",
              type: "quantitative",
              title: ["Actual − predicted", "(0 = as Elo predicts)"],
              axis: { format: "+.0%", tickCount: 4 }
            },
            tooltip: [
              { field: "gap", title: "Rating gap" },
              { field: "diff", title: "Actual − predicted", format: "+.1%" },
              { field: "diff_ci", title: "95% interval" },
              { field: "games", title: "Games", format: "," }
            ]
          }
        }
      ]
    },
    {
      width,
      height: 70,
      mark: { type: "bar", color: CONTEXT, cornerRadiusEnd: 2 },
      encoding: {
        x: {
          field: "gap",
          type: "quantitative",
          bin: { step: 25, anchor: -12.5, extent: [-max - 12.5, max + 12.5] },
          scale: { domain: [-max - 12.5, max + 12.5] },
          ...gapAxis(max)
        },
        y: {
          field: "games",
          type: "quantitative",
          aggregate: "sum",
          title: "Games",
          axis: { tickCount: 2 }
        },
        tooltip: [
          { field: "gap", title: "Rating gap" },
          { field: "games", aggregate: "sum", title: "Games", format: "," }
        ]
      }
    }
  ]
});

// White's expected score under Elo, the same formula as the dashed curve and `expected` below.
const ELO_FORMULA = "E_\\text{white} = \\frac{1}{1 + 10^{-D/400}}";

export default function RatingGap() {
  const rows = useData<Row[]>("rating_gap.json");
  const { inRange } = useEloFilter();

  const { ref, width: containerWidth } = useElementSize();
  const width = Math.max(200, containerWidth - AXIS_GUTTER);

  const fullSpec = useMemo(() => {
    const filtered = (rows ?? []).filter(r => inRange(r.elo_bracket));
    const values = sumResults(filtered, "gap")
      .filter(r => r.games >= MIN_GAMES)
      .map(r => {
        const s = scoreWithCI(r);
        const expected = 1 / (1 + 10 ** (-r.gap / 400));
        const [diff_lo, diff_hi] = [s.lo - expected, s.hi - expected];
        const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
        return {
          ...r,
          ...s,
          expected,
          diff: s.score - expected,
          diff_lo,
          diff_hi,
          diff_ci: `${pct(diff_lo)} to ${pct(diff_hi)}`
        };
      });
    const max = Math.max(100, ...(rows ?? []).map(r => Math.abs(r.gap)));
    return { ...makeSpec(max, width), data: { values } } as VisualizationSpec;
  }, [rows, inRange, width]);

  return (
    <TabSection
      title="Elo formula vs results?"
      description={
        <>
          White's actual score by rating gap (with a 95% interval) against what the Elo formula
          expects. Gap = white − black, in 25-point bins; bins with fewer than {MIN_GAMES} games are
          hidden. The dashed line in the top panel is the Elo prediction:
          <Tex display>{ELO_FORMULA}</Tex>
          where <Tex>{"E_\\text{white}"}</Tex> is white's expected score (a win counts 1, a draw ½),
          and <Tex>{"D = R_\\text{white} - R_\\text{black}"}</Tex> is the rating gap, with{" "}
          <Tex>{"R_\\text{white}"}</Tex> and <Tex>{"R_\\text{black}"}</Tex> the two players' Lichess
          ratings before the game. The 400 sets Elo's scale: a 400-point gap means 10 : 1 odds, so
          the stronger side expects about 91%; equal ratings give 50%. The middle panel shows the
          difference, actual minus predicted: points above the dashed line mean white scores more
          than Elo expects. The bars at the bottom show how many games each gap has.
        </>
      }
      loading={!rows}
    >
      <div ref={ref}>
        {containerWidth > 0 && <VegaEmbed spec={fullSpec} style={{ width: "100%" }} />}
      </div>
    </TabSection>
  );
}
