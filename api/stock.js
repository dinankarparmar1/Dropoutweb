// ==========================================
// Dropout Automatic Stock API
// Serverless Function
// ==========================================

export default async function handler(req, res) {

    const symbol = req.query.symbol;

    if(!symbol){

        return res.status(400).json({
            error:"Stock symbol required"
        });

    }

    try {

        const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS`;

        const response = await fetch(url);

        const data = await response.json();

        const result =
        data.chart.result[0];

        const meta =
        result.meta;

        res.status(200).json({

            symbol:symbol.toUpperCase(),

            companyName:
            meta.shortName || symbol,

            currentPrice:
            meta.regularMarketPrice,

            high52Week:
            meta.fiftyTwoWeekHigh,

            low52Week:
            meta.fiftyTwoWeekLow

        });

    }
    catch(error){

        res.status(500).json({

            error:"Unable to fetch stock data"

        });

    }

}
