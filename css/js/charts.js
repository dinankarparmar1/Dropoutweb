// ======================================
// Chart Engine v3.0
// ======================================

let charts = {};

function destroyCharts() {

    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });

    charts = {};
}

function createChart(id, type, label, labels, data) {

    const canvas = document.getElementById(id);

    if (!canvas) return null;

    return new Chart(canvas, {
        type,

        data: {
            labels,

            datasets: [{
                label,
                data,
                borderWidth: 2,
                fill: false,
                tension: 0.35
            }]
        },

        options: {

            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    display: true
                }
            },

            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }

    });

}

export function renderCharts(company) {

    if (!company || !company.history) return;

    const h = company.history;

    destroyCharts();

    charts.revenue = createChart(
        "revenueChart",
        "line",
        "Revenue",
        h.years,
        h.revenue
    );

    charts.profit = createChart(
        "profitChart",
        "bar",
        "Net Profit",
        h.years,
        h.netProfit
    );

    charts.eps = createChart(
        "epsChart",
        "line",
        "EPS",
        h.years,
        h.eps
    );

    charts.fcf = createChart(
        "fcfChart",
        "bar",
        "Free Cash Flow",
        h.years,
        h.freeCashFlow
    );

}
