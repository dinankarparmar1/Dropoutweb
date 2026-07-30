// ==========================================
// Company Database
// Version 4.0
// ==========================================

import TCS from "./companies/tcs.js";
import RELIANCE from "./companies/reliance.js";

const DATABASE = {

    TCS,

    RELIANCE,

    "RELIANCE INDUSTRIES": RELIANCE,

    RELIANCEINDUSTRIES: RELIANCE,

    "TATA CONSULTANCY SERVICES": TCS,

    TATACONSULTANCYSERVICES: TCS
};


// ==========================================
// Find Company
// ==========================================

export function getCompany(query) {

    if (!query) return null;


    const key = query
        .trim()
        .toUpperCase()
        .replace(/\s+/g,"");


    return (
        DATABASE[query.trim().toUpperCase()] ||
        DATABASE[key] ||
        null
    );

}


// ==========================================
// All Companies (Autocomplete)
// ==========================================

export function getAllCompanies(){

    return Object.values(DATABASE)

        .filter(
            (company,index,array)=>

            array.findIndex(
                c=>c.symbol===company.symbol
            )===index

        );

}


// ==========================================
// Add Future Companies Here
// ==========================================

export function addCompany(symbol,company){

    DATABASE[symbol.toUpperCase()] = company;

}


export default DATABASE;
