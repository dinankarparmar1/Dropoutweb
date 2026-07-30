// ==========================================
// Dropout API Engine v6.0
// Vercel Automatic API + Local Fallback
// ==========================================

import { getCompany } from "./database.js";
import { normalizeCompany } from "./normalizer.js";


// ==========================================
// Main Search Function
// ==========================================

export async function searchCompany(symbol){

    const query = symbol
        .trim()
        .toUpperCase();


    try{

        const liveData = await fetchLiveStock(query);


        if(liveData){

            return normalizeCompany(liveData);

        }

    }
    catch(error){

        console.log(
            "Live API failed, using local database"
        );

    }



    // ==========================
    // Local Backup
    // ==========================

    const localCompany = getCompany(query);


    if(localCompany){

        return localCompany;

    }


    return null;

}



// ==========================================
// Vercel Automatic Stock API
// ==========================================

async function fetchLiveStock(symbol){

    try {


        const response = await fetch(
            `https://dropoutweb-gjp0s69qo-dinankarparmar1s-projects.vercel.app/api/stock?symbol=${symbol}`
        );


        if(!response.ok){

            return null;

        }


        const data =
            await response.json();



        if(data.error){

            return null;

        }



        return {

            symbol:data.symbol,


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



            // Future fundamentals

            revenue:
                data.revenue || 0,


            netIncome:
                data.netIncome || 0,


            totalDebt:
                data.totalDebt || 0,


            totalAssets:
                data.totalAssets || 0,


            shareholdersEquity:
                data.shareholdersEquity || 0,


            operatingCashFlow:
                data.operatingCashFlow || 0,


            capex:
                data.capex || 0,


            eps:
                data.eps || 0

        };


    }
    catch(error){


        console.log(
            "Automatic Vercel API unavailable",
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
