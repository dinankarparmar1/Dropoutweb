// =====================================
// UI Rendering Engine
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

function renderCompany(company){

    const card = document.getElementById("companyCard");

    if(!card) return;

    card.innerHTML = `
        <div class="company-grid">

            <div><strong>Company</strong><span>${company.companyName}</span></div>
            <div><strong>Symbol</strong><span>${company.symbol}</span></div>
            <div><strong>Sector</strong><span>${company.sector}</span></div>
            <div><strong>Industry</strong><span>${company.industry}</span></div>
            <div><strong>Market Cap</strong><span>${company.marketCap}</span></div>
            <div><strong>Current Price</strong><span>₹${company.currentPrice}</span></div>
            <div><strong>52W High</strong><span>₹${company.high52Week}</span></div>
            <div><strong>52W Low</strong><span>₹${company.low52Week}</span></div>
            <div><strong>Book Value</strong><span>₹${company.bookValuePerShare}</span></div>
            <div><strong>Dividend Yield</strong><span>${ratiosSafe(company.dividendYield)}%</span></div>
            <div><strong>Face Value</strong><span>₹${company.faceValue}</span></div>
            <div><strong>Promoter Holding</strong><span>${company.promoterHolding}%</span></div>
            <div><strong>FII Holding</strong><span>${company.fiiHolding}%</span></div>
            <div><strong>DII Holding</strong><span>${company.diiHolding}%</span></div>
            <div><strong>Beta</strong><span>${company.beta}</span></div>

        </div>
    `;

}

// =====================================
// Financial Statements
// =====================================

function renderFinancials(company){

    const financial = document.getElementById("financialData");

    if(!financial) return;

    const h = company.history;

    financial.innerHTML = `
        <table>

            <tr>
                <th>Metric</th>
                ${h.years.map(y=>`<th>${y}</th>`).join("")}
            </tr>

            <tr>
                <td>Revenue</td>
                ${h.revenue.map(v=>`<td>₹${v.toLocaleString()}</td>`).join("")}
            </tr>

            <tr>
                <td>Net Profit</td>
                ${h.netProfit.map(v=>`<td>₹${v.toLocaleString()}</td>`).join("")}
            </tr>

            <tr>
                <td>EPS</td>
                ${h.eps.map(v=>`<td>${v}</td>`).join("")}
            </tr>

            <tr>
                <td>Operating Cash Flow</td>
                ${h.operatingCashFlow.map(v=>`<td>₹${v.toLocaleString()}</td>`).join("")}
            </tr>

            <tr>
                <td>Free Cash Flow</td>
                ${h.freeCashFlow.map(v=>`<td>₹${v.toLocaleString()}</td>`).join("")}
            </tr>

        </table>
    `;

}

// =====================================
// Advanced Ratio Analysis
// =====================================

function renderRatios(ratios){

    const box = document.getElementById("ratioContainer");

    if(!box) return;

    box.innerHTML = `
        <table>

            <tr>
                <th>Ratio</th>
                <th>Value</th>
            </tr>

            <tr><td>ROE</td><td>${ratios.roe}%</td></tr>
            <tr><td>ROCE</td><td>${ratios.roce}%</td></tr>
            <tr><td>ROA</td><td>${ratios.roa}%</td></tr>
            <tr><td>Net Margin</td><td>${ratios.netMargin}%</td></tr>
            <tr><td>Operating Margin</td><td>${ratios.operatingMargin}%</td></tr>
            <tr><td>EBITDA Margin</td><td>${ratios.ebitdaMargin}%</td></tr>

            <tr><td>Revenue Growth</td><td>${ratios.revenueGrowth}%</td></tr>
            <tr><td>Profit Growth</td><td>${ratios.profitGrowth}%</td></tr>
            <tr><td>EPS Growth</td><td>${ratios.epsGrowth}%</td></tr>

            <tr><td>Current Ratio</td><td>${ratios.currentRatio}</td></tr>
            <tr><td>Quick Ratio</td><td>${ratios.quickRatio}</td></tr>

            <tr><td>Debt / Equity</td><td>${ratios.debtToEquity}</td></tr>
            <tr><td>Debt / Assets</td><td>${ratios.debtToAssets}</td></tr>
            <tr><td>Interest Coverage</td><td>${ratios.interestCoverage}</td></tr>

            <tr><td>Asset Turnover</td><td>${ratios.assetTurnover}</td></tr>

            <tr><td>Free Cash Flow</td><td>₹${ratios.freeCashFlow.toLocaleString()}</td></tr>
            <tr><td>Cash Flow Margin</td><td>${ratios.cashFlowMargin}%</td></tr>

            <tr><td>P/E</td><td>${ratios.pe}</td></tr>
            <tr><td>P/B</td><td>${ratios.pb}</td></tr>
            <tr><td>PEG</td><td>${ratios.peg}</td></tr>
            <tr><td>EV / EBITDA</td><td>${ratios.evEbitda}</td></tr>

            <tr><td>Dividend Yield</td><td>${ratios.dividendYield}%</td></tr>

            <tr><td>Promoter Holding</td><td>${ratios.promoterHolding}%</td></tr>
            <tr><td>FII Holding</td><td>${ratios.fiiHolding}%</td></tr>
            <tr><td>DII Holding</td><td>${ratios.diiHolding}%</td></tr>

            <tr><td>Beta</td><td>${ratios.beta}</td></tr>

        </table>
    `;

}

// =====================================
// Investment Thesis
// =====================================

function renderInvestmentThesis(score){

    const thesis = document.getElementById("thesisContainer");

    if(!thesis) return;

    thesis.innerHTML = `
        <h3>AI Investment Summary</h3>

        <p><strong>Overall Score:</strong> ${score.finalScore}</p>

        <p><strong>Rating:</strong> ${score.rating}</p>

        <p>
            This rating is generated using profitability,
            growth, valuation, liquidity, leverage,
            cash flow and ownership metrics.
        </p>
    `;

}

function ratiosSafe(value){
    return value ?? 0;
}
