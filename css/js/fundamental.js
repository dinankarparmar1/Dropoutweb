import { searchCompany, getCompanies } from "./api.js";
import { calculateRatios } from "./ratios.js";
import { overallScore } from "./scoring.js";
import { renderDashboard } from "./ui.js";
import { renderCharts } from "./charts.js";

const searchBtn = document.getElementById("searchBtn");
const stockInput = document.getElementById("stockInput");
const autocompleteList = document.getElementById("autocompleteList");

let companies = [];

// ==========================
// Initialize
// ==========================

(async function init() {

    try {

        companies = await getCompanies();

    } catch (err) {

        console.error(err);

    }

})();

// ==========================
// Events
// ==========================

searchBtn.addEventListener("click", analyzeStock);

stockInput.addEventListener("keydown", (e) => {

    if (e.key === "Enter") {

        hideAutocomplete();

        analyzeStock();

    }

});

stockInput.addEventListener("input", showAutocomplete);

document.addEventListener("click", (e) => {

    if (!e.target.closest(".search-box")) {

        hideAutocomplete();

    }

});

// ==========================
// Autocomplete
// ==========================

function showAutocomplete() {

    const keyword = stockInput.value.trim().toLowerCase();

    autocompleteList.innerHTML = "";

    if (!keyword) {

        hideAutocomplete();

        return;

    }

    const matches = companies.filter(company => {

        return (

            company.symbol.toLowerCase().includes(keyword) ||

            company.name.toLowerCase().includes(keyword)

        );

    }).slice(0,8);

    if (!matches.length) {

        hideAutocomplete();

        return;

    }

    matches.forEach(company => {

        const item = document.createElement("div");

        item.className = "autocomplete-item";

        item.innerHTML = `

            <div class="autocomplete-symbol">

                ${company.symbol}

            </div>

            <div class="autocomplete-name">

                ${company.name}

            </div>

        `;

        item.onclick = () => {

            stockInput.value = company.symbol;

            hideAutocomplete();

            analyzeStock();

        };

        autocompleteList.appendChild(item);

    });

    autocompleteList.style.display = "block";

}

function hideAutocomplete() {

    autocompleteList.style.display = "none";

}

// ==========================
// Main Analysis
// ==========================

async function analyzeStock() {

    const symbol = stockInput.value.trim();

    if (!symbol) {

        alert("Please enter a stock symbol.");

        return;

    }

    searchBtn.disabled = true;

    searchBtn.textContent = "Analyzing...";

    try {

        const company = await searchCompany(symbol);

        if (!company) {

            alert("Company not found.");

            return;

        }

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

        document.getElementById("health").textContent = score.breakdown.financialHealth;

        document.getElementById("growth").textContent = score.breakdown.growth;

        document.getElementById("valuation").textContent = score.breakdown.valuation;

        document.getElementById("profitability").textContent = score.breakdown.profitability;

        document.getElementById("cashflow").textContent = score.breakdown.cashFlow;

        document.getElementById("debt").textContent = score.breakdown.debt;

        document.getElementById("shareholding").textContent = score.breakdown.shareholding;

        document.getElementById("risk").textContent = score.breakdown.risk;

        renderDashboard(company, ratios, score);

        renderCharts(company);

    } catch (err) {

        console.error(err);

        alert("Unable to analyze this company.");

    } finally {

        searchBtn.disabled = false;

        searchBtn.textContent = "Analyze Stock";

    }

}

export function getCompanyList() {

    return companies;

}
