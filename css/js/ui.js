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

function renderCompany(company){

    const card = document.getElementById("companyCard");

    if(!card) return;

    card.innerHTML = `
        <h3>${company.companyName}</h3>
        <br>

        <p><strong>Symbol:</strong> ${company.symbol}</p>

        <p><strong>Market Price:</strong> ₹${company.marketPrice}</p>

        <p><strong>Promoter Holding:</strong> ${company.promoterHolding}%</p>

        <p><strong>FII Holding:</strong> ${company.fiiHolding}%</p>

        <p><strong>Beta:</strong> ${company.beta}</p>
    `;

}

// =====================================

function renderFinancials(company){

    const financial = document.getElementById("financialData");

    if(!financial) return;

    financial.innerHTML = `
        <table>

            <tr>
                <th>Metric</th>
                <th>Value</th>
            </tr>

            <tr>
                <td>Revenue</td>
                <td>₹${company.revenue.toLocaleString()}</td>
            </tr>

            <tr>
                <td>Net Income</td>
                <td>₹${company.netIncome.toLocaleString()}</td>
            </tr>

            <tr>
                <td>Operating Cash Flow</td>
                <td>₹${company.operatingCashFlow.toLocaleString()}</td>
            </tr>

            <tr>
                <td>Total Debt</td>
                <td>₹${company.totalDebt.toLocaleString()}</td>
            </tr>

        </table>
    `;

}

// =====================================

function renderRatios(ratios){

    const ratioBox = document.getElementById("ratioContainer");

    if(!ratioBox) return;

    ratioBox.innerHTML = `
        <table>

            <tr>
                <th>Ratio</th>
                <th>Value</th>
            </tr>

            <tr><td>ROE</td><td>${ratios.roe}%</td></tr>

            <tr><td>ROCE</td><td>${ratios.roce}%</td></tr>

            <tr><td>P/E</td><td>${ratios.pe}</td></tr>

            <tr><td>P/B</td><td>${ratios.pb}</td></tr>

            <tr><td>Current Ratio</td><td>${ratios.currentRatio}</td></tr>

            <tr><td>Debt/Equity</td><td>${ratios.debtToEquity}</td></tr>

            <tr><td>Revenue Growth</td><td>${ratios.revenueGrowth}%</td></tr>

            <tr><td>Profit Growth</td><td>${ratios.profitGrowth}%</td></tr>

        </table>
    `;

}

// =====================================

function renderInvestmentThesis(score){

    const thesis = document.getElementById("thesisContainer");

    if(!thesis) return;

    thesis.innerHTML = `
        <h3>Investment Summary</h3>

        <br>

        <p>
            Overall Score:
            <strong>${score.finalScore}</strong>
        </p>

        <p>
            Rating:
            <strong>${score.rating}</strong>
        </p>

        <br>

        <p>
            This rating is generated using the company's financial health,
            growth, profitability, valuation, cash flow, debt, shareholding,
            and risk profile.
        </p>
    `;

}
