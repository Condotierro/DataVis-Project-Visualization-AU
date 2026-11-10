import {
	Checkbox,
	MultiSelect,
	SegmentedControl,
	Text,
	Title,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VegaEmbed } from "react-vega";
import type { View } from "vega";
import type { Result, VisualizationSpec } from "vega-embed";
import {
	ACCENT,
	bracketLabel,
	bracketLabelExpr,
	CONTEXT,
	DIMMED,
	INK,
	MIN_BRACKET_GAMES,
	MIN_GAMES,
	RESULT_MARK,
	resultColor,
	scoreWithCI,
	sumResults,
	toResultRows,
} from "../lib/chess";
import { useData } from "../lib/data";
import { useEloFilter } from "../lib/eloRange";
import { TabSection } from "../lib/TabSection";

type Row = {
	opening_family: string;
	elo_bracket: number;
	games: number;
	white: number;
	draw: number;
	black: number;
};

const ROW = 17; // px per opening; every opening gets a labeled row
const LABEL_WIDTH = 140; // fits the longest opening name

type Side = "white" | "black";
const SIDE_NAME = { white: "White", black: "Black" } as const;

type Counts = { white: number; draw: number; black: number; games: number };
// The chosen side's score with its 95% interval. With halfDraws, a draw is worth ½ (the chess
// score, and black's is the complement of white's); without, it's the plain win rate.
function sideScore(r: Counts, side: Side, halfDraws: boolean) {
	const wins = side === "white" ? r.white : r.black;
	const losses = side === "white" ? r.black : r.white;
	return scoreWithCI({
		white: wins,
		draw: halfDraws ? r.draw : 0,
		black: losses,
		games: r.games,
	});
}

// Forest plot: one row per opening, sorted by the chosen side's score, so the ranking answers
// the question directly and every opening is named. Popularity is left to the tooltip; the
// width of the interval already shows how much data an opening has.
const rankingTooltip = (side: Side, halfDraws: boolean) => [
	{ field: "opening_family", title: "Opening" },
	{ field: "games", title: "Games", format: "," },
	{
		field: "score",
		title: `${SIDE_NAME[side]}'s ${halfDraws ? "score" : "win rate"}`,
		format: ".1%",
	},
	{ field: "ci", title: "95% interval" },
	{ field: "white_share", title: "White wins", format: ".1%" },
	{ field: "draw_share", title: "Draws", format: ".1%" },
	{ field: "black_share", title: "Black wins", format: ".1%" },
];

// The ranking itself: rows sorted by white's score in both views, so toggling the side keeps
// every opening in its row. Best for white on top, best for black at the bottom. (Sorting by
// the average of both sides' scores wouldn't work: the two always sum to 100%.)
const y = {
	field: "opening_family",
	type: "nominal",
	title: null,
	sort: { field: "white_score", order: "descending" },
	axis: {
		labelFontWeight: { expr: "datum.value === shown ? 'bold' : 'normal'" },
		labelColor: { expr: `datum.value === shown ? '${INK}' : '#4a4944'` },
		ticks: false,
		domain: false,
		labelPadding: 6,
		labelLimit: LABEL_WIDTH - 6,
	},
} as const;

const rankingSpec = (
	side: Side,
	halfDraws: boolean,
	tooltip = rankingTooltip(side, halfDraws),
): VisualizationSpec => ({
	$schema: "https://vega.github.io/schema/vega-lite/v6.json",
	data: { name: "table" }, // placeholder, filled in below
	width: "container",
	height: { step: ROW },
	// The opening shown in the chart below. Set on the live view, not in the spec, so picking
	// one doesn't re-embed the chart (which empties it for a moment and makes the page jump).
	params: [{ name: "shown", value: null }],
	layer: [
		{
			// Row band, reaching left under the axis label: a big click/hover target, and a light
			// background for the picked opening. (Vega axis labels don't take pointer events.)
			mark: { type: "rect", cursor: "pointer" },
			encoding: {
				y,
				x: { value: -LABEL_WIDTH },
				x2: { value: "width" },
				color: {
					condition: {
						test: "datum.opening_family === shown",
						value: "#eceae4",
					},
					value: "white",
				},
				opacity: {
					condition: { test: "datum.opening_family === shown", value: 1 },
					value: 0.001,
				},
				tooltip,
			},
		},
		{
			// 95% interval as a floating bar: where the side's score for this opening plausibly lies.
			mark: {
				type: "bar",
				color: ACCENT,
				height: { band: 0.65 },
				cornerRadius: 2,
				cursor: "pointer",
				clip: true,
			},
			encoding: {
				y,
				x: {
					field: "lo",
					type: "quantitative",
					// Fixed 40–60% in every view, centered on 50% (the even score), so switching side or
					// draw rule never rescales the axis. Bars reaching past the edges are clipped.
					scale: { domain: [0.4, 0.6], nice: false },
					title: halfDraws
						? `${SIDE_NAME[side]}'s score (win = 1, draw = ½)`
						: `${SIDE_NAME[side]}'s win rate`,
					axis: { format: ".0%", orient: "top", tickCount: 8 },
				},
				x2: { field: "hi" },
				tooltip,
			},
		},
		{
			// Helper line, drawn over the bars: the average over all games in the Elo filter.
			// Bars entirely to its right do clearly better for the side than chess in general.
			data: { name: "mean" },
			mark: { type: "rule", color: INK, strokeDash: [6, 4] },
			encoding: { x: { field: "score", type: "quantitative" } },
		},
		{
			data: { name: "mean" },
			mark: {
				type: "text",
				color: INK,
				align: "left",
				baseline: "top",
				dx: 4,
				dy: 4,
			},
			encoding: {
				x: { field: "score", type: "quantitative" },
				y: { value: "height" },
				text: { value: "average of all games" },
			},
		},
	],
});

// One opening across Elo brackets: does it work better for weaker or stronger players?
// Same score as the ranking above (on y here). The all-games score per bracket is in the tooltip.
const detailSpec: VisualizationSpec = {
	$schema: "https://vega.github.io/schema/vega-lite/v6.json",
	data: { name: "table" }, // placeholder, filled in below
	width: "container",
	height: 240,
	encoding: {
		x: {
			field: "elo_bracket",
			type: "ordinal",
			title: "Average Elo of both players",
			axis: {
				labelExpr: bracketLabelExpr("datum.value", false),
				labelAngle: 0,
			},
		},
		y: {
			type: "quantitative",
			scale: { zero: false },
			title: "White's score",
			axis: { format: ".0%" },
		},
		// The x axis is Elo itself, so brackets outside the global filter are dimmed, not removed.
		opacity: { condition: { test: "datum.inRange", value: 1 }, value: DIMMED },
	},
	layer: [
		{
			mark: { type: "rule", color: CONTEXT, strokeWidth: 1.5 },
			encoding: { y: { field: "lo" }, y2: { field: "hi" } },
		},
		{
			mark: { type: "line", color: ACCENT, strokeWidth: 2 },
			encoding: { y: { field: "score" }, opacity: { value: 1 } },
		},
		{
			mark: { type: "circle", color: ACCENT, size: 60, opacity: 1 },
			encoding: {
				y: { field: "score" },
				tooltip: [
					{ field: "bracket_label", title: "Elo bracket" },
					{ field: "score", title: "White's score", format: ".1%" },
					{ field: "ci", title: "95% interval" },
					{ field: "overall", title: "All games", format: ".1%" },
					{ field: "games", title: "Games", format: "," },
				],
			},
		},
	],
};

const DETAIL_MIN_HEIGHT = 290; // a bit over the detail chart's rendered height (plot + axis + padding, ~287 px)

const COMPARED = 15; // default for the two comparison charts: this many most played openings
const COMPARED_ROW = 24; // px per opening in the two comparison charts

// White wins, draws and black wins, for what the score above folds into one number.
const resultsSpec: VisualizationSpec = {
	$schema: "https://vega.github.io/schema/vega-lite/v6.json",
	data: { name: "table" }, // placeholder, filled in below
	width: "container",
	height: { step: COMPARED_ROW }, // grows with the number of openings picked
	mark: RESULT_MARK,
	encoding: {
		y: {
			field: "opening_family",
			type: "nominal",
			title: null,
			sort: { field: "score", order: "descending" },
		},
		x: {
			field: "count",
			type: "quantitative",
			stack: "normalize",
			title: "Share of games",
			axis: { format: "%", values: [0, 0.25, 0.5, 0.75, 1] },
		},
		color: { ...resultColor, legend: { orient: "top" } },
		order: { field: "order" },
		tooltip: [
			{ field: "opening_family", title: "Opening" },
			{ field: "result", title: "Result" },
			{ field: "share", title: "Share", format: ".1%" },
			{ field: "count", title: "Games", format: "," },
		],
	},
};

// Openings x brackets. The color is the opening's share of that bracket, on a sqrt scale
// so that one very common opening doesn't wash out the differences among the others.
const popularitySpec: VisualizationSpec = {
	$schema: "https://vega.github.io/schema/vega-lite/v6.json",
	data: { name: "table" }, // placeholder, filled in below
	width: "container",
	height: { step: COMPARED_ROW }, // grows with the number of openings picked
	mark: { type: "rect", stroke: "white", strokeWidth: 1 },
	encoding: {
		x: {
			field: "elo_bracket",
			type: "ordinal",
			title: "Average Elo of both players",
			axis: {
				labelExpr: bracketLabelExpr("datum.value", false),
				labelAngle: 0,
			},
		},
		y: {
			field: "opening_family",
			type: "nominal",
			title: null,
			sort: { field: "rank" },
		},
		color: {
			field: "share",
			type: "quantitative",
			title: "Share of games",
			scale: { type: "sqrt", range: ["#eef3fa", ACCENT] },
			legend: { format: ".0%", orient: "top" },
		},
		opacity: { condition: { test: "datum.inRange", value: 1 }, value: DIMMED },
		tooltip: [
			{ field: "opening_family", title: "Opening" },
			{ field: "bracket_label", title: "Elo bracket" },
			{ field: "share", title: "Share of bracket", format: ".1%" },
			{ field: "games", title: "Games", format: "," },
		],
	},
};

/**
 * Picks the openings for a comparison chart. `options` are sorted by games, most played first;
 * with nothing picked the chart falls back to the first COMPARED of them.
 */
function OpeningPicker(props: {
	options: string[];
	value: string[];
	onChange: (v: string[]) => void;
}) {
	// Hide picks the Elo filter has since ruled out; they come back if the filter widens again.
	const value = props.value.filter((o) => props.options.includes(o));
	return (
		<MultiSelect
			data={props.options}
			value={value}
			onChange={props.onChange}
			placeholder={
				value.length
					? undefined
					: `${COMPARED} most played (default). Pick openings to compare`
			}
			searchable
			clearable
			// Picked openings stay in the list as ticked checkboxes; clicking one again unticks it.
			withCheckIcon={false}
			renderOption={({ option, checked }) => (
				<Checkbox
					checked={!!checked}
					label={option.value}
					readOnly
					tabIndex={-1}
					style={{ pointerEvents: "none" }}
				/>
			)}
			nothingFoundMessage="No opening with that name"
			maxDropdownHeight={280}
			comboboxProps={{ zIndex: 1100 }} // above vega-embed's chart menu button (z-index 1000)
			mb="xs"
		/>
	);
}

/** The picked openings that are still available, or the default top COMPARED if none are. */
function chosen(picked: string[], options: string[]) {
	const available = new Set(options);
	const kept = picked.filter((o) => available.has(o));
	return kept.length ? kept : options.slice(0, COMPARED);
}

const ciLabel = (s: { lo: number; hi: number }) =>
	`${(s.lo * 100).toFixed(1)}–${(s.hi * 100).toFixed(1)}%`;

export default function Openings() {
	const rows = useData<Row[]>("openings_by_elo.json");
	const all = useData<Row[]>("results_by_elo.json");
	const { inRange } = useEloFilter();
	const [picked, setPicked] = useState<string | null>(null);
	const [side, setSide] = useState<Side>("white");
	const [halfDraws, setHalfDraws] = useState(true);
	const [resultsPicked, setResultsPicked] = useState<string[]>([]);
	const [popularityPicked, setPopularityPicked] = useState<string[]>([]);

	const fullSpec = useMemo(() => {
		const values = sumResults(
			(rows ?? []).filter((r) => inRange(r.elo_bracket)),
			"opening_family",
		)
			.filter((r) => r.games >= MIN_GAMES)
			.sort((a, b) => b.games - a.games)
			.map((r) => {
				const s = sideScore(r, side, halfDraws);
				return {
					...r,
					...s,
					// Sort key: white's chess score, whatever side and draw rule are shown, so the rows
					// never move when the controls change.
					white_score: scoreWithCI(r).score,
					ci: ciLabel(s),
					white_share: r.white / r.games,
					draw_share: r.draw / r.games,
					black_share: r.black / r.games,
				};
			});
		// The reference is every game in the filter, not just the top openings plotted.
		const [total] = sumResults(
			(all ?? [])
				.filter((r) => inRange(r.elo_bracket))
				.map((r) => ({ ...r, key: 0 })),
			"key",
		);
		const avg = total ? sideScore(total, side, halfDraws).score : null;
		const mean = avg === null ? [] : [{ score: avg }];
		return {
			spec: {
				...rankingSpec(side, halfDraws),
				datasets: { mean },
				data: { values },
			} as VisualizationSpec,
			names: values.map((r) => r.opening_family),
		};
	}, [rows, all, inRange, side, halfDraws]);

	// Until something is clicked, show the most played opening.
	const shown =
		picked && fullSpec.names.includes(picked) ? picked : fullSpec.names[0];

	// Highlight the shown row on the live view, on every change and after every re-embed.
	const viewRef = useRef<View | null>(null);
	const shownRef = useRef(shown);
	useEffect(() => {
		shownRef.current = shown;
		viewRef.current?.signal("shown", shown ?? null).run();
	}, [shown]);
	const detail = useMemo(() => {
		const overall = new Map(
			sumResults(all ?? [], "elo_bracket").map((r) => [
				r.elo_bracket,
				scoreWithCI(r).score,
			]),
		);
		const values = (rows ?? [])
			.filter((r) => r.opening_family === shown && r.games >= MIN_GAMES)
			.map((r) => {
				const s = scoreWithCI(r);
				return {
					...r,
					...s,
					ci: ciLabel(s),
					overall: overall.get(r.elo_bracket),
					inRange: inRange(r.elo_bracket),
					bracket_label: bracketLabel(r.elo_bracket),
				};
			});
		return {
			...detailSpec,
			data: { values },
		} as VisualizationSpec;
	}, [rows, all, shown, inRange]);

	// Openings with enough games in the Elo filter, most played first.
	const resultsRows = useMemo(
		() =>
			sumResults(
				(rows ?? []).filter((r) => inRange(r.elo_bracket)),
				"opening_family",
			)
				.filter((r) => r.games >= MIN_GAMES)
				.sort((a, b) => b.games - a.games),
		[rows, inRange],
	);
	const resultsOptions = useMemo(
		() => resultsRows.map((r) => r.opening_family),
		[resultsRows],
	);
	const results = useMemo(() => {
		const keep = new Set(chosen(resultsPicked, resultsOptions));
		const top = resultsRows
			.filter((r) => keep.has(r.opening_family))
			.map((r) => ({ ...r, score: scoreWithCI(r).score }));
		return {
			...resultsSpec,
			data: { values: toResultRows(top) },
		} as VisualizationSpec;
	}, [resultsRows, resultsOptions, resultsPicked]);

	// Every opening, most played overall first.
	const popularityOptions = useMemo(
		() =>
			sumResults(rows ?? [], "opening_family")
				.sort((a, b) => b.games - a.games)
				.map((r) => r.opening_family),
		[rows],
	);
	const popularity = useMemo(() => {
		const totals = new Map(
			sumResults(all ?? [], "elo_bracket").map((r) => [r.elo_bracket, r.games]),
		);
		// Rows keep the overall popularity order, whatever order the openings were picked in.
		const rank = new Map(
			chosen(popularityPicked, popularityOptions)
				.map((o) => [o, popularityOptions.indexOf(o)] as const)
				.sort((a, b) => a[1] - b[1])
				.map(([o], i) => [o, i]),
		);
		const values = (rows ?? [])
			.filter(
				(r) =>
					rank.has(r.opening_family) &&
					(totals.get(r.elo_bracket) ?? 0) >= MIN_BRACKET_GAMES,
			)
			.map((r) => ({
				...r,
				rank: rank.get(r.opening_family),
				share: r.games / totals.get(r.elo_bracket)!,
				inRange: inRange(r.elo_bracket),
				bracket_label: bracketLabel(r.elo_bracket),
			}));
		return { ...popularitySpec, data: { values } } as VisualizationSpec;
	}, [rows, all, inRange, popularityPicked, popularityOptions]);

	// Clicking a row (label included) picks that opening for the chart below.
	const onEmbed = useCallback(({ view }: Result) => {
		viewRef.current = view;
		view.signal("shown", shownRef.current ?? null).run();
		view.addEventListener("click", (_, item) => {
			const name = (item?.datum as { opening_family?: string } | undefined)
				?.opening_family;
			if (name) setPicked(name);
		});
	}, []);

	return (
		<TabSection
			title={`Which openings are good for ${side}?`}
			description={`Each row is an opening family, ranked by white's score (draws as half a win), from best for white at the top to best for black at the bottom. The order stays the same whatever you pick above. Openings right of the dashed line do better for ${side} than the average game. Each bar is the 95% interval for ${side}'s ${halfDraws ? "score (a draw counts as half a win)" : "win rate (draws count as nothing)"}: an opening whose bar crosses the line isn't clearly different from average, and a wide bar means few games (hover for the count). Openings with fewer than ${MIN_GAMES} games in the Elo filter are hidden. Click a row to see that opening by rating below.`}
			controls={
				<>
					<SegmentedControl
						data={[
							{ value: "white", label: "White" },
							{ value: "black", label: "Black" },
						]}
						value={side}
						onChange={(v) => setSide(v as Side)}
					/>
					<Checkbox
						label="Count a draw as half a win"
						checked={halfDraws}
						onChange={(e) => setHalfDraws(e.currentTarget.checked)}
					/>
				</>
			}
			loading={!rows || !all}
		>
			<VegaEmbed
				spec={fullSpec.spec}
				onEmbed={onEmbed}
				style={{ width: "100%" }}
			/>
			<Title order={4} mt="lg">
				{shown}: white's score by rating
			</Title>
			<Text size="sm" c="dimmed" mb="xs">
				Vertical bars are 95% intervals. Hover a point to compare with all games
				in that bracket. Brackets with fewer than {MIN_GAMES} games of this
				opening are left out.
			</Text>
			{/* Re-embedded when the opening changes; the min height keeps the page from jumping meanwhile. */}
			<VegaEmbed
				spec={detail}
				style={{ width: "100%", minHeight: DETAIL_MIN_HEIGHT }}
			/>
			<Title order={4} mt="lg">
				Wins, draws and losses by opening
			</Title>
			<Text size="sm" c="dimmed" mb="xs">
				By default the {COMPARED} most played openings in the Elo filter; pick
				your own below. Best score for white on top. Only openings with at least{" "}
				{MIN_GAMES} games in the Elo filter can be picked.
			</Text>
			<OpeningPicker
				options={resultsOptions}
				value={resultsPicked}
				onChange={setResultsPicked}
			/>
			<VegaEmbed spec={results} style={{ width: "100%" }} />
			<Title order={4} mt="lg">
				Opening popularity by rating
			</Title>
			<Text size="sm" c="dimmed" mb="xs">
				Each cell is the share of that bracket's games played with the opening,
				so brackets of different sizes compare fairly. Read along a row to see
				an opening rise or fall with rating. By default the {COMPARED} most
				played openings overall; pick your own below. Brackets with fewer than{" "}
				{MIN_BRACKET_GAMES} games are left out.
			</Text>
			<OpeningPicker
				options={popularityOptions}
				value={popularityPicked}
				onChange={setPopularityPicked}
			/>
			<VegaEmbed spec={popularity} style={{ width: "100%" }} />
		</TabSection>
	);
}
