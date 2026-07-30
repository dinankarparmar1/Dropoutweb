// ==========================================
// Dropout Fundamentals Provider v5.0
// Reliable Yahoo Quote Layer
// ==========================================

export async function getFundamentals(symbol){

    try{

        const url =
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.NS`;


        const response =
        await fetch(url);



        if(!response.ok){

            return {
                beta:1
            };

        }



        const json =
        await response.json();



        const quote =
        json.quoteResponse?.result?.[0];



        if(!quote){

            return {
                beta:1
            };

        }



        return {


            // Market

            marketCap:
                quote.marketCap || 0,


            beta:
                quote.beta || 1,



            // Valuation

            eps:
                quote.epsTrailingTwelveMonths || 0,


            enterpriseValue:
                quote.enterpriseValue || 0,



            // Price metrics

            previousClose:
                quote.previousClose || 0,


            fiftyTwoWeekHigh:
                quote.fiftyTwoWeekHigh || 0,


            fiftyTwoWeekLow:
                quote.fiftyTwoWeekLow || 0



        };


    }
    catch(error){


        console.log(
            "Fundamentals provider error:",
            error
        );


        return {

            beta:1

        };


    }

}
