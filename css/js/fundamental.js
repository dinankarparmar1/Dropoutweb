document.getElementById("searchBtn").addEventListener("click", function () {

    const symbol = document.getElementById("stockSearch").value.trim().toUpperCase();

    const stock = stocks[symbol];

    if (!stock) {
        alert("Stock not found!");
        return;
    }

    // Company Information
    document.getElementById("companyName").innerHTML = stock.name;
    document.getElementById("price").innerHTML = stock.price;
    document.getElementById("marketCap").innerHTML = stock.marketCap;
    document.getElementById("pe").innerHTML = stock.pe;
    document.getElementById("eps").innerHTML = stock.eps;
    document.getElementById("roe").innerHTML = stock.roe;
    document.getElementById("debt").innerHTML = stock.debt;

    // AI Score
    document.getElementById("score").innerHTML = stock.score;
    document.getElementById("signal").innerHTML = stock.signal;

    // Metrics
    document.getElementById("health").innerHTML = stock.health;
    document.getElementById("growth").innerHTML = stock.growth;
    document.getElementById("valuation").innerHTML = stock.valuation;
    document.getElementById("risk").innerHTML = stock.risk;
    document.getElementById("profitability").innerHTML = stock.profitability;
    document.getElementById("cashflow").innerHTML = stock.cashflow;

});
