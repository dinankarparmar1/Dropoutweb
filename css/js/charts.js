// ======================================
// Chart Engine
// ======================================

let revenueChart;
let profitChart;
let epsChart;
let fcfChart;

function destroy(chart){
    if(chart){
        chart.destroy();
    }
}

export function renderCharts(company){

    const h = company.history;

    destroy(revenueChart);
    destroy(profitChart);
    destroy(epsChart);
    destroy(fcfChart);

    revenueChart = new Chart(
        document.getElementById("revenueChart"),
        {
            type: "line",
            data: {
                labels: h.years,
                datasets: [{
                    label: "Revenue",
                    data: h.revenue,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        }
    );

    profitChart = new Chart(
        document.getElementById("profitChart"),
        {
            type: "bar",
            data: {
                labels: h.years,
                datasets: [{
                    label: "Net Profit",
                    data: h.netProfit
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        }
    );

    epsChart = new Chart(
        document.getElementById("epsChart"),
        {
            type: "line",
            data: {
                labels: h.years,
                datasets: [{
                    label: "EPS",
                    data: h.eps,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        }
    );

    fcfChart = new Chart(
        document.getElementById("fcfChart"),
        {
            type: "bar",
            data: {
                labels: h.years,
                datasets: [{
                    label: "Free Cash Flow",
                    data: h.freeCashFlow
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        }
    );

}
