// ==========================================
// Company Database
// Version 3.0
// ==========================================

import TCS from "./companies/tcs.js";

const DATABASE = {
    TCS,

    "TATA CONSULTANCY SERVICES": TCS,

    TATACONSULTANCYSERVICES: TCS
};

export function getCompany(query) {

    if (!query) return null;

    const key = query
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

    return (
        DATABASE[query.trim().toUpperCase()] ||
        DATABASE[key] ||
        null
    );
}

export function getAllCompanies() {
    return Object.values(DATABASE)
        .filter((company, index, array) =>
            array.findIndex(c => c.symbol === company.symbol) === index
        );
}

export default DATABASE;
