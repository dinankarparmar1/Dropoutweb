import { searchCompany } from "./api.js";
import { calculateRatios } from "./ratios.js";
import { overallScore } from "./scoring.js";
import { renderDashboard } from "./ui.js";
import { renderCharts } from "./charts.js";

const searchBtn = document.getElementById("searchBtn");
const stockInput = document.getElementById("stockInput");

// Search by button
searchBtn.addEventListener("click", analyzeStock);

// Search by Enter key
stockInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        analyzeStock();
    }
});

async function analyzeStock() {

    const symbol = stockInput.value.trim();

    if (!symbol) {
        alert("Please enter a stock symbol.");
        return;
    }

    try {

        const company = await searchCompany(symbol);

        const ratios = calculateRatios(company);

        const score = overallScore({
            currentRatio: ratios.currentRatio,
            debtToEquity: ratios.debtToEquity,
            revenueGrowth: ratios.revenueGrowth,
            profitGrowth: ratios.profitGrowth,
            roe: ratios.roe,
            roce: ratios.roce,
            netMargin: ratios.netMargin,
            pe: ratios.pe,
            industryPE: 28,
            freeCashFlow: ratios.freeCashFlow,
            promoterHolding: company.promoterHolding,
            fiiHolding: company.fiiHolding,
            beta: company.beta
        });

        // =====================
        // Score Cards
        // =====================

        document.getElementById("score").textContent = score.finalScore;
        document.getElementById("signal").textContent = score.rating;

        document.getElementById("health").textContent = score.breakdown.financialHealth;
        document.getElementById("growth").textContent = score.breakdown.growth;
        document.getElementById("valuation").textContent = score.breakdown.valuation;
        document.getElementById("profitability").textContent = score.breakdown.profitability;
        document.getElementById("cashflow").textContent = score.breakdown.cashFlow;
        document.getElementById("debt").textContent = score.breakdown.debt;
        document.getElementById("shareholding").textContent = score.breakdown.shareholding;
        document.getElementById("risk").textContent = score.breakdown.risk;

        // =====================
        // Dashboard
        // =====================

        renderDashboard(company, ratios, score);

        // =====================
        // Charts
        // =====================

        renderCharts(company);

    } catch (error) {

        console.error(error);
        alert(error);

    }

}
