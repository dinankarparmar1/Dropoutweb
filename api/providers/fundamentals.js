// ==========================================
// Dropout Fundamentals Provider v3.0
// Yahoo Chart + Safe Fundamentals
// ==========================================

export async function getFundamentals(symbol){

    try{


        const url =
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}.NS?modules=defaultKeyStatistics,summaryDetail,financialData`;


        const response =
        await fetch(url);



        if(!response.ok){

            return {

                beta:1

            };

        }



        const json =
        await response.json();



        const result =
        json.quoteSummary?.result?.[0];



        if(!result){

            return {

                beta:1

            };

        }



        const financial =
        result.financialData || {};



        const stats =
        result.defaultKeyStatistics || {};



        const detail =
        result.summaryDetail || {};



        return {


            revenue:
                financial.totalRevenue?.raw || 0,


            netIncome:
                financial.netIncomeToCommon?.raw || 0,


            operatingIncome:
                financial.operatingIncome?.raw || 0,


            ebitda:
                financial.ebitda?.raw || 0,



            totalDebt:
                financial.totalDebt?.raw || 0,


            totalAssets:
                financial.totalAssets?.raw || 0,


            shareholdersEquity:
                financial.totalStockholderEquity?.raw || 0,



            operatingCashFlow:
                financial.operatingCashflow?.raw || 0,


            capex:
                financial.capitalExpenditures?.raw || 0,



            eps:
                stats.trailingEps?.raw || 0,


            bookValuePerShare:
                stats.bookValue?.raw || 0,


            enterpriseValue:
                stats.enterpriseValue?.raw || 0,


            beta:
                stats.beta?.raw || 1,


            marketCap:
                detail.marketCap?.raw || 0


        };


    }
    catch(error){


        console.log(
            "Fundamentals API failed",
            error
        );


        return {

            beta:1

        };

    }

}
