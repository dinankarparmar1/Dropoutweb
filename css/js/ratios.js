// ===============================
// Financial Ratio Engine
// ===============================

export function calculateRatios(data) {

    const ratios = {};

    // Profitability
    ratios.roe =
        safeDivide(data.netIncome, data.shareholdersEquity) * 100;

    ratios.roce =
        safeDivide(
            data.ebit,
            data.totalAssets - data.currentLiabilities
        ) * 100;

    ratios.netMargin =
        safeDivide(data.netIncome, data.revenue) * 100;

    ratios.operatingMargin =
        safeDivide(data.operatingIncome, data.revenue) * 100;

    // Growth

    ratios.revenueGrowth =
        growth(data.previousRevenue, data.revenue);

    ratios.profitGrowth =
        growth(data.previousNetIncome, data.netIncome);

    ratios.epsGrowth =
        growth(data.previousEPS, data.eps);

    // Liquidity

    ratios.currentRatio =
        safeDivide(data.currentAssets, data.currentLiabilities);

    ratios.quickRatio =
        safeDivide(
            data.currentAssets - data.inventory,
            data.currentLiabilities
        );

    // Debt

    ratios.debtToEquity =
        safeDivide(
            data.totalDebt,
            data.shareholdersEquity
        );

    ratios.interestCoverage =
        safeDivide(
            data.ebit,
            data.interestExpense
        );

    // Cash Flow

    ratios.freeCashFlow =
        data.operatingCashFlow -
        data.capex;

    // Valuation

    ratios.pe =
        safeDivide(
            data.marketPrice,
            data.eps
        );

    ratios.pb =
        safeDivide(
            data.marketPrice,
            data.bookValuePerShare
        );

    ratios.peg =
        safeDivide(
            ratios.pe,
            ratios.epsGrowth
        );

    ratios.evEbitda =
        safeDivide(
            data.enterpriseValue,
            data.ebitda
        );

    ratios.dividendYield =
        safeDivide(
            data.dividendPerShare,
            data.marketPrice
        ) * 100;

    return ratios;

}

// ===============================
// Helpers
// ===============================

function safeDivide(a, b){

    if(
        a === undefined ||
        b === undefined ||
        b === 0
    ){
        return 0;
    }

    return Number((a / b).toFixed(2));

}

function growth(previous, current){

    if(
        previous === undefined ||
        previous === 0
    ){
        return 0;
    }

    return Number(
        (
            ((current - previous) / previous) * 100
        ).toFixed(2)
    );

}
