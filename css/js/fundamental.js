import { overallScore } from "./scoring.js";

const searchBtn = document.getElementById("searchBtn");

searchBtn.addEventListener("click", () => {

    const company = document.getElementById("stockInput").value.trim();

    if (!company) {
        alert("Please enter a stock name.");
        return;
    }

    /*
      Temporary sample data.
      Later this will come from the API.
    */
    const data = {
        currentRatio: 2.1,
        debtToEquity: 0.35,

        revenueGrowth: 18,
        profitGrowth: 22,

        roe: 24,
        roce: 26,
        netMargin: 18,

        pe: 22,
        industryPE: 28,

        freeCashFlow: 1850,

        promoterHolding: 61,
        fiiHolding: 18,

        beta: 0.9
    };

    const result = overallScore(data);

    document.getElementById("score").textContent = result.finalScore;
    document.getElementById("signal").textContent = result.rating;

    document.getElementById("health").textContent =
        result.breakdown.financialHealth;

    document.getElementById("growth").textContent =
        result.breakdown.growth;

    document.getElementById("valuation").textContent =
        result.breakdown.valuation;

    document.getElementById("profitability").textContent =
        result.breakdown.profitability;

    document.getElementById("cashflow").textContent =
        result.breakdown.cashFlow;

    document.getElementById("debt").textContent =
        result.breakdown.debt;

    document.getElementById("shareholding").textContent =
        result.breakdown.shareholding;

    document.getElementById("risk").textContent =
        result.breakdown.risk;

});
