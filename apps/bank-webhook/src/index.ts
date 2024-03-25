import express from "express";
import db from "@repo/db/client";

const app = express();

app.post("/hdfcWebhook", async (req, res) => {
  //TODO: Add zod validation here?
  // Check if this request actually came from HDFC bank, use a webhook secret here
  const paymentInformation = {
    token: req.body.token,
    userId: req.body.user_identifier,
    amount: req.body.amount,
  };
  // Update balance in db, add txn

  /*
    IMPORTANT
        What is db.balance entry is updated but onRampTransaction is not made? OR vice versa
        We want either both of the requests complete or NONE OF THEM EXECUTE AT ALL
        So we use transactions in these cases
  */
  try {
    await db.$transaction([
      db.balance.updateMany({
        where: {
          userId: Number(paymentInformation.userId),
        },
        data: {
          amount: {
            /* 
                NOTE:
                    Increment helps in getting the latest amount detail on each request even if multiple parallel req come in a short span of time
                    Better to use increment than finding user balance info from db and then setting amount = prevBalance + newAmt, which might fail when multiple parallel req comes at once
            */
            increment: Number(paymentInformation.amount),
          },
        },
      }),
      /* 
        We add the token in onRampTransaction DB so that when HDFC hits back this webhook then we can validate via this token
      */
      db.onRampTransaction.updateMany({
        // Can just use .update instead? But, earlier .update was giving some error
        where: {
          token: paymentInformation.token,
        },
        data: {
          status: "Success",
        },
      }),
    ]);

    res.json({
      message: "Captured",
    });
  } catch (e) {
    console.error(e);
    // BE CAREFUL WITH STATUS CODES: Any 400 codes will make the bank refund the amount back to the user
    res.status(411).json({
      message: "Error while processing webhook",
    });
  }
});
