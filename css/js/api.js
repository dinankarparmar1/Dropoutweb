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

    /*
    
    Future API connection:

    Example:

    const response = await fetch(
       "YOUR_API_URL"
    );

    return await response.json();


    */

    return null;

}


// ==========================================
// Company List
// ==========================================

export async function getCompanies(){

    const database =
        await import("./database.js");

    return database.getAllCompanies();

}
