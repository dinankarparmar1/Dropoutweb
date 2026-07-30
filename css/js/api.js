// ==========================================
// Dropout API Engine v4.0
// Hybrid: Live API + Local Fallback
// ==========================================

import { getCompany } from "./database.js";
import { normalizeCompany } from "./normalizer.js";


// Main Search Function

export async function searchCompany(symbol){

    const query = symbol.trim().toUpperCase();

    try{

        const liveData = await fetchLiveStock(query);

        if(liveData){

            return normalizeCompany(liveData);

        }

    }
    catch(error){

        console.log(
            "Live API unavailable, using local data"
        );

    }


    // fallback

    const localCompany = getCompany(query);


    if(localCompany){

        return localCompany;

    }


    return null;

}


// ==========================================
// Live API Placeholder
// ==========================================

async function fetchLiveStock(symbol){

    try {

        const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS`;


        const response = await fetch(url);


        if(!response.ok){

            return null;

        }


        const data = await response.json();


        const result =
            data.chart.result?.[0];


        if(!result){

            return null;

        }


        const price =
            result.meta.regularMarketPrice;


        return {

            symbol:symbol,

            companyName:
                result.meta.shortName ||
                symbol,


            currentPrice:
                price,


            marketPrice:
                price,


            high52Week:
                result.meta.fiftyTwoWeekHigh || 0,


            low52Week:
                result.meta.fiftyTwoWeekLow || 0,


            beta:1


        };


    }
    catch(error){

        console.log(
            "Live price fetch failed",
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
