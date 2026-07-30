// ==========================================
// Dropout Fundamentals Provider v2.0
// ==========================================

export async function getFundamentals(symbol){

    try{

        // Yahoo fundamentals endpoint
        const url =
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.NS?modules=financialData,defaultKeyStatistics,summaryDetail`;


        const response = await fetch(url);


        if(!response.ok){

            return null;

        }


        const json =
        await response.json();


        const result =
        json.quoteSummary?.result?.[0];


        if(!result){

            return null;

        }


        const financial =
        result.financialData || {};


        const stats =
        result.defaultKeyStatistics || {};


        const detail =
        result.summaryDetail || {};



        return {


            // =====================
            // Profit Data
            // =====================

            revenue:
                financial.totalRevenue?.raw || 0,


            netIncome:
                financial.netIncomeToCommon?.raw || 0,


            operatingIncome:
                financial.operatingIncome?.raw || 0,


            ebitda:
                financial.ebitda?.raw || 0,



            // =====================
            // Balance Sheet
            // =====================

            totalDebt:
                financial.totalDebt?.raw || 0,


            totalAssets:
                financial.totalAssets?.raw || 0,


            shareholdersEquity:
                financial.totalStockholderEquity?.raw || 0,



            // =====================
            // Cash Flow
            // =====================

            operatingCashFlow:
                financial.operatingCashflow?.raw || 0,


            capex:
                financial.capitalExpenditures?.raw || 0,



            // =====================
            // Valuation
            // =====================

            eps:
                stats.trailingEps?.raw || 0,


            enterpriseValue:
                stats.enterpriseValue?.raw || 0,


            bookValuePerShare:
                stats.bookValue?.raw || 0,



            // =====================
            // Risk
            // =====================

            beta:
                stats.beta?.raw || 1,


            marketCap:
                detail.marketCap?.raw || 0

        };


    }
    catch(error){

        console.log(
            "Fundamentals fetch failed:",
            error
        );

        return null;

    }

}
