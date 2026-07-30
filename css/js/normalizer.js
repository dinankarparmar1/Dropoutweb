// ==========================================
// Dropout Stock Data Normalizer
// Version 2.0
// Converts API response into engine format
// ==========================================

export function normalizeCompany(raw) {

    if (!raw) {
        return null;
    }


    return {


        // =====================
        // Basic Information
        // =====================

        companyName:
            raw.companyName ||
            raw.name ||
            "Unknown Company",


        name:
            raw.name ||
            raw.companyName ||
            "Unknown Company",


        symbol:
            raw.symbol ||
            raw.ticker ||
            "",


        sector:
            raw.sector ||
            "Unknown",


        industry:
            raw.industry ||
            "Unknown",


        marketCap:
            Number(raw.marketCap || 0),



        // =====================
        // Price
        // =====================

        currentPrice:
            Number(raw.currentPrice || raw.price || 0),


        marketPrice:
            Number(raw.marketPrice || raw.price || 0),


        high52Week:
            Number(raw.high52Week || 0),


        low52Week:
            Number(raw.low52Week || 0),




        // =====================
        // Shareholding
        // =====================

        promoterHolding:
            Number(raw.promoterHolding || 0),


        fiiHolding:
            Number(raw.fiiHolding || 0),


        diiHolding:
            Number(raw.diiHolding || 0),


        beta:
            Number(raw.beta || 1),




        // =====================
        // Financial Data
        // =====================

        revenue:
            Number(raw.revenue || 0),


        previousRevenue:
            Number(raw.previousRevenue || 0),


        netIncome:
            Number(raw.netIncome || 0),


        previousNetIncome:
            Number(raw.previousNetIncome || 0),


        operatingIncome:
            Number(raw.operatingIncome || 0),


        operatingCashFlow:
            Number(raw.operatingCashFlow || 0),


        capex:
            Number(raw.capex || 0),


        freeCashFlow:
            Number(
                raw.freeCashFlow ||
                (
                    (raw.operatingCashFlow || 0) -
                    (raw.capex || 0)
                )
            ),




        // =====================
        // Balance Sheet
        // =====================

        totalAssets:
            Number(raw.totalAssets || 0),


        currentAssets:
            Number(raw.currentAssets || 0),


        currentLiabilities:
            Number(raw.currentLiabilities || 0),


        shareholdersEquity:
            Number(raw.shareholdersEquity || 0),


        totalDebt:
            Number(raw.totalDebt || 0),


        inventory:
            Number(raw.inventory || 0),




        // =====================
        // Profit Metrics
        // =====================

        ebit:
            Number(raw.ebit || 0),


        ebitda:
            Number(raw.ebitda || 0),


        interestExpense:
            Number(raw.interestExpense || 0),




        // =====================
        // Valuation
        // =====================

        eps:
            Number(raw.eps || 0),


        previousEPS:
            Number(raw.previousEPS || 0),


        bookValuePerShare:
            Number(raw.bookValuePerShare || 0),


        enterpriseValue:
            Number(raw.enterpriseValue || 0),


        dividendPerShare:
            Number(raw.dividendPerShare || 0),


        dividendYield:
            Number(raw.dividendYield || 0),




        // =====================
        // History (API Safe)
        // =====================

        history:

            raw.history ||
            {

                years:[
                    "Current"
                ],


                revenue:[
                    Number(raw.revenue || 0)
                ],


                netProfit:[
                    Number(raw.netIncome || 0)
                ],


                eps:[
                    Number(raw.eps || 0)
                ],


                operatingCashFlow:[
                    Number(raw.operatingCashFlow || 0)
                ],


                freeCashFlow:[
                    Number(raw.freeCashFlow || 0)
                ]

            }


    };

}
