/** Sanity checks for the historical dataset + service. Run: bun scripts/check-historical.ts */
import {
  HISTORICAL_DATASET,
  HISTORICAL_LOCATIONS,
  HISTORICAL_MONTHS,
} from "../src/lib/flood/historical-data";
import {
  getHistoricalData,
  summarizeMonth,
  buildEventTimeline,
  formatTime12h,
  getRiskFactors,
  getHistoricalLocation,
} from "../src/lib/flood/historical-service";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  }
};

// 1. full coverage: every location x month, day counts correct
for (const loc of HISTORICAL_LOCATIONS) {
  for (const m of HISTORICAL_MONTHS) {
    const rec = HISTORICAL_DATASET[loc.id][m.id];
    assert(!!rec, `missing record ${loc.id}/${m.id}`);
    const [y, mo] = m.id.split("-").map(Number);
    const expectedDays = new Date(y, mo, 0).getDate();
    assert(rec.days.length === expectedDays, `day count ${loc.id}/${m.id}`);
    rec.days.forEach((d, i) => {
      assert(d.day === i + 1, `day numbering ${loc.id}/${m.id}`);
      assert(d.date.startsWith(m.id), `date prefix ${d.date}`);
    });
  }
}

// 2. Moosapet Aug 2025 — exact demo numbers
const moosa = HISTORICAL_DATASET["hst-moosapet"]["2025-08"];
const s = summarizeMonth(moosa);
assert(s.totalRainfallMm === 286, `moosa total = ${s.totalRainfallMm}`);
assert(s.rainyDays === 11, `moosa rainy = ${s.rainyDays}`);
assert(s.waterloggingDays === 4, `moosa waterlogging = ${s.waterloggingDays}`);
assert(s.severeDays === 2, `moosa severe = ${s.severeDays}`);
assert(s.estimatedDurationHours === 8.5, `moosa duration = ${s.estimatedDurationHours}`);
assert(s.highestRainfall?.mm === 61 && s.highestRainfall.day === 12, "moosa highest");
assert(s.highestRiskDay?.day === 12 && s.highestRiskDay.status === "severe", "moosa risk day");

// 3. day 12 details
const d12 = moosa.days.find((d) => d.day === 12)!;
assert(d12.rainfallMm === 61 && d12.peakIntensityMmHr === 38, "d12 rainfall");
assert(d12.status === "severe" && d12.documented && d12.reports === 3, "d12 meta");
assert(d12.estimatedStartTime === "20:30" && d12.estimatedEndTime === "23:00", "d12 window");

// 4. Tolichowki Aug differs from Moosapet Aug
const toll = summarizeMonth(HISTORICAL_DATASET["hs-tolichowki"]["2025-08"]);
assert(toll.totalRainfallMm === 198 && toll.rainyDays === 8 && toll.waterloggingDays === 3 && toll.severeDays === 1, `toll ${JSON.stringify(toll)}`);

// 5. Moosapet Sep differs from Moosapet Aug
const sep = HISTORICAL_DATASET["hst-moosapet"]["2025-09"];
assert(
  sep.days.map((d) => d.rainfallMm).join() !== moosa.days.map((d) => d.rainfallMm).join(),
  "sep differs from aug"
);

// 6. timeline for d12
const tl = buildEventTimeline(d12);
assert(tl.length === 5, `timeline len ${tl.length}`);
assert(tl[0].time === "7:45 PM", `timeline first ${tl[0].time}`);
assert(tl[4].time === "11:00 PM", `timeline last ${tl[4].time}`);
assert(formatTime12h("16:45") === "4:45 PM" && formatTime12h("08:05") === "8:05 AM", "time fmt");

// 7. factors
const loc = getHistoricalLocation("hst-moosapet")!;
const factors = getRiskFactors(d12, loc);
assert(factors.length >= 3 && factors.length <= 4, `factors ${factors.length}`);

// 8. async service resolves
const viaService = await getHistoricalData("hst-moosapet", "2025-08");
assert(viaService?.days.length === 31, "service lookup");
assert((await getHistoricalData("nope", "2025-08")) === null, "service unknown -> null");

// 9. months are not identical across scenario kinds (May dry vs Aug peak)
let mayEvents = 0;
for (const loc2 of HISTORICAL_LOCATIONS) {
  mayEvents += HISTORICAL_DATASET[loc2.id]["2025-05"].days.filter(
    (d) => d.status === "waterlogging" || d.status === "severe"
  ).length;
}
let augEvents = 0;
for (const loc2 of HISTORICAL_LOCATIONS) {
  augEvents += HISTORICAL_DATASET[loc2.id]["2025-08"].days.filter(
    (d) => d.status === "waterlogging" || d.status === "severe"
  ).length;
}
console.log(`May events: ${mayEvents}, Aug events: ${augEvents}, locations: ${HISTORICAL_LOCATIONS.length}`);
assert(augEvents > mayEvents * 2, "aug should be far wetter than may");
assert(mayEvents <= 3, "may should be nearly dry");

// 10. distribution stats per month for eyeballing
for (const m of HISTORICAL_MONTHS) {
  const stats = HISTORICAL_LOCATIONS.map((l) => {
    const sm = summarizeMonth(HISTORICAL_DATASET[l.id][m.id]);
    return `${l.name}: ${sm.totalRainfallMm}mm/${sm.rainyDays}d/${sm.waterloggingDays}wl/${sm.severeDays}sv`;
  });
  console.log(`\n${m.label}\n  ` + stats.join("\n  "));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
