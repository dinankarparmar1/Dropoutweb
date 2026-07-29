document.getElementById("searchBtn").addEventListener("click", function () {

const score = Math.floor(Math.random() * 30) + 70;

document.getElementById("score").innerHTML = score;

let signal = "HOLD";

if (score >= 85) signal = "🟢 STRONG BUY";
else if (score >= 75) signal = "🟢 BUY";
else if (score >= 65) signal = "🟡 HOLD";
else signal = "🔴 SELL";

document.getElementById("signal").innerHTML = signal;

document.getElementById("health").innerHTML = Math.floor(Math.random()*20)+80;
document.getElementById("growth").innerHTML = Math.floor(Math.random()*20)+75;
document.getElementById("valuation").innerHTML = Math.floor(Math.random()*20)+65;
document.getElementById("risk").innerHTML = Math.floor(Math.random()*30)+20;
document.getElementById("profitability").innerHTML = Math.floor(Math.random()*20)+80;
document.getElementById("cashflow").innerHTML = Math.floor(Math.random()*20)+75;

});
