// ======================================
// Institutional Financial Ratio Engine v4.0
// ======================================

export function calculateRatios(data) {

    const ratios = {};

    // =====================
    // Profitability
    // =====================

    ratios.roe = percent(data.netIncome, data.shareholdersEquity);

    ratios.roce = percent(
        data.ebit,
        (data.totalAssets || 0) - (data.currentLiabilities || 0)
    );

    ratios.roa = percent(
        data.netIncome,
        data.totalAssets
    );

    ratios.netMargin = percent(
        data.netIncome,
        data.revenue
    );

    ratios.operatingMargin = percent(
        data.operatingIncome,
        data.revenue
    );

    ratios.ebitdaMargin = percent(
        data.ebitda,
        data.revenue
    );

    // =====================
    // Growth
    // =====================

    ratios.revenueGrowth = growth(
        data.previousRevenue,
        data.revenue
    );

    ratios.profitGrowth = growth(
        data.previousNetIncome,
        data.netIncome
    );

    ratios.epsGrowth = growth(
        data.previousEPS,
        data.eps
    );

    // =====================
    // Liquidity
    // =====================

    ratios.currentRatio = divide(
        data.currentAssets,
        data.currentLiabilities
    );

    ratios.quickRatio = divide(
        (data.currentAssets || 0) - (data.inventory || 0),
        data.currentLiabilities
    );

    // =====================
    // Leverage
    // =====================

    ratios.debtToEquity = divide(
        data.totalDebt,
        data.shareholdersEquity
    );

    ratios.debtToAssets = divide(
        data.totalDebt,
        data.totalAssets
    );

    ratios.interestCoverage = divide(
        data.ebit,
        data.interestExpense
    );

    // =====================
    // Efficiency
    // =====================

    ratios.assetTurnover = divide(
        data.revenue,
        data.totalAssets
    );

    // =====================
    // Cash Flow
    // =====================

    ratios.freeCashFlow =
        data.freeCashFlow ??
        ((data.operatingCashFlow || 0) - (data.capex || 0));

    ratios.cashFlowMargin = percent(
        data.operatingCashFlow,
        data.revenue
    );

    // =====================
    // Valuation
    // =====================

    ratios.pe = divide(
        data.marketPrice,
        data.eps
    );

    ratios.pb = divide(
        data.marketPrice,
        data.bookValuePerShare
    );

    ratios.peg = divide(
        ratios.pe,
        ratios.epsGrowth
    );

    ratios.evEbitda = divide(
        data.enterpriseValue,
        data.ebitda
    );

    ratios.dividendYield =
        data.dividendYield ??
        percent(data.dividendPerShare, data.marketPrice);

    // =====================
    // Shareholding
    // =====================

    ratios.promoterHolding = data.promoterHolding || 0;
    ratios.fiiHolding = data.fiiHolding || 0;
    ratios.diiHolding = data.diiHolding || 0;

    // =====================
    // Risk
    // =====================

    ratios.beta = data.beta || 0;

    // =====================
    // Additional Ratios
    // =====================

    ratios.debt = data.totalDebt || 0;

    ratios.cash = data.cashAndEquivalents || 0;

    ratios.netCash =
        (data.cashAndEquivalents || 0) -
        (data.totalDebt || 0);

    ratios.marketCap = data.marketCap || "-";

    return ratios;

}

// ======================================
// Helper Functions
// ======================================

function divide(a, b) {

    if (
        a === undefined ||
        a === null ||
        b === undefined ||
        b === null ||
        b === 0
    ) {
        return 0;
    }

    return Number((a / b).toFixed(2));

}

function percent(a, b) {

    return Number(
        (divide(a, b) * 100).toFixed(2)
    );

}

function growth(previous, current) {

    if (
        previous === undefined ||
        previous === null ||
        previous === 0 ||
        current === undefined ||
        current === null
    ) {
        return 0;
    }

    return Number(
        ((((current - previous) / previous) * 100).toFixed(2))
    );

}
