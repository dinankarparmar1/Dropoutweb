// ==========================================
// Dropout Fundamentals Provider
// Version 1.0
// ==========================================

export async function getFundamentals(symbol){

    try{

        /*
        Future connection point:

        Here we will connect the
        financial data provider.

        It should return:

        revenue
        netIncome
        debt
        cashFlow
        eps
        balanceSheet
        */

        return null;


    }
    catch(error){

        console.log(
            "Fundamentals provider failed",
            error
        );

        return null;

    }

}
