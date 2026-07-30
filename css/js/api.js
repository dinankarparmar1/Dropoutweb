// ==========================================
// API Layer
// Version 1 (Mock Data)
// ==========================================

const companies = {

    TCS: {
        companyName: "Tata Consultancy Services",
        symbol: "TCS",

        revenue: 245000,
        previousRevenue: 221000,

        netIncome: 47000,
        previousNetIncome: 42000,

        operatingIncome: 62000,

        shareholdersEquity: 195000,

        totalAssets: 360000,
        currentAssets: 125000,
        currentLiabilities: 62000,

        totalDebt: 8500,

        inventory: 0,

        ebit: 63000,
        ebitda: 69000,

        interestExpense: 900,

        operatingCashFlow: 52000,
        capex: 5500,

        eps: 129,
        previousEPS: 116,

        marketPrice: 4200,
        bookValuePerShare: 540,

        dividendPerShare: 75,

        enterpriseValue: 1550000,

        promoterHolding: 72.3,
        fiiHolding: 14.8,

        beta: 0.82
    }

};

// ==========================================

export async function searchCompany(symbol){

    const key = symbol.trim().toUpperCase();

    return new Promise((resolve,reject)=>{

        setTimeout(()=>{

            if(companies[key]){
                resolve(companies[key]);
            }else{
                reject("Company not found.");
            }

        },300);

    });

}
