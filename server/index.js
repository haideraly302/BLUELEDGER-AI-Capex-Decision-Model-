import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.warn(
    "\nℹ️  No ANTHROPIC_API_KEY found in .env — BlueLedger will use demo AI responses.\n" +
      "   Add a key later to enable live Claude research and tailored recommendations.\n"
  );
}

function demoClaudeResponse(prompt = "") {
  const isResearchRequest = prompt.includes("importDutyRatePercent");
  if (isResearchRequest) {
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
      notes: "Editable demo assumptions are loaded because no API key is configured. Verify all rates against the linked official sources before committing capital.",
    });
  }

  const npvMatch = prompt.match(/RESULTS: NPV = ([^\n]+)/);
  const result = npvMatch ? npvMatch[1] : "the calculated investment result";
  return `Demo investment read: ${result}. The decision should be based on the NPV, the cash-flow profile and whether the project outperforms the alternative of leaving the funds in the bank.\n\nThe most important drivers are the operational savings and the full landed cost, including freight, installation, training and contingency. Stress-test foreign-exchange exposure, tariff treatment and whether the expected labour and waste savings will occur in practice.\n\nBefore committing, obtain a fixed landed-cost quote and run a downside case with lower savings and higher maintenance. Add an ANTHROPIC_API_KEY to .env when you want live research and a fully tailored AI recommendation.`;
}

// Single proxy endpoint. The frontend sends the same body it would send to
// the Anthropic Messages API (model, max_tokens, messages, tools) and this
// server attaches the API key and forwards it — keeping the key out of the browser.
app.post("/api/claude", async (req, res) => {
  if (!API_KEY) {
    return res.json({
      content: [{ type: "text", text: demoClaudeResponse(req.body?.messages?.[0]?.content) }],
      demo: true,
    });
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    // Keep the demonstration usable when a placeholder, expired or otherwise
    // invalid key is present. Successful live calls continue unchanged.
    if (!response.ok) {
      console.warn(`Claude request returned ${response.status}; serving a demo response instead.`);
      return res.json({
        content: [{ type: "text", text: demoClaudeResponse(req.body?.messages?.[0]?.content) }],
        demo: true,
      });
    }
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Anthropic proxy error:", err);
    res.json({
      content: [{ type: "text", text: demoClaudeResponse(req.body?.messages?.[0]?.content) }],
      demo: true,
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, HOST, () => {
  console.log(`BlueLedger API proxy running on http://${HOST}:${PORT}`);
});
