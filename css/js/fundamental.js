document.getElementById("searchBtn").addEventListener("click", function () {

    const symbol = document.getElementById("stockSearch").value.trim().toUpperCase();

    const stock = stocks[symbol];

    if (!stock) {
        alert("Stock not found!");
        return;
    }

    document.getElementById("score").innerHTML = stock.score;
    document.getElementById("signal").innerHTML = stock.signal;

    document.getElementById("health").innerHTML = stock.health;
    document.getElementById("growth").innerHTML = stock.growth;
    document.getElementById("valuation").innerHTML = stock.valuation;
    document.getElementById("risk").innerHTML = stock.risk;
    document.getElementById("profitability").innerHTML = stock.profitability;
    document.getElementById("cashflow").innerHTML = stock.cashflow;
});
