// ==========================================
// API Layer
// Version 3.0
// ==========================================

import { getCompany, getAllCompanies } from "./database.js";

/**
 * Search company by name or symbol
 */
export async function searchCompany(query) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(getCompany(query));
        }, 150);
    });
}

/**
 * Get company list for autocomplete
 */
export async function getCompanies() {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(getAllCompanies());
        }, 100);
    });
}

/**
 * Future Live API Hook
 */
export async function fetchLiveCompany(query) {
    // Future NSE / Screener API integration
    return searchCompany(query);
}
