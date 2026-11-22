import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart
} from "recharts";
import {
  Sprout, Truck, Percent, Calculator, TrendingUp,
  CheckCircle2, AlertTriangle, Sparkles, ArrowRight, ArrowLeft,
  Loader2, RefreshCw, Wrench, Users, Landmark, ExternalLink, Info, Search
} from "lucide-react";

// ---------- Design tokens — OZblu-inspired: deep berry navy, bright sky blue, cream ----------
const T = {
  ink: "#0C1B44",       // OZblu deep navy
  ink2: "#42527A",
  paper: "#F6F4EC",     // warm cream
  card: "#FFFFFF",
  line: "#E3DFD2",
  navy: "#0C1B44",       // hero / nav background
  sky: "#2E7DD1",        // bright accent blue
  skyDeep: "#184E92",
  leaf: "#3F8F5C",
  leafBg: "#E9F4EC",
  clay: "#C97C3D",
  clayBg: "#FBF0E4",
  gold: "#B08B2E",
  goldBg: "#F6EFDC",
};

// ---------- Formatting ----------
const fmt0 = (n) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(
    isFinite(n) ? n : 0
  );
const fmtPct = (n, d = 1) => `${isFinite(n) ? n.toFixed(d) : "0"}%`;

// ---------- Financial engine ----------
function calcNPV(rateDecimal, flows) {
  return flows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rateDecimal, i), 0);
}

function calcIRR(flows) {
  let low = -0.95, high = 3.0;
  let npvLow = calcNPV(low, flows);
  let npvHigh = calcNPV(high, flows);
  if ((npvLow > 0 && npvHigh > 0) || (npvLow < 0 && npvHigh < 0)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const npvMid = calcNPV(mid, flows);
    if (Math.abs(npvMid) < 1) return mid;
    if ((npvMid < 0 && npvLow < 0) || (npvMid > 0 && npvLow > 0)) {
      low = mid; npvLow = npvMid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

function buildModel(inp) {
  const {
    purchasePriceMode, purchasePrice, purchasePriceLocal, exchangeRateToAUD,
    machineWeightKg, shippingCostPerKg, importDutyRate, gstRate, gstRecoverable,
    installationCost, contingencyPct,
    operateWorkers, hourlyWageRate, operateHoursPerWeek, operateWeeksPerYear,
    trainWorkers, trainWeeks, trainHoursPerWeek, trainingMaterialsCost,
    usefulLife, salvageValue, discountRate, termDepositRate,
    includeTax, taxRate,
    annualYieldIncrease, pricePerKg, laborSavings, wasteReductionSavings,
    qualityPremium, maintenanceCost, energyCost, insuranceCost, revenueGrowthRate,
  } = inp;

  const purchasePriceAUD = purchasePriceMode === "foreign"
    ? purchasePriceLocal * exchangeRateToAUD
    : purchasePrice;

  const shippingCost = (machineWeightKg || 0) * (shippingCostPerKg || 0);
  const importDutyCost = purchasePriceAUD * (importDutyRate / 100);
  const gstBase = purchasePriceAUD + importDutyCost + shippingCost;
  const gstAmount = gstBase * (gstRate / 100);
  const gstCostIncluded = gstRecoverable ? 0 : gstAmount;

  const operatingLaborCostAnnual = (operateWorkers || 0) * (hourlyWageRate || 0) * (operateHoursPerWeek || 0) * (operateWeeksPerYear || 0);
  const trainingLaborCost = (trainWorkers || 0) * (trainWeeks || 0) * (trainHoursPerWeek || 0) * (hourlyWageRate || 0);
  const trainingCost = trainingLaborCost + (trainingMaterialsCost || 0);

  const subtotal = purchasePriceAUD + importDutyCost + shippingCost + installationCost + gstCostIncluded;
  const contingencyAmount = subtotal * (contingencyPct / 100);
  const initialOutlay = subtotal + contingencyAmount + trainingCost;

  const baseRevenue = annualYieldIncrease * pricePerKg + laborSavings + wasteReductionSavings + qualityPremium;
  const baseCosts = maintenanceCost + energyCost + insuranceCost + operatingLaborCostAnnual;

  const depreciableBase = purchasePriceAUD + installationCost - salvageValue;
  const depreciation = usefulLife > 0 ? Math.max(depreciableBase / usefulLife, 0) : 0;

  const schedule = [];
  const flows = [-initialOutlay];

  for (let t = 1; t <= usefulLife; t++) {
    const revenue = baseRevenue * Math.pow(1 + revenueGrowthRate / 100, t - 1);
    const costs = baseCosts;
    const ebitda = revenue - costs;

    let netCF;
    let tax = 0;
    if (includeTax) {
      const ebit = ebitda - depreciation;
      tax = ebit * (taxRate / 100);
      netCF = ebitda - tax;
    } else {
      netCF = ebitda;
    }

    let salvageThisYear = 0;
    if (t === usefulLife) {
      salvageThisYear = salvageValue;
      netCF += salvageThisYear;
    }

    flows.push(netCF);
    schedule.push({
      year: t, revenue, costs, tax, salvage: salvageThisYear, netCF,
      discounted: netCF / Math.pow(1 + discountRate / 100, t),
    });
  }

  let cumulative = -initialOutlay;
  let paybackYear = null;
  for (const row of schedule) {
    const prevCumulative = cumulative;
    cumulative += row.netCF;
    row.cumulative = cumulative;
    if (paybackYear === null && cumulative >= 0) {
      const fraction = row.netCF !== 0 ? Math.abs(prevCumulative) / row.netCF : 0;
      paybackYear = row.year - 1 + fraction;
    }
  }

  const npv = calcNPV(discountRate / 100, flows);
  const irr = calcIRR(flows);
  const pi = initialOutlay !== 0 ? (npv + initialOutlay) / initialOutlay : null;

  const sensitivity = [];
  for (let r = 0; r <= 32; r += 2) sensitivity.push({ rate: r, npv: calcNPV(r / 100, flows) });

  const td = termDepositRate / 100;
  const fvBank = initialOutlay * Math.pow(1 + td, usefulLife);
  let fvProject = 0;
  schedule.forEach((row) => {
    fvProject += row.netCF * Math.pow(1 + td, usefulLife - row.year);
  });

  return {
    purchasePriceAUD, shippingCost, importDutyCost, gstAmount, gstCostIncluded,
    operatingLaborCostAnnual, trainingLaborCost, trainingCost, contingencyAmount,
    initialOutlay, depreciation, schedule, flows, npv, irr, pi, paybackYear,
    sensitivity, baseRevenue, baseCosts, fvBank, fvProject,
  };
}

// ---------- Default scenario ----------
const DEFAULT_INPUTS = {
  projectName: "Automated Sorting & Harvesting Line",
  purchasePriceMode: "foreign",
  purchasePrice: 180000,
  purchasePriceLocal: 830000,
  originCurrency: "CNY",
  originCountry: "China",
  exchangeRateToAUD: 0.207,
  usefulLife: 8,
  machineWeightKg: 4200,
  shippingCostPerKg: 5,
  importDutyRate: 0,
  gstRate: 10,
  gstRecoverable: true,
  installationCost: 22000,
  contingencyPct: 8,
  operateWorkers: 2,
  hourlyWageRate: 25.74,
  operateHoursPerWeek: 38,
  operateWeeksPerYear: 22,
  trainWorkers: 1,
  trainWeeks: 3,
  trainHoursPerWeek: 38,
  trainingMaterialsCost: 2000,
  salvageValue: 15000,
  discountRate: 10,
  termDepositRate: 4.2,
  includeTax: false,
  taxRate: 30,
  annualYieldIncrease: 0,
  pricePerKg: 5.2,
  laborSavings: 38000,
  wasteReductionSavings: 24000,
  qualityPremium: 12000,
  maintenanceCost: 9000,
  energyCost: 4000,
  insuranceCost: 2500,
  revenueGrowthRate: 2,
};

const CURRENCIES = ["CNY", "USD", "EUR", "JPY", "NZD", "GBP"];

const STEPS = [
  { key: "basics", label: "The Machine", icon: Sprout },
  { key: "logistics", label: "Landing It On Farm", icon: Truck },
  { key: "workforce", label: "Workforce & Training", icon: Users },
  { key: "benefits", label: "What It Earns You", icon: TrendingUp },
  { key: "costs", label: "What It Costs To Run", icon: Wrench },
  { key: "assumptions", label: "The Fine Print", icon: Percent },
  { key: "review", label: "Review", icon: Calculator },
];

function demoClaudeResponse(prompt = "") {
  if (prompt.includes("importDutyRatePercent")) {
    return JSON.stringify({
      importDutyRatePercent: 0,
      importDutyBasis: "Demo assumption — confirm tariff classification and FTA eligibility before purchase",
      importDutySourceUrl: "https://www.abf.gov.au/importing-exporting-and-manufacturing/importing",
      gstRatePercent: 10,
      gstSourceUrl: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst",
      rbaCashRatePercent: 4.1,
      rbaCashRateSourceUrl: "https://www.rba.gov.au/statistics/cash-rate/",
      termDepositRatePercent: 4.2,
      termDepositSourceUrl: "https://www.rba.gov.au/statistics/interest-rates/",
      horticultureAwardHourlyRate: 25.74,
      horticultureAwardSourceUrl: "https://calculate.fairwork.gov.au/",
      exchangeRateToAUD: 0.207,
      exchangeRateSourceUrl: "https://www.rba.gov.au/statistics/frequency/exchange-rates.html",
      asOfDate: "Demo scenario",
      confidence: "medium",
      notes: "Editable demo assumptions are loaded. Verify all rates against the linked official sources before committing capital.",
    });
  }
  const result = prompt.match(/RESULTS: NPV = ([^\n]+)/)?.[1] || "the calculated investment result";
  return `Demo investment read: ${result}. The decision should be based on the NPV, the cash-flow profile and whether the project outperforms leaving the funds in the bank.\n\nThe key drivers are the operational savings and the full landed cost, including freight, installation, training and contingency. Stress-test foreign-exchange exposure, tariff treatment and whether the expected labour and waste savings will occur in practice.\n\nBefore committing, obtain a fixed landed-cost quote and run a downside case with lower savings and higher maintenance. Add an Anthropic API key later if you want live research and a tailored AI recommendation.`;
}

// Calls the local proxy when it is available. The fallback keeps static judging
// links fully demonstrable without a server or an exposed API key.
async function callClaude(body) {
  try {
    const response = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("AI service unavailable");
    return await response.json();
  } catch {
    return { content: [{ type: "text", text: demoClaudeResponse(body.messages?.[0]?.content) }], demo: true };
  }
}

function NumberField({ label, value, onChange, prefix, suffix, hint, step = 1, min }) {
  return (
    <label className="block mb-5">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-semibold" style={{ color: T.ink, fontFamily: "Inter" }}>{label}</span>
      </div>
      <div
        className="flex items-center rounded-lg overflow-hidden border transition-colors focus-within:ring-2"
        style={{ borderColor: T.line, background: "#FCFBF8" }}
      >
        {prefix && (
          <span className="pl-3 pr-1 text-sm font-medium" style={{ color: T.ink2, fontFamily: "JetBrains Mono" }}>{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
          className="w-full py-2.5 px-2 bg-transparent outline-none text-base"
          style={{ color: T.ink, fontFamily: "JetBrains Mono" }}
        />
        {suffix && (
          <span className="pr-3 pl-1 text-sm font-medium" style={{ color: T.ink2, fontFamily: "JetBrains Mono" }}>{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs mt-1.5" style={{ color: T.ink2, fontFamily: "Inter" }}>{hint}</p>}
    </label>
  );
}

function SectionIntro({ eyebrow, title, desc }) {
  return (
    <div className="mb-7">
      <div className="text-xs font-bold tracking-[0.15em] uppercase mb-1.5" style={{ color: T.sky, fontFamily: "Inter" }}>{eyebrow}</div>
      <h2 className="text-2xl font-bold mb-1.5" style={{ color: T.ink, fontFamily: "Space Grotesk" }}>{title}</h2>
      <p className="text-sm max-w-lg" style={{ color: T.ink2, fontFamily: "Inter" }}>{desc}</p>
    </div>
  );
}

function SourceTag({ url, label, date }) {
  if (!url) return null;
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] mt-1.5 hover:underline"
      style={{ color: T.sky, fontFamily: "Inter" }}
    >
      <ExternalLink size={11} /> {label}{date ? ` · as of ${date}` : ""}
    </a>
  );
}

export default function App() {
  const [stepIdx, setStepIdx] = useState(-1);
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [showResults, setShowResults] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  const [govData, setGovData] = useState(null);
  const [govLoading, setGovLoading] = useState(false);
  const [govError, setGovError] = useState(false);

  const model = useMemo(() => buildModel(inputs), [inputs]);
  const set = (key) => (val) => setInputs((prev) => ({ ...prev, [key]: val }));

  const goNext = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  const fetchGovData = async () => {
    setGovLoading(true);
    setGovError(false);
    const prompt = `You are a research assistant with live web search. Find current authoritative Australian figures for a farm capital-equipment import decision. Search official sources only: Australian Border Force (abf.gov.au), DFAT free trade agreement portal, the Australian Taxation Office (ato.gov.au), the Reserve Bank of Australia (rba.gov.au), and the Fair Work Ombudsman / Fair Work Commission (fairwork.gov.au).

CONTEXT: An Australian blueberry farm is importing "${inputs.projectName}", a piece of agricultural/food-processing machinery, from ${inputs.originCountry}. The purchase is quoted in ${inputs.originCurrency}.

Find, as close to today's date as you can:
1. The Australian import duty / customs tariff rate (%) that would apply to agricultural or food-processing machinery imported from ${inputs.originCountry}. Check whether a free trade agreement (e.g. ChAFTA for China) reduces this to 0% or another preferential rate. Give one best-estimate percentage and a one-sentence basis.
2. The GST rate applied to imported goods into Australia.
3. The current RBA official cash rate target.
4. A reasonable current indicative business/farm term deposit or savings rate in Australia, for a "money left in the bank" comparison.
5. The current Fair Work Horticulture Award (MA000028) Level 1 adult hourly pay rate, full-time/part-time (not casual).
6. The current exchange rate for converting 1 unit of ${inputs.originCurrency} to AUD, citing the RBA exchange rates page.

Respond with ONLY a raw JSON object, no markdown code fences, no text before or after it, exactly matching this shape:
{"importDutyRatePercent":number,"importDutyBasis":"string","importDutySourceUrl":"string","gstRatePercent":number,"gstSourceUrl":"string","rbaCashRatePercent":number,"rbaCashRateSourceUrl":"string","termDepositRatePercent":number,"termDepositSourceUrl":"string","horticultureAwardHourlyRate":number,"horticultureAwardSourceUrl":"string","exchangeRateToAUD":number,"exchangeRateSourceUrl":"string","asOfDate":"YYYY-MM-DD","confidence":"high|medium|low","notes":"string, at most 2 sentences"}`;

    try {
      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("no JSON in response");
      const parsed = JSON.parse(text.slice(start, end + 1));

      setInputs((prev) => ({
        ...prev,
        importDutyRate: typeof parsed.importDutyRatePercent === "number" ? parsed.importDutyRatePercent : prev.importDutyRate,
        gstRate: typeof parsed.gstRatePercent === "number" ? parsed.gstRatePercent : prev.gstRate,
        termDepositRate: typeof parsed.termDepositRatePercent === "number" ? parsed.termDepositRatePercent : prev.termDepositRate,
        discountRate: typeof parsed.rbaCashRatePercent === "number" ? Math.round((parsed.rbaCashRatePercent + 4) * 10) / 10 : prev.discountRate,
        hourlyWageRate: typeof parsed.horticultureAwardHourlyRate === "number" ? parsed.horticultureAwardHourlyRate : prev.hourlyWageRate,
        exchangeRateToAUD: typeof parsed.exchangeRateToAUD === "number" ? parsed.exchangeRateToAUD : prev.exchangeRateToAUD,
      }));
      setGovData(parsed);
    } catch (err) {
      setGovError(true);
    } finally {
      setGovLoading(false);
    }
  };

  const runAnalysis = async () => {
    setShowResults(true);
    setAiLoading(true);
    setAiError(false);
    setAiText("");

    const verdict = model.npv >= 0 ? "positive NPV (value-creating)" : "negative NPV (value-destroying)";
    const prompt = `You are an agribusiness investment analyst advising a blueberry farm manager at a large-scale Australian berry producer. Assess this capital investment in plain, direct language a farm manager (not a finance person) can act on.

PROJECT: ${inputs.projectName}, imported from ${inputs.originCountry}. Useful life: ${inputs.usefulLife} years.

INVESTMENT: Machine ${fmt0(model.purchasePriceAUD)}, shipping ${fmt0(model.shippingCost)}, import duty ${fmt0(model.importDutyCost)} (${inputs.importDutyRate}%), installation ${fmt0(inputs.installationCost)}, contingency ${fmt0(model.contingencyAmount)} (${inputs.contingencyPct}% buffer for hidden costs), training ${fmt0(model.trainingCost)}. Total initial outlay ${fmt0(model.initialOutlay)}.

WORKFORCE: ${inputs.operateWorkers} workers to operate it, ${inputs.trainWorkers} worker(s) trained for ${inputs.trainWeeks} weeks, wage rate ${fmt0(inputs.hourlyWageRate)}/hr (Horticulture Award).

ANNUAL BENEFITS (year 1 base): yield gain ${fmt0(inputs.annualYieldIncrease * inputs.pricePerKg)}, labour savings ${fmt0(inputs.laborSavings)}, waste-reduction savings ${fmt0(inputs.wasteReductionSavings)}, quality premium ${fmt0(inputs.qualityPremium)}, growing at ${inputs.revenueGrowthRate}%/yr.

ANNUAL OPERATING COSTS: maintenance ${fmt0(inputs.maintenanceCost)}, energy ${fmt0(inputs.energyCost)}, insurance ${fmt0(inputs.insuranceCost)}, operator labour ${fmt0(model.operatingLaborCostAnnual)}.

Salvage value: ${fmt0(inputs.salvageValue)}. Discount rate: ${inputs.discountRate}%.

RESULTS: NPV = ${fmt0(model.npv)} (${verdict}). IRR = ${model.irr !== null ? fmtPct(model.irr * 100) : "not determinable"}. Payback = ${model.paybackYear !== null ? model.paybackYear.toFixed(1) + " years" : "beyond project life"}.

BANK COMPARISON: if the ${fmt0(model.initialOutlay)} initial outlay were instead left in a term deposit at ${inputs.termDepositRate}% for ${inputs.usefulLife} years it would grow to ${fmt0(model.fvBank)}. Taking on the project and reinvesting its cash flows at that same rate instead leaves the farm with ${fmt0(model.fvProject)} at the same point in time.

Write a recommendation of about 170 words in 3 short plain paragraphs, no markdown headers: (1) a one-line verdict including how it compares to just banking the money, (2) the 1-2 factors driving that result and the single biggest risk or assumption to stress-test (mention import duty, FX or wage-rate uncertainty if material), (3) one concrete next step before committing capital. Interpret the numbers, don't just restate them.`;

    try {
      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (text) setAiText(text); else throw new Error("empty response");
    } catch (err) {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  const restart = () => {
    setShowResults(false);
    setStepIdx(-1);
    setAiText("");
    setAiError(false);
  };

  const GovFillButton = ({ compact }) => (
    <div className="mb-6">
      <button
        onClick={fetchGovData}
        disabled={govLoading}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide disabled:opacity-60"
        style={{ background: T.goldBg, color: T.gold, border: `1px solid ${T.gold}55` }}
      >
        {govLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        {govLoading ? "Searching ABF, RBA, ATO, Fair Work…" : "Auto-fill from government & RBA sources"}
      </button>
      {govError && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: T.clay }}>
          <AlertTriangle size={12} /> Couldn't reach the sources just now — check the server terminal for an ANTHROPIC_API_KEY error, or try again shortly.
        </p>
      )}
      {govData && !compact && (
        <div className="mt-3 rounded-lg p-3 text-xs leading-relaxed" style={{ background: T.goldBg, color: "#6B5320" }}>
          <div className="flex items-center gap-1.5 font-semibold mb-1"><Info size={12} /> As of {govData.asOfDate} · confidence: {govData.confidence}</div>
          {govData.notes}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full min-h-screen" style={{ background: T.paper, fontFamily: "Inter" }}>
      {/* NAV — OZblu-style dark bar with uppercase links */}
      <div style={{ background: T.navy }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: T.sky }}>
              <div className="w-3 h-3 rounded-full bg-white" />
            </div>
            <div style={{ fontFamily: "Space Grotesk" }}>
              <span className="font-bold text-base text-white">BLUELEDGER</span>
              <span className="text-base font-bold" style={{ color: T.sky }}> AI</span>
            </div>
          </div>
          <div className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#B9C4E0" }}>
            Hack the Harvest &middot; OzBlu Capex Tool
          </div>
        </div>
      </div>

      {/* INTRO — OZblu-style dark hero, bold uppercase headline, pill CTA */}
      {stepIdx === -1 && !showResults && (
        <>
          <div style={{ background: T.navy }} className="pb-20 pt-16">
            <div className="max-w-3xl mx-auto px-6 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide mb-6" style={{ background: "rgba(46,125,209,0.18)", color: T.sky }}>
                <Sparkles size={13} /> AI-assisted, Australian-data-grounded
              </div>
              <h1 className="text-4xl sm:text-6xl font-bold leading-[1.05] mb-6 uppercase text-white" style={{ fontFamily: "Space Grotesk" }}>
                The Clearer,<br /> Sharper, Smarter<br /> Capex Call.
              </h1>
              <p className="text-base leading-relaxed mb-10 max-w-xl mx-auto" style={{ color: "#C7D0E8" }}>
                Answer a few short questions about a piece of farm equipment. BlueLedger pulls current import duty, GST,
                RBA rates and Award wages from official Australian sources, builds the incremental cash flow model, and
                gives you a plain-English AI verdict.
              </p>
              <button onClick={() => setStepIdx(0)} className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold uppercase tracking-wide text-sm transition-transform hover:scale-[1.03]" style={{ background: T.sky, color: "#fff" }}>
                Start The Assessment <ArrowRight size={17} />
              </button>
            </div>
          </div>
          <div className="max-w-5xl mx-auto px-6 -mt-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                ["Real Landed Cost", "Duty, shipping, GST, install, training and a contingency buffer for the hidden costs — not just the sticker price."],
                ["Government-Sourced Rates", "Import duty, RBA cash rate, term-deposit rate and Award wages, pulled live from ABF, RBA, ATO and Fair Work."],
                ["NPV vs. The Bank", "Compares the project's return against simply leaving the same money in a term deposit."],
              ].map(([t, d]) => (
                <div key={t} className="p-5 rounded-2xl" style={{ background: T.card, border: `1px solid ${T.line}`, boxShadow: "0 12px 24px -18px rgba(12,27,68,0.35)" }}>
                  <div className="text-sm font-bold uppercase tracking-wide mb-1.5" style={{ color: T.navy, fontFamily: "Space Grotesk" }}>{t}</div>
                  <div className="text-xs leading-relaxed" style={{ color: T.ink2 }}>{d}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-16" />
        </>
      )}

      {/* WIZARD */}
      {stepIdx >= 0 && !showResults && (
        <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-10">
          <div className="hidden md:block">
            <div className="space-y-1">
              {STEPS.map((s, i) => {
                const active = i === stepIdx;
                const done = i < stepIdx;
                return (
                  <div key={s.key} onClick={() => setStepIdx(i)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer"
                    style={{ background: active ? T.card : "transparent", border: active ? `1px solid ${T.line}` : "1px solid transparent" }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ background: done ? T.leaf : active ? T.navy : "#E9E5D8", color: done || active ? "#fff" : T.ink2, fontFamily: "JetBrains Mono" }}>
                      {done ? <CheckCircle2 size={13} /> : i + 1}
                    </div>
                    <span className="text-sm" style={{ color: active ? T.ink : T.ink2, fontWeight: active ? 700 : 500 }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="rounded-2xl p-7" style={{ background: T.card, border: `1px solid ${T.line}` }}>

              {stepIdx === 0 && (
                <>
                  <SectionIntro eyebrow="Step 1 of 7" title="What are you buying?" desc="Name the equipment and tell us how long it will realistically stay productive on the farm." />
                  <label className="block mb-5">
                    <span className="text-sm font-semibold" style={{ color: T.ink }}>Project / equipment name</span>
                    <input value={inputs.projectName} onChange={(e) => set("projectName")(e.target.value)}
                      className="w-full mt-1.5 py-2.5 px-3 rounded-lg border outline-none text-base"
                      style={{ borderColor: T.line, background: "#FCFBF8", color: T.ink }} />
                  </label>
                  <NumberField label="Useful life" suffix="years" value={inputs.usefulLife} onChange={set("usefulLife")} min={1} />
                </>
              )}

              {stepIdx === 1 && (
                <>
                  <SectionIntro eyebrow="Step 2 of 7" title="Landing it on the farm" desc="Where it's coming from, what it weighs, and the one-off costs of getting it bought, through customs and installed." />
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <label className="block">
                      <span className="text-sm font-semibold" style={{ color: T.ink }}>Country of origin</span>
                      <input value={inputs.originCountry} onChange={(e) => set("originCountry")(e.target.value)}
                        className="w-full mt-1.5 py-2.5 px-3 rounded-lg border outline-none text-base"
                        style={{ borderColor: T.line, background: "#FCFBF8", color: T.ink }} />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold" style={{ color: T.ink }}>Quote currency</span>
                      <select value={inputs.originCurrency} onChange={(e) => set("originCurrency")(e.target.value)}
                        className="w-full mt-1.5 py-2.5 px-3 rounded-lg border outline-none text-base"
                        style={{ borderColor: T.line, background: "#FCFBF8", color: T.ink, fontFamily: "JetBrains Mono" }}>
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <NumberField label={`Purchase price (${inputs.originCurrency})`} value={inputs.purchasePriceLocal} onChange={set("purchasePriceLocal")} />
                    <NumberField label={`Exchange rate → AUD`} value={inputs.exchangeRateToAUD} onChange={set("exchangeRateToAUD")} step={0.001}
                      hint={`≈ ${fmt0(inputs.purchasePriceLocal * inputs.exchangeRateToAUD)} AUD`} />
                  </div>

                  <GovFillButton />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <NumberField label="Import duty" suffix="%" value={inputs.importDutyRate} onChange={set("importDutyRate")}
                        hint={`= ${fmt0(model.importDutyCost)} on this landed price`} />
                      <SourceTag url={govData?.importDutySourceUrl} label={govData?.importDutyBasis || "Australian Border Force"} date={govData?.asOfDate} />
                    </div>
                    <div>
                      <NumberField label="GST on import" suffix="%" value={inputs.gstRate} onChange={set("gstRate")} />
                      <SourceTag url={govData?.gstSourceUrl} label="ATO / ABF" date={govData?.asOfDate} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2.5 mb-5 cursor-pointer select-none">
                    <input type="checkbox" checked={inputs.gstRecoverable} onChange={(e) => set("gstRecoverable")(e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm" style={{ color: T.ink }}>Farm is GST-registered — import GST is a recoverable credit, not an economic cost</span>
                  </label>

                  <div className="grid grid-cols-2 gap-4">
                    <NumberField label="Machine weight" suffix="kg" value={inputs.machineWeightKg} onChange={set("machineWeightKg")} />
                    <NumberField label="Shipping cost" prefix="$" suffix="/kg" value={inputs.shippingCostPerKg} onChange={set("shippingCostPerKg")} step={0.1}
                      hint={`= ${fmt0(model.shippingCost)} total freight`} />
                    <NumberField label="Installation & setup" prefix="$" value={inputs.installationCost} onChange={set("installationCost")} />
                    <NumberField label="Contingency buffer" suffix="%" value={inputs.contingencyPct} onChange={set("contingencyPct")}
                      hint="Covers cranes, foundations, wiring, port fees and the unknowns" />
                    <NumberField label="Salvage value at end of life" prefix="$" value={inputs.salvageValue} onChange={set("salvageValue")} />
                  </div>
                </>
              )}

              {stepIdx === 2 && (
                <>
                  <SectionIntro eyebrow="Step 3 of 7" title="Workforce & training" desc="Who runs it day to day, and who needs training before it goes live." />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <NumberField label="Award wage rate" prefix="$" suffix="/hr" value={inputs.hourlyWageRate} onChange={set("hourlyWageRate")} step={0.01} />
                      <SourceTag url={govData?.horticultureAwardSourceUrl} label="Fair Work Horticulture Award (MA000028), Level 1" date={govData?.asOfDate} />
                    </div>
                    <div />
                    <NumberField label="Workers to operate it" value={inputs.operateWorkers} onChange={set("operateWorkers")} />
                    <NumberField label="Operating hours" suffix="/wk" value={inputs.operateHoursPerWeek} onChange={set("operateHoursPerWeek")} />
                    <NumberField label="Weeks in season" suffix="wks/yr" value={inputs.operateWeeksPerYear} onChange={set("operateWeeksPerYear")}
                      hint={`Annual operating labour ≈ ${fmt0(model.operatingLaborCostAnnual)}`} />
                  </div>
                  <div className="h-px my-2" style={{ background: T.line }} />
                  <div className="grid grid-cols-2 gap-4 mt-5">
                    <NumberField label="Workers to train" value={inputs.trainWorkers} onChange={set("trainWorkers")} />
                    <NumberField label="Training duration" suffix="weeks" value={inputs.trainWeeks} onChange={set("trainWeeks")} />
                    <NumberField label="Training hours" suffix="/wk" value={inputs.trainHoursPerWeek} onChange={set("trainHoursPerWeek")} />
                    <NumberField label="Training materials" prefix="$" value={inputs.trainingMaterialsCost} onChange={set("trainingMaterialsCost")}
                      hint={`Total training cost ≈ ${fmt0(model.trainingCost)}`} />
                  </div>
                  {!govData && <div className="mt-2"><GovFillButton compact /></div>}
                </>
              )}

              {stepIdx === 3 && (
                <>
                  <SectionIntro eyebrow="Step 4 of 7" title="What does it earn you?" desc="The incremental gains this machine creates — above and beyond what you'd get without it." />
                  <div className="grid grid-cols-2 gap-4">
                    <NumberField label="Extra yield captured" suffix="kg/yr" value={inputs.annualYieldIncrease} onChange={set("annualYieldIncrease")} />
                    <NumberField label="Price per kg" prefix="$" value={inputs.pricePerKg} onChange={set("pricePerKg")} step={0.1} />
                    <NumberField label="Labour cost savings" prefix="$" suffix="/yr" value={inputs.laborSavings} onChange={set("laborSavings")} />
                    <NumberField label="Waste / spoilage reduction" prefix="$" suffix="/yr" value={inputs.wasteReductionSavings} onChange={set("wasteReductionSavings")} />
                    <NumberField label="Quality / grading premium" prefix="$" suffix="/yr" value={inputs.qualityPremium} onChange={set("qualityPremium")} />
                    <NumberField label="Revenue growth" suffix="%/yr" value={inputs.revenueGrowthRate} onChange={set("revenueGrowthRate")} />
                  </div>
                </>
              )}

              {stepIdx === 4 && (
                <>
                  <SectionIntro eyebrow="Step 5 of 7" title="What does it cost to run?" desc="The extra running costs the machine adds every year once it's on farm. Operator wages carry over from the workforce step." />
                  <div className="grid grid-cols-2 gap-4">
                    <NumberField label="Maintenance & servicing" prefix="$" suffix="/yr" value={inputs.maintenanceCost} onChange={set("maintenanceCost")} />
                    <NumberField label="Energy / power" prefix="$" suffix="/yr" value={inputs.energyCost} onChange={set("energyCost")} />
                    <NumberField label="Insurance" prefix="$" suffix="/yr" value={inputs.insuranceCost} onChange={set("insuranceCost")} />
                    <div className="rounded-lg p-3 flex flex-col justify-center" style={{ background: T.paper, border: `1px solid ${T.line}` }}>
                      <span className="text-xs font-medium" style={{ color: T.ink2 }}>Operator labour (from Step 3)</span>
                      <span className="text-lg font-bold" style={{ color: T.ink, fontFamily: "JetBrains Mono" }}>{fmt0(model.operatingLaborCostAnnual)}/yr</span>
                    </div>
                  </div>
                </>
              )}

              {stepIdx === 5 && (
                <>
                  <SectionIntro eyebrow="Step 6 of 7" title="The fine print" desc="Cost of capital, tax treatment, and the rate we'll compare against if you left the money in the bank instead." />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <NumberField label="Discount rate (cost of capital)" suffix="%" value={inputs.discountRate} onChange={set("discountRate")} step={0.5} />
                      <SourceTag url={govData?.rbaCashRateSourceUrl} label="RBA cash rate + risk margin" date={govData?.asOfDate} />
                    </div>
                    <div>
                      <NumberField label="Term deposit rate (bank comparison)" suffix="%" value={inputs.termDepositRate} onChange={set("termDepositRate")} step={0.1} />
                      <SourceTag url={govData?.termDepositSourceUrl} label="RBA indicative deposit rates" date={govData?.asOfDate} />
                    </div>
                    <NumberField label="Tax rate" suffix="%" value={inputs.taxRate} onChange={set("taxRate")} />
                  </div>
                  {!govData && <GovFillButton compact />}
                  <label className="flex items-center gap-2.5 mt-1 cursor-pointer select-none">
                    <input type="checkbox" checked={inputs.includeTax} onChange={(e) => set("includeTax")(e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm" style={{ color: T.ink }}>Include tax &amp; straight-line depreciation shield in the cash flows</span>
                  </label>
                </>
              )}

              {stepIdx === 6 && (
                <>
                  <SectionIntro eyebrow="Step 7 of 7" title="Review before we crunch it" desc="Quick sanity check of every input. Go back to adjust anything, or run the analysis." />
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm" style={{ fontFamily: "JetBrains Mono" }}>
                    {[
                      ["Project", inputs.projectName],
                      ["Origin", `${inputs.originCountry} (${inputs.originCurrency})`],
                      ["Machine price (AUD)", fmt0(model.purchasePriceAUD)],
                      ["Shipping", fmt0(model.shippingCost)],
                      ["Import duty", `${inputs.importDutyRate}% (${fmt0(model.importDutyCost)})`],
                      ["GST cost included", inputs.gstRecoverable ? "No (recoverable)" : fmt0(model.gstAmount)],
                      ["Installation", fmt0(inputs.installationCost)],
                      ["Contingency", `${inputs.contingencyPct}% (${fmt0(model.contingencyAmount)})`],
                      ["Training (labour + materials)", fmt0(model.trainingCost)],
                      ["Total initial outlay", fmt0(model.initialOutlay)],
                      ["Operator labour / yr", fmt0(model.operatingLaborCostAnnual)],
                      ["Annual benefits (yr 1)", fmt0(model.baseRevenue)],
                      ["Annual op. costs (yr 1)", fmt0(model.baseCosts)],
                      ["Discount rate", `${inputs.discountRate}%`],
                      ["Term deposit rate", `${inputs.termDepositRate}%`],
                      ["Tax modelled", inputs.includeTax ? `Yes (${inputs.taxRate}%)` : "No"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b py-1.5" style={{ borderColor: T.line }}>
                        <span style={{ color: T.ink2, fontFamily: "Inter" }}>{k}</span>
                        <span style={{ color: T.ink, fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="flex items-center justify-between mt-8 pt-5 border-t" style={{ borderColor: T.line }}>
                <button onClick={goBack} disabled={stepIdx === 0} className="inline-flex items-center gap-1.5 text-sm font-medium disabled:opacity-30" style={{ color: T.ink2 }}>
                  <ArrowLeft size={15} /> Back
                </button>
                {stepIdx < STEPS.length - 1 ? (
                  <button onClick={goNext} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold uppercase tracking-wide text-xs text-white" style={{ background: T.navy }}>
                    Continue <ArrowRight size={15} />
                  </button>
                ) : (
                  <button onClick={runAnalysis} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold uppercase tracking-wide text-xs text-white" style={{ background: T.leaf }}>
                    <Calculator size={15} /> Run The Analysis
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESULTS */}
      {showResults && (
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
            <div>
              <div className="text-xs font-bold tracking-[0.15em] uppercase mb-1" style={{ color: T.sky }}>Results</div>
              <h2 className="text-2xl font-bold" style={{ color: T.ink, fontFamily: "Space Grotesk" }}>{inputs.projectName}</h2>
            </div>
            <button onClick={restart} className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-full" style={{ color: T.ink2, border: `1px solid ${T.line}` }}>
              <RefreshCw size={14} /> New scenario
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 mb-6">
            <div className="flex flex-col items-center justify-center rounded-2xl px-8 py-6 shrink-0"
              style={{ background: model.npv >= 0 ? T.leafBg : T.clayBg, border: `2px dashed ${model.npv >= 0 ? T.leaf : T.clay}`, transform: "rotate(-2deg)", minWidth: 190 }}>
              {model.npv >= 0 ? <CheckCircle2 size={30} style={{ color: T.leaf }} /> : <AlertTriangle size={30} style={{ color: T.clay }} />}
              <div className="text-lg font-bold mt-1.5 tracking-wide" style={{ color: model.npv >= 0 ? T.leaf : T.clay, fontFamily: "Space Grotesk" }}>
                {model.npv >= 0 ? "INVEST" : "HOLD OFF"}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: T.ink2 }}>NPV-based verdict</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Net Present Value", fmt0(model.npv), model.npv >= 0 ? T.leaf : T.clay],
                ["IRR", model.irr !== null ? fmtPct(model.irr * 100) : "n/a", T.ink],
                ["Payback period", model.paybackYear !== null ? `${model.paybackYear.toFixed(1)} yrs` : `> ${inputs.usefulLife} yrs`, T.ink],
                ["Profitability index", model.pi !== null ? model.pi.toFixed(2) : "n/a", T.ink],
              ].map(([label, val, color]) => (
                <div key={label} className="rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <div className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: T.ink2 }}>{label}</div>
                  <div className="text-xl font-bold" style={{ color, fontFamily: "JetBrains Mono" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-6 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="flex items-center gap-2 mb-4">
              <Landmark size={16} style={{ color: T.sky }} />
              <span className="text-sm font-bold uppercase tracking-wide" style={{ color: T.ink, fontFamily: "Space Grotesk" }}>Or, leave the money in the bank?</span>
            </div>
            <p className="text-sm mb-4" style={{ color: T.ink2 }}>
              If the {fmt0(model.initialOutlay)} initial outlay stayed in a term deposit at {fmtPct(inputs.termDepositRate)} for {inputs.usefulLife} years,
              versus buying the machine and reinvesting its cash flows at that same rate:
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ background: T.paper }}>
                <div className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: T.ink2 }}>Money in the bank, year {inputs.usefulLife}</div>
                <div className="text-xl font-bold" style={{ color: T.ink, fontFamily: "JetBrains Mono" }}>{fmt0(model.fvBank)}</div>
              </div>
              <div className="rounded-xl p-4" style={{ background: model.fvProject >= model.fvBank ? T.leafBg : T.clayBg }}>
                <div className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: T.ink2 }}>Buying the machine, year {inputs.usefulLife}</div>
                <div className="text-xl font-bold" style={{ color: model.fvProject >= model.fvBank ? T.leaf : T.clay, fontFamily: "JetBrains Mono" }}>{fmt0(model.fvProject)}</div>
              </div>
            </div>
            <p className="text-xs mt-3" style={{ color: T.ink2 }}>
              {model.fvProject >= model.fvBank
                ? `The machine beats parking the cash in the bank by ${fmt0(model.fvProject - model.fvBank)}.`
                : `Parking the cash in the bank beats the machine by ${fmt0(model.fvBank - model.fvProject)} on these assumptions.`}
            </p>
          </div>

          {/* AI narrative — styled like an OZblu testimonial quote card */}
          <div className="rounded-2xl p-8 mb-6 relative" style={{ background: T.navy }}>
            <div className="text-5xl font-bold leading-none mb-2" style={{ color: T.sky, fontFamily: "Space Grotesk" }}>“</div>
            <div className="flex items-center gap-2 mb-3 -mt-4">
              <Sparkles size={16} style={{ color: T.sky }} />
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-white">AI Investment Read</span>
            </div>
            {aiLoading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "#C9D3E8" }}>
                <Loader2 size={15} className="animate-spin" /> Reading the numbers and drafting a recommendation...
              </div>
            )}
            {!aiLoading && aiError && (
              <p className="text-sm leading-relaxed" style={{ color: "#C9D3E8" }}>
                Couldn't reach the AI advisor right now. Based on the numbers alone: this project shows a {model.npv >= 0 ? "positive" : "negative"} NPV
                of {fmt0(model.npv)}{model.irr !== null ? ` and an IRR of ${fmtPct(model.irr * 100)}` : ""}, against your {inputs.discountRate}% discount rate. Try again, or check the server terminal for an API key error.
              </p>
            )}
            {!aiLoading && !aiError && aiText && (
              <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#E8ECF6" }}>{aiText}</div>
            )}
          </div>

          <div className="rounded-2xl p-6 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="text-sm font-bold uppercase tracking-wide mb-1" style={{ color: T.ink, fontFamily: "Space Grotesk" }}>The true cost, above and below the waterline</div>
            <p className="text-xs mb-4" style={{ color: T.ink2 }}>The sticker price is only part of what lands on the farm.</p>
            <div className="rounded-lg overflow-hidden flex h-10 w-full">
              <div style={{ width: `${(model.purchasePriceAUD / model.initialOutlay) * 100}%`, background: T.sky }} title="Purchase price" />
              <div style={{ width: `${((model.initialOutlay - model.purchasePriceAUD) / model.initialOutlay) * 100}%`, background: T.navy }} title="Everything else" />
            </div>
            <div className="flex items-center gap-1.5 mt-2 mb-4">
              <div className="flex-1 h-px" style={{ background: T.clay }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: T.clay }}>waterline</span>
              <div className="flex-1 h-px" style={{ background: T.clay }} />
            </div>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: T.sky }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: T.sky }} /> Above the waterline</div>
                <div className="flex justify-between py-1" style={{ color: T.ink2 }}><span>Purchase price</span><span style={{ fontFamily: "JetBrains Mono", color: T.ink }}>{fmt0(model.purchasePriceAUD)}</span></div>
              </div>
              <div>
                <div className="font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: T.navy }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: T.navy }} /> Below the waterline</div>
                {[
                  ["Shipping", model.shippingCost], ["Import duty", model.importDutyCost], ["GST (non-recoverable)", model.gstCostIncluded],
                  ["Installation", inputs.installationCost], ["Contingency buffer", model.contingencyAmount], ["Training", model.trainingCost],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1" style={{ color: T.ink2 }}><span>{k}</span><span style={{ fontFamily: "JetBrains Mono", color: T.ink }}>{fmt0(v)}</span></div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 mb-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: T.ink, fontFamily: "Space Grotesk" }}>Incremental cash flow &amp; cumulative payback</div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={[{ year: 0, netCF: -model.initialOutlay, cumulative: -model.initialOutlay }, ...model.schedule]}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: T.ink2 }} label={{ value: "Year", position: "insideBottom", offset: -3, fontSize: 11, fill: T.ink2 }} />
                <YAxis tick={{ fontSize: 11, fill: T.ink2 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt0(v)} labelFormatter={(l) => `Year ${l}`} />
                <ReferenceLine y={0} stroke={T.ink2} />
                <Bar dataKey="netCF" name="Net cash flow" fill={T.sky} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke={T.navy} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: T.ink, fontFamily: "Space Grotesk" }}>NPV sensitivity to discount rate</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={model.sensitivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.line} />
                  <XAxis dataKey="rate" tick={{ fontSize: 11, fill: T.ink2 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis tick={{ fontSize: 11, fill: T.ink2 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => fmt0(v)} labelFormatter={(l) => `${l}% discount rate`} />
                  <ReferenceLine y={0} stroke={T.clay} strokeDasharray="4 4" />
                  <ReferenceLine x={inputs.discountRate} stroke={T.navy} strokeDasharray="4 4" label={{ value: "Your rate", fontSize: 10, fill: T.navy }} />
                  <Line type="monotone" dataKey="npv" stroke={T.sky} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: T.ink, fontFamily: "Space Grotesk" }}>Initial outlay breakdown</div>
              <div className="space-y-2.5">
                {[
                  ["Purchase price", model.purchasePriceAUD], ["Shipping", model.shippingCost],
                  [`Import duty (${inputs.importDutyRate}%)`, model.importDutyCost], ["GST (non-recoverable)", model.gstCostIncluded],
                  ["Installation & setup", inputs.installationCost], ["Contingency buffer", model.contingencyAmount], ["Training", model.trainingCost],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm"><span style={{ color: T.ink2 }}>{k}</span><span style={{ color: T.ink, fontFamily: "JetBrains Mono", fontWeight: 600 }}>{fmt0(v)}</span></div>
                ))}
                <div className="flex justify-between text-sm pt-2.5 mt-1 border-t" style={{ borderColor: T.line }}>
                  <span className="font-semibold" style={{ color: T.ink }}>Total initial outlay</span>
                  <span className="font-bold" style={{ color: T.navy, fontFamily: "JetBrains Mono" }}>{fmt0(model.initialOutlay)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 overflow-x-auto" style={{ background: T.card, border: `1px solid ${T.line}` }}>
            <div className="text-sm font-bold uppercase tracking-wide mb-4" style={{ color: T.ink, fontFamily: "Space Grotesk" }}>Year-by-year schedule</div>
            <table className="w-full text-sm" style={{ fontFamily: "JetBrains Mono" }}>
              <thead>
                <tr className="text-left" style={{ color: T.ink2 }}>
                  {["Year", "Revenue", "Costs", "Net CF", "Discounted CF", "Cumulative"].map((h) => (
                    <th key={h} className="pb-2 pr-4 font-medium text-xs uppercase tracking-wide" style={{ fontFamily: "Inter" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.schedule.map((row) => (
                  <tr key={row.year} className="border-t" style={{ borderColor: T.line }}>
                    <td className="py-2 pr-4" style={{ color: T.ink }}>{row.year}</td>
                    <td className="py-2 pr-4" style={{ color: T.ink2 }}>{fmt0(row.revenue)}</td>
                    <td className="py-2 pr-4" style={{ color: T.ink2 }}>{fmt0(row.costs)}</td>
                    <td className="py-2 pr-4 font-semibold" style={{ color: T.ink }}>{fmt0(row.netCF)}</td>
                    <td className="py-2 pr-4" style={{ color: T.ink2 }}>{fmt0(row.discounted)}</td>
                    <td className="py-2 pr-4 font-semibold" style={{ color: row.cumulative >= 0 ? T.leaf : T.clay }}>{fmt0(row.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {govData && (
            <div className="rounded-2xl p-6 mt-6" style={{ background: T.goldBg, border: `1px solid ${T.gold}44` }}>
              <div className="text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: T.gold }}>
                <Landmark size={13} /> Data &amp; sources used in this scenario
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: "#6B5320" }}>
                <SourceTag url={govData.importDutySourceUrl} label={`Import duty — ${govData.importDutyBasis}`} date={govData.asOfDate} />
                <SourceTag url={govData.gstSourceUrl} label="GST rate" date={govData.asOfDate} />
                <SourceTag url={govData.rbaCashRateSourceUrl} label="RBA cash rate" date={govData.asOfDate} />
                <SourceTag url={govData.termDepositSourceUrl} label="Term deposit rate" date={govData.asOfDate} />
                <SourceTag url={govData.horticultureAwardSourceUrl} label="Horticulture Award wage rate" date={govData.asOfDate} />
                <SourceTag url={govData.exchangeRateSourceUrl} label={`${inputs.originCurrency}/AUD exchange rate`} date={govData.asOfDate} />
              </div>
            </div>
          )}

          <p className="text-xs mt-6 text-center max-w-2xl mx-auto" style={{ color: T.ink2 }}>
            Prototype model for Hack the Harvest. Government-sourced figures are AI-researched estimates for demonstration —
            verify against ABF, ATO, RBA and Fair Work directly before committing capital. Assumes constant operating costs,
            straight-line depreciation, and a simplified tax treatment where selected.
          </p>
        </div>
      )}

      <div style={{ background: T.navy }} className="py-6 mt-10">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs" style={{ color: "#8A97BF" }}>
          BlueLedger AI — built for Hack the Harvest. Not financial, tax, customs or legal advice.
        </div>
      </div>
    </div>
  );
}
