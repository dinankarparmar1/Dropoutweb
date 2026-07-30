import { searchCompany } from "./api.js";
import { calculateRatios } from "./ratios.js";
import { overallScore } from "./scoring.js";

const searchBtn = document.getElementById("searchBtn");

searchBtn.addEventListener("click", async () => {

    const input = document.getElementById("stockInput");
    const symbol = input.value.trim();

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

        document.getElementById("score").textContent = score.finalScore;
        document.getElementById("signal").textContent = score.rating;

        document.getElementById("health").textContent =
            score.breakdown.financialHealth;

        document.getElementById("growth").textContent =
            score.breakdown.growth;

        document.getElementById("valuation").textContent =
            score.breakdown.valuation;

        document.getElementById("profitability").textContent =
            score.breakdown.profitability;

        document.getElementById("cashflow").textContent =
            score.breakdown.cashFlow;

        document.getElementById("debt").textContent =
            score.breakdown.debt;

        document.getElementById("shareholding").textContent =
            score.breakdown.shareholding;

        document.getElementById("risk").textContent =
            score.breakdown.risk;

        console.log("Company:", company);
        console.log("Ratios:", ratios);
        console.log("Score:", score);

    } catch (error) {

        alert(error);

    }

});
