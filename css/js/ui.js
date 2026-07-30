// =====================================
// UI Rendering Engine v3.0
// =====================================

export function renderDashboard(company, ratios, score) {
    renderCompany(company);
    renderFinancials(company);
    renderRatios(ratios);
    renderInvestmentThesis(score);
}

// =====================================
// Company Overview
// =====================================

function renderCompany(company) {

    const card = document.getElementById("companyCard");
    if (!card) return;

    card.innerHTML = `
        <div class="company-grid">

            ${item("Company", company.companyName || company.name)}
            ${item("Symbol", company.symbol)}
            ${item("Sector", company.sector)}
            ${item("Industry", company.industry)}

            ${item("Market Cap", company.marketCap)}
            ${item("Current Price", "₹" + format(company.currentPrice))}
            ${item("52W High", "₹" + format(company.high52Week))}
            ${item("52W Low", "₹" + format(company.low52Week))}

            ${item("Book Value", "₹" + format(company.bookValuePerShare))}
            ${item("Face Value", "₹" + format(company.faceValue))}
            ${item("Dividend Yield", safe(company.dividendYield) + "%")}

            ${item("Promoter Holding", safe(company.promoterHolding) + "%")}
            ${item("FII Holding", safe(company.fiiHolding) + "%")}
            ${item("DII Holding", safe(company.diiHolding) + "%")}
            ${item("Beta", safe(company.beta))}

        </div>
    `;
}

// =====================================
// Financial Statements
// =====================================

function renderFinancials(company) {

    const table = document.getElementById("financialData");
    if (!table) return;

    const h = company.history;

    table.innerHTML = `
        <table class="financial-table">

            <thead>
                <tr>
                    <th>Metric</th>
                    ${h.years.map(y => `<th>${y}</th>`).join("")}
                </tr>
            </thead>

            <tbody>

                ${row("Revenue", h.revenue)}
                ${row("Net Profit", h.netProfit)}
                ${row("EPS", h.eps)}
                ${row("Operating Cash Flow", h.operatingCashFlow)}
                ${row("Free Cash Flow", h.freeCashFlow)}

            </tbody>

        </table>
    `;
}

// =====================================
// Ratio Table
// =====================================

function renderRatios(r) {

    const box = document.getElementById("ratioContainer");
    if (!box) return;

    const ratios = [

        ["ROE", r.roe + "%"],
        ["ROCE", r.roce + "%"],
        ["ROA", r.roa + "%"],

        ["Net Margin", r.netMargin + "%"],
        ["Operating Margin", r.operatingMargin + "%"],
        ["EBITDA Margin", r.ebitdaMargin + "%"],

        ["Revenue Growth", r.revenueGrowth + "%"],
        ["Profit Growth", r.profitGrowth + "%"],
        ["EPS Growth", r.epsGrowth + "%"],

        ["Current Ratio", r.currentRatio],
        ["Quick Ratio", r.quickRatio],

        ["Debt / Equity", r.debtToEquity],
        ["Debt / Assets", r.debtToAssets],
        ["Interest Coverage", r.interestCoverage],

        ["Asset Turnover", r.assetTurnover],

        ["Free Cash Flow", "₹" + format(r.freeCashFlow)],
        ["Cash Flow Margin", r.cashFlowMargin + "%"],

        ["P/E", r.pe],
        ["P/B", r.pb],
        ["PEG", r.peg],
        ["EV / EBITDA", r.evEbitda],

        ["Dividend Yield", r.dividendYield + "%"],

        ["Promoter Holding", r.promoterHolding + "%"],
        ["FII Holding", r.fiiHolding + "%"],
        ["DII Holding", r.diiHolding + "%"],

        ["Beta", r.beta]

    ];

    box.innerHTML = `
        <table class="ratio-table">

            <tr>
                <th>Ratio</th>
                <th>Value</th>
            </tr>

            ${ratios.map(i=>`
                <tr>
                    <td>${i[0]}</td>
                    <td>${i[1]}</td>
                </tr>
            `).join("")}

        </table>
    `;
}

// =====================================
// AI Summary
// =====================================

function renderInvestmentThesis(score) {

    const box = document.getElementById("thesisContainer");
    if (!box) return;

    let color = "#22c55e";

    if (score.finalScore < 60) color = "#f59e0b";
    if (score.finalScore < 40) color = "#ef4444";

    box.innerHTML = `
        <div class="thesis-card">

            <h3>AI Investment Summary</h3>

            <h1 style="color:${color}">
                ${score.finalScore}/100
            </h1>

            <h2>${score.rating}</h2>

            <p>
                This AI score is calculated using
                profitability, valuation, growth,
                debt, cash flow, liquidity,
                ownership quality and risk metrics.

                <br><br>

                It is intended to support your research
                and should not be treated as financial
                or investment advice.

            </p>

        </div>
    `;
}

// =====================================
// Helpers
// =====================================

function item(title,value){
    return `
        <div>
            <strong>${title}</strong>
            <span>${value ?? "-"}</span>
        </div>
    `;
}

function row(title,data){

    return `
        <tr>
            <td>${title}</td>
            ${data.map(v=>`<td>${format(v)}</td>`).join("")}
        </tr>
    `;
}

function format(value){

    if(value===null || value===undefined){
        return "-";
    }

    if(typeof value==="number"){
        return value.toLocaleString("en-IN",{
            maximumFractionDigits:2
        });
    }

    return value;

}

function safe(v){
    return v ?? 0;
}
