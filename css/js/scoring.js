/**
 * ===========================================================
 * Dropout Fundamental Analysis Engine v1.0
 * DO NOT CHANGE WEIGHTS WITHOUT UPDATING THE BLUEPRINT
 * ===========================================================
 */

export const WEIGHTS = {
    financialHealth: 25,
    growth: 20,
    profitability: 15,
    valuation: 15,
    cashFlow: 10,
    debt: 5,
    shareholding: 5,
    risk: 5
};

function scoreRange(value, excellent, good, average) {
    if (value >= excellent) return 100;
    if (value >= good) return 80;
    if (value >= average) return 60;
    return 30;
}

function reverseScore(value, excellent, good, average) {
    if (value <= excellent) return 100;
    if (value <= good) return 80;
    if (value <= average) return 60;
    return 30;
}

export function calculateFinancialHealth(data) {

    const metrics = [
        scoreRange(data.currentRatio, 2, 1.5, 1),
        reverseScore(data.debtToEquity, 0.5, 1, 2),
        scoreRange(data.interestCoverage, 8, 4, 2),
        data.operatingCashFlow > 0 ? 100 : 20
    ];

    return Math.round(metrics.reduce((a,b)=>a+b,0)/metrics.length);
}

export function calculateGrowth(data){

    const metrics = [
        scoreRange(data.revenueGrowth,20,10,5),
        scoreRange(data.profitGrowth,20,10,5),
        scoreRange(data.epsGrowth,20,10,5)
    ];

    return Math.round(metrics.reduce((a,b)=>a+b,0)/metrics.length);
}

export function calculateProfitability(data){

    const metrics = [
        scoreRange(data.roe,20,15,10),
        scoreRange(data.roce,20,15,10),
        scoreRange(data.netMargin,20,10,5)
    ];

    return Math.round(metrics.reduce((a,b)=>a+b,0)/metrics.length);
}

export function calculateValuation(data){

    const metrics = [
        reverseScore(data.pe,15,25,35),
        reverseScore(data.pb,2,4,6),
        reverseScore(data.evEbitda,10,15,20)
    ];

    return Math.round(metrics.reduce((a,b)=>a+b,0)/metrics.length);
}

export function calculateCashFlow(data){

    const metrics = [
        data.freeCashFlow > 0 ? 100 : 20,
        data.operatingCashFlow > 0 ? 100 : 20
    ];

    return Math.round(metrics.reduce((a,b)=>a+b,0)/metrics.length);
}

export function calculateDebt(data){

    return reverseScore(
        data.debtToEquity,
        0.5,
        1,
        2
    );
}

export function calculateShareholding(data){

    let score = 50;

    if(data.promoterHolding > 50) score += 20;
    if(data.promoterPledge === 0) score += 20;
    if(data.fiiHoldingIncreasing) score += 10;

    return Math.min(score,100);
}

export function calculateRisk(data){

    let score = 100;

    if(data.auditIssue) score -= 25;
    if(data.highDebt) score -= 20;
    if(data.negativeCashFlow) score -= 20;
    if(data.fallingSales) score -= 15;
    if(data.fallingProfit) score -= 20;

    return Math.max(score,0);
}

export function overallScore(data){

    const scores = {

        financialHealth: calculateFinancialHealth(data),

        growth: calculateGrowth(data),

        profitability: calculateProfitability(data),

        valuation: calculateValuation(data),

        cashFlow: calculateCashFlow(data),

        debt: calculateDebt(data),

        shareholding: calculateShareholding(data),

        risk: calculateRisk(data)

    };

    const total =

        scores.financialHealth * WEIGHTS.financialHealth +

        scores.growth * WEIGHTS.growth +

        scores.profitability * WEIGHTS.profitability +

        scores.valuation * WEIGHTS.valuation +

        scores.cashFlow * WEIGHTS.cashFlow +

        scores.debt * WEIGHTS.debt +

        scores.shareholding * WEIGHTS.shareholding +

        scores.risk * WEIGHTS.risk;

    const finalScore = Math.round(total / 100);

    let rating = "SELL";

    if(finalScore >= 90) rating = "STRONG BUY";
    else if(finalScore >= 75) rating = "BUY";
    else if(finalScore >= 60) rating = "HOLD";
    else if(finalScore >= 40) rating = "WEAK";
    else rating = "SELL";

    return {
        finalScore,
        rating,
        breakdown:scores
    };
}
