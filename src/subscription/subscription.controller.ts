import {
  Controller,
  Post,
  Body,
  RawBodyRequest,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SubscriptionService } from "./subscription.service";
import { Stripe } from "stripe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guards";
import { UseGuards } from "@nestjs/common/decorators";
import mongoose from "mongoose";

// const stripe = new Stripe("process.env.STRIPE_TEST_MODE_API_KEY", {
//   apiVersion: "2022-11-15",
// });

@Controller("subscription")
export class SubscriptionController {
  private readonly stripe: Stripe;

  constructor(private subscriptionService: SubscriptionService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2022-11-15",
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("create-checkout-session")
  @HttpCode(HttpStatus.OK)
  async createSubscription(@Req() req, @Res() res) {
    const user_email = req.user["email"];

    const priceId = "price_1MitMoCWJBDJNhy8OQeBC2pY";

    // Create a new checkout session
    try {
      const session = await this.stripe.checkout.sessions.create({
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        currency: "AUD",
        customer_email: user_email,
        mode: "subscription",
        success_url: "http://localhost:3000/subscription/success",
        cancel_url: "http://localhost:3000/subscription/cancel",
      });

      console.log("Checkout session created!");
      // redirect frontend page to the stripe pre-build checkout page
      res.json({ session_url: session.url });
    } catch (e) {
      res.status(400);
      return res.send({
        error: {
          message: e.message,
        },
      });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post("create-portal-session")
  @HttpCode(HttpStatus.OK)
  async createCustomerPortal(@Req() req, @Res() res) {
    // Get user email from Guard
    const user_email = req.user["email"];

    // Using email to find the customer info in DB
    const customer = await this.subscriptionService.findCustomerByEmail(
      user_email
    );

    const returnUrl = "http://localhost:3000";

    // Create a billing portal with stripe
    const portalSession = await this.stripe.billingPortal.sessions.create({
      customer: customer,
      return_url: returnUrl,
    });

    // Send the billing port url to front end for redirection
    res.json({ portalSession_url: portalSession.url });
  }

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: string | Buffer,
    @Req() req: RawBodyRequest<Request>,
    @Res() res
  ) {
    const raw_body = req.rawBody;
    // Extract signature from request header
    const signature = req.headers["stripe-signature"];
    const webhook_signing_secret = process.env.WEBHOOK_SIGNING_SECRET;

    // Verify signature
    let event;
    try {
      event = this.stripe.webhooks.constructEvent(
        raw_body,
        signature,
        webhook_signing_secret
      );
    } catch (err) {
      //Invalid signature or body or webhook_secret
      console.log("Webhook signature verification failed");
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Get all necessary data from stripe request payload(body)
    const customer_email = event.data.object.customer_email;
    const customer = event.data.object.customer;
    const payment_method_types = event.data.object.payment_method_types;
    const payment_status = event.data.object.payment_status;
    const subscription = event.data.object.subscription;

    // Handle the event data based on the event type
    let intent = null;
    switch (event.type) {
      case "checkout.session.completed":
        intent = event.data.object;
        console.log("Payment Successful", intent.id);
        // Add this subscription info to db
        const subscriptionData = {
          _id: new mongoose.Types.ObjectId(),
          customer_email,
          customer,
          payment_method_types,
          payment_status,
          subscription,
        };
        this.subscriptionService.createSubscription(subscriptionData);

      case "invoice.paid":
        intent = event.data.object;
        console.log("Payment Successful", intent.id);
        break;

      case "invoice.payment_failed":
        intent = event.data.object;
        const message =
          intent.last_payment_error && intent.last_payment_error.message;
        console.log("Payment Failed:", intent.id, message);
        break;
    }

    // Send a response back to Stripe to acknowledge receipt of the webhook
    res.sendStatus(200);
  }
}