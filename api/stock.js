// ==========================================
// Dropout Automatic Stock API
// Serverless Function v3
// ==========================================

import { getFundamentals } from "./providers/fundamentals.js";


export default async function handler(req, res) {


    const rawSymbol = req.query.symbol;


    if(!rawSymbol){

        return res.status(400).json({
            error:"Stock symbol required"
        });

    }


    const symbol =
        rawSymbol
        .toUpperCase()
        .trim();



    try {


        const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS`;



        const response =
        await fetch(url);



        if(!response.ok){

            return res.status(404).json({
                error:"Stock data unavailable"
            });

        }



        const data =
        await response.json();



        const result =
        data.chart?.result?.[0];



        if(!result){

            return res.status(404).json({
                error:"Stock not found"
            });

        }



        const meta =
        result.meta;



        const fundamentals =
        await getFundamentals(symbol);



        res.status(200).json({


            symbol,


            companyName:
            meta.shortName ||
            meta.longName ||
            symbol,



            currentPrice:
            meta.regularMarketPrice || 0,



            high52Week:
            meta.fiftyTwoWeekHigh || 0,



            low52Week:
            meta.fiftyTwoWeekLow || 0,



            beta:
            fundamentals?.beta || 1,



            ...(fundamentals || {})


        });



    }
    catch(error){


        console.log(
            "Stock API Error:",
            error
        );


        res.status(500).json({

            error:"Unable to fetch stock data"

        });


    }


}
