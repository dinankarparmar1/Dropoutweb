// ==========================================
// Dropout API Engine v8.0
// Automatic API + Debug Safe Mode
// ==========================================

import { getCompany } from "./database.js";
import { normalizeCompany } from "./normalizer.js";


// ==========================================
// Main Search Function
// ==========================================

export async function searchCompany(symbol){


    if(!symbol){

        return null;

    }


    const query =
        symbol
        .trim()
        .toUpperCase();



    try{


        const liveData =
            await fetchLiveStock(query);



        if(liveData){


            console.log(
                "LIVE DATA RECEIVED:",
                liveData
            );


            return liveData;


        }



    }
    catch(error){


        console.log(
            "Live API failed:",
            error
        );


    }



    // ==========================
    // Local Backup
    // ==========================

    const localCompany =
        getCompany(query);



    if(localCompany){

        return normalizeCompany(localCompany);

    }



    return null;


}



// ==========================================
// Vercel Automatic Stock API
// ==========================================

async function fetchLiveStock(symbol){


    try{


        const url =
        `https://dropoutweb-gjp0s69qo-dinankarparmar1s-projects.vercel.app/api/stock?symbol=${symbol}`;



        const response =
        await fetch(url);



        if(!response.ok){


            console.log(
                "API failed:",
                response.status
            );


            return null;


        }



        const data =
            await response.json();



        if(!data || data.error){


            return null;


        }



        return {


            symbol:
                data.symbol || symbol,



            companyName:
                data.companyName || symbol,



            currentPrice:
                Number(data.currentPrice || 0),



            marketPrice:
                Number(data.currentPrice || 0),



            high52Week:
                Number(data.high52Week || 0),



            low52Week:
                Number(data.low52Week || 0),



            beta:
                Number(data.beta || 1),



            revenue:
                Number(data.revenue || 0),



            netIncome:
                Number(data.netIncome || 0),



            operatingIncome:
                Number(data.operatingIncome || 0),



            ebitda:
                Number(data.ebitda || 0),



            totalDebt:
                Number(data.totalDebt || 0),



            totalAssets:
                Number(data.totalAssets || 0),



            shareholdersEquity:
                Number(data.shareholdersEquity || 0),



            currentAssets:
                Number(data.currentAssets || 0),



            currentLiabilities:
                Number(data.currentLiabilities || 0),



            operatingCashFlow:
                Number(data.operatingCashFlow || 0),



            capex:
                Number(data.capex || 0),



            eps:
                Number(data.eps || 0),



            bookValuePerShare:
                Number(data.bookValuePerShare || 0),



            enterpriseValue:
                Number(data.enterpriseValue || 0),



            marketCap:
                Number(data.marketCap || 0)

        };


    }
    catch(error){


        console.log(
            "Automatic API error:",
            error
        );


        return null;


    }


}



// ==========================================
// Company List
// ==========================================

export async function getCompanies(){


    const database =
        await import("./database.js");



    return database.getAllCompanies();


}
