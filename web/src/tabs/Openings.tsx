import {
	Checkbox,
	MultiSelect,
	SegmentedControl,
	Text,
	Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { VegaEmbed } from "react-vega";
import type { VisualizationSpec } from "vega-embed";
import {
	ACCENT,
	bandIndex,
	ELO_BANDS,
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
// The chosen side's win rate (draws count as nothing) with its 95% interval.
function winRate(r: Counts, side: Side) {
	const wins = side === "white" ? r.white : r.black;
	return scoreWithCI({ white: wins, draw: 0, black: r.games - wins, games: r.games });
}

// Sort key for both charts: white's wins minus black's, as a share of games. Best for white
// ranks first and best for black last, whichever side is shown.
const whiteEdge = (r: Counts) => (r.white - r.black) / r.games;

// Forest plot: one row per opening, sorted by how much it favors white, so the ranking answers
// the question directly and every opening is named. Popularity is left to the tooltip; the
// width of the interval already shows how much data an opening has.
const rankingTooltip = (side: Side) => [
	{ field: "opening_family", title: "Opening" },
	{ field: "games", title: "Games", format: "," },
	{
		field: "score",
		title: `${SIDE_NAME[side]}'s win rate`,
		format: ".1%",
	},
	{ field: "ci", title: "95% interval" },
	{ field: "white_share", title: "White wins", format: ".1%" },
	{ field: "draw_share", title: "Draws", format: ".1%" },
	{ field: "black_share", title: "Black wins", format: ".1%" },
];

// The ranking itself: rows sorted by whiteEdge in both views, so toggling the side keeps every
// opening in its row. Best for white on top, best for black at the bottom.
const y = {
	field: "opening_family",
	type: "nominal",
	title: null,
	sort: { field: "edge", order: "descending" },
	axis: {
		labelColor: "#4a4944",
		ticks: false,
		domain: false,
		labelPadding: 6,
		labelLimit: LABEL_WIDTH - 6,
	},
} as const;

const rankingSpec = (
	side: Side,
	tooltip = rankingTooltip(side),
): VisualizationSpec => ({
	$schema: "https://vega.github.io/schema/vega-lite/v6.json",
	data: { name: "table" }, // placeholder, filled in below
	width: "container",
	height: { step: ROW },
	layer: [
		{
			// Invisible row band, reaching left under the axis label: a big hover target for the
			// tooltip. (Vega axis labels don't take pointer events.)
			mark: { type: "rect", color: "white", opacity: 0.001 },
			encoding: {
				y,
				x: { value: -LABEL_WIDTH },
				x2: { value: "width" },
				tooltip,
			},
		},
		{
			// 95% interval as a floating bar: where the side's win rate for this opening plausibly lies.
			mark: {
				type: "bar",
				color: ACCENT,
				height: { band: 0.65 },
				cornerRadius: 2,
				clip: true,
			},
			encoding: {
				y,
				x: {
					field: "lo",
					type: "quantitative",
					// Fixed 40–60% for both sides, so switching side never rescales the axis. Bars
					// reaching past the edges are clipped.
					scale: { domain: [0.4, 0.6], nice: false },
					title: `${SIDE_NAME[side]}'s win rate`,
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

const COMPARED = 15; // default pick with name families: this many most played openings
const COMPARED_ROW = 24; // px per opening in the two comparison charts

// Two ways to group openings: the group's ECO families (openings_by_eco.json, 10 families plus
// Others) or the opening name before the ":" (openings_by_elo.json, the 40 most played).
type Grouping = "eco" | "name";
const GROUPING_FILE = { eco: "openings_by_eco.json", name: "openings_by_elo.json" } as const;

// White wins, draws and black wins: the full split behind the win rates above.
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
			sort: { field: "edge", order: "descending" },
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

// Openings x Elo ranges (ELO_BANDS, as in the header filter). The color is the opening's share of that bracket, on a sqrt scale
// so that one very common opening doesn't wash out the differences among the others.
const popularitySpec: VisualizationSpec = {
	$schema: "https://vega.github.io/schema/vega-lite/v6.json",
	data: { name: "table" }, // placeholder, filled in below
	width: "container",
	height: { step: COMPARED_ROW }, // grows with the number of openings picked
	mark: { type: "rect", stroke: "white", strokeWidth: 1 },
	encoding: {
		x: {
			field: "band",
			type: "ordinal",
			sort: ELO_BANDS.map((b) => b.label),
			title: "Average Elo of both players",
			axis: { labelAngle: 0 },
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
			{ field: "band", title: "Elo range" },
			{ field: "share", title: "Share of range", format: ".1%" },
			{ field: "games", title: "Games", format: "," },
		],
	},
};

/**
 * Picks the openings every chart in the tab shows. `options` are sorted by games, most played
 * first. Clearing it goes back to the default pick.
 */
function OpeningPicker(props: {
	options: string[];
	value: string[];
	onChange: (v: string[]) => void;
}) {
	return (
		<MultiSelect
			label="Openings to include"
			data={props.options}
			value={props.value}
			onChange={props.onChange}
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
		/>
	);
}

/** The default pick: every ECO family, or the COMPARED most played name families. */
const defaultPick = (grouping: Grouping, options: string[]) =>
	grouping === "eco" ? options : options.slice(0, COMPARED);

const ciLabel = (s: { lo: number; hi: number }) =>
	`${(s.lo * 100).toFixed(1)}–${(s.hi * 100).toFixed(1)}%`;

export default function Openings() {
	const [grouping, setGrouping] = useState<Grouping>("eco");
	const rows = useData<Row[]>(GROUPING_FILE[grouping]);
	const all = useData<Row[]>("results_by_elo.json");
	const { inRange } = useEloFilter();
	const [side, setSide] = useState<Side>("white");
	// One pick per grouping, so switching back and forth keeps both. null = the default pick.
	const [picks, setPicks] = useState<Record<Grouping, string[] | null>>({
		eco: null,
		name: null,
	});

	// Every opening in the data, most played overall first.
	const options = useMemo(
		() =>
			sumResults(rows ?? [], "opening_family")
				.sort((a, b) => b.games - a.games)
				.map((r) => r.opening_family),
		[rows],
	);
	const selection = useMemo(() => {
		const kept = (picks[grouping] ?? []).filter((o) => options.includes(o));
		return kept.length ? kept : defaultPick(grouping, options);
	}, [picks, grouping, options]);
	const selected = useMemo(() => new Set(selection), [selection]);

	const fullSpec = useMemo(() => {
		const values = sumResults(
			(rows ?? []).filter(
				(r) => inRange(r.elo_bracket) && selected.has(r.opening_family),
			),
			"opening_family",
		)
			.filter((r) => r.games >= MIN_GAMES)
			.sort((a, b) => b.games - a.games)
			.map((r) => {
				const s = winRate(r, side);
				return {
					...r,
					...s,
					edge: whiteEdge(r),
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
		const avg = total ? winRate(total, side).score : null;
		const mean = avg === null ? [] : [{ score: avg }];
		return {
			...rankingSpec(side),
			datasets: { mean },
			data: { values },
		} as VisualizationSpec;
	}, [rows, all, inRange, side, selected]);

	// The picked openings with enough games in the Elo filter.
	const results = useMemo(() => {
		const top = sumResults(
			(rows ?? []).filter(
				(r) => inRange(r.elo_bracket) && selected.has(r.opening_family),
			),
			"opening_family",
		)
			.filter((r) => r.games >= MIN_GAMES)
			.map((r) => ({ ...r, edge: whiteEdge(r) }));
		return {
			...resultsSpec,
			data: { values: toResultRows(top) },
		} as VisualizationSpec;
	}, [rows, inRange, selected]);

	const popularity = useMemo(() => {
		const band = (r: Row) => ELO_BANDS[bandIndex(r.elo_bracket)];
		const totals = new Map<string, number>();
		for (const r of all ?? [])
			totals.set(band(r).label, (totals.get(band(r).label) ?? 0) + r.games);
		// Rows keep the overall popularity order, whatever order the openings were picked in.
		const rank = new Map(
			selection
				.map((o) => [o, options.indexOf(o)] as const)
				.sort((a, b) => a[1] - b[1])
				.map(([o], i) => [o, i]),
		);
		const values = sumResults(
			(rows ?? [])
				.filter((r) => rank.has(r.opening_family))
				.map((r) => ({
					...r,
					band: band(r).label,
					key: `${r.opening_family}|${band(r).label}`,
					// The header filter snaps to whole ranges, so one bracket decides for the range.
					inRange: inRange(band(r).lo),
				})),
			"key",
		)
			.filter((r) => (totals.get(r.band) ?? 0) >= MIN_BRACKET_GAMES)
			.map((r) => ({
				...r,
				rank: rank.get(r.opening_family),
				share: r.games / totals.get(r.band)!,
			}));
		return { ...popularitySpec, data: { values } } as VisualizationSpec;
	}, [rows, all, inRange, selection, options]);

	return (
		<TabSection
			title={`Which openings are good for ${side}?`}
			description={`Each row is an opening family (${grouping === "eco" ? "by ECO code range; Others is every code outside the ten families" : "the opening name before the colon, 40 most played"}), ranked by white's wins minus black's, from best for white at the top to best for black at the bottom. The order stays the same whatever you pick above. Openings right of the dashed line do better for ${side} than the average game. Each bar is the 95% interval for ${side}'s win rate: an opening whose bar crosses the line isn't clearly different from average, and a wide bar means few games (hover for the count). Openings with fewer than ${MIN_GAMES} games in the Elo filter are hidden.`}
			controls={
				<>
					<SegmentedControl
						data={[
							{ value: "eco", label: "ECO families" },
							{ value: "name", label: "Opening names" },
						]}
						value={grouping}
						onChange={(v) => setGrouping(v as Grouping)}
					/>
					<SegmentedControl
						data={[
							{ value: "white", label: "White" },
							{ value: "black", label: "Black" },
						]}
						value={side}
						onChange={(v) => setSide(v as Side)}
					/>
				</>
			}
			loading={!rows || !all}
		>
			<OpeningPicker
				options={options}
				value={selection}
				onChange={(v) => setPicks((p) => ({ ...p, [grouping]: v }))}
			/>
			<VegaEmbed spec={fullSpec} style={{ width: "100%" }} />
			<Title order={4} mt="lg">
				Wins, draws and losses by opening
			</Title>
			<Text size="sm" c="dimmed" mb="xs">
				The openings picked above, in the same order as the ranking. Openings with
				fewer than {MIN_GAMES} games in the Elo filter are hidden.
			</Text>
			<VegaEmbed spec={results} style={{ width: "100%" }} />
			<Title order={4} mt="lg">
				Opening popularity by rating
			</Title>
			<Text size="sm" c="dimmed" mb="xs">
				Each cell is the share of that Elo range's games played with the
				opening, so ranges of different sizes compare fairly. Read along a row
				to see an opening rise or fall with rating. Same openings as picked
				above, most played on top. Ranges with fewer than {MIN_BRACKET_GAMES}{" "}
				games are left out.
			</Text>
			<VegaEmbed spec={popularity} style={{ width: "100%" }} />
		</TabSection>
	);
}
