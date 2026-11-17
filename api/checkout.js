const { randomUUID } = require("node:crypto");
const express = require("express");
const { getCodes } = require("country-list");
const { HttpError, createSessionTools, databaseRateLimit } = require("./helpers");
const { parseCartItems } = require("./accounts");

const shippingThresholdCents = 7500;
const standardShippingCents = 895;
const reservationDurationSeconds = 30 * 60;
const reservationGraceSeconds = 15 * 60;
const allowedShippingCountries = getCodes().filter(
  (countryCode) => !["AQ", "CU", "IR", "KP", "RU", "SY"].includes(countryCode),
);

async function reserveCheckout(database, { cartReference, items, userId, couponCode }) {
  return database.transaction(async (client) => {
    const existingReservation = await client.query(
      "SELECT state FROM checkout_reservations WHERE cart_reference = $1 FOR UPDATE",
      [cartReference],
    );
    if (existingReservation.rowCount > 0) {
      throw new HttpError(409, "This checkout reference has already been used. Refresh your bag and try again.");
    }

    const productIds = items.map((item) => item.productId);
    const productResult = await client.query(
      `SELECT id, name, price_cents, stock_quantity, reserved_quantity
       FROM products
       WHERE id = ANY($1::text[]) AND active = true
       ORDER BY id
       FOR UPDATE`,
      [productIds],
    );
    if (productResult.rowCount !== items.length) {
      throw new HttpError(400, "Your bag contains a piece that is no longer available.");
    }

    const products = new Map(productResult.rows.map((product) => [product.id, product]));
    let subtotalCents = 0;
    for (const item of items) {
      const product = products.get(item.productId);
      if (product.stock_quantity - product.reserved_quantity < item.quantity) {
        throw new HttpError(409, `${product.name} does not have enough inventory for that quantity.`);
      }
      subtotalCents += product.price_cents * item.quantity;
    }
    if (!Number.isSafeInteger(subtotalCents)) {
      throw new HttpError(400, "Your bag total is too large to check out.");
    }

    const shippingCents = subtotalCents >= shippingThresholdCents ? 0 : standardShippingCents;
    let coupon = null;
    let discountCents = 0;
    if (couponCode) {
      const couponResult = await client.query(
        `SELECT id, stripe_coupon_id, discount_type, discount_value,
                minimum_subtotal_cents, max_redemptions, reserved_count, redeemed_count
         FROM coupons
         WHERE code = $1 AND active = true
           AND (starts_at IS NULL OR starts_at <= now())
           AND (ends_at IS NULL OR ends_at > now())
         FOR UPDATE`,
        [couponCode],
      );
      coupon = couponResult.rows[0];
      if (!coupon) throw new HttpError(400, "That discount code is invalid or no longer active.");
      if (subtotalCents < coupon.minimum_subtotal_cents) {
        throw new HttpError(400, "Your bag does not meet the minimum subtotal for that code.");
      }
      if (
        coupon.max_redemptions !== null &&
        coupon.redeemed_count + coupon.reserved_count >= coupon.max_redemptions
      ) {
        throw new HttpError(400, "That discount code has reached its redemption limit.");
      }
      discountCents =
        coupon.discount_type === "percent"
          ? Math.floor((subtotalCents * coupon.discount_value) / 100)
          : Math.min(subtotalCents, coupon.discount_value);
      await client.query(
        "UPDATE coupons SET reserved_count = reserved_count + 1 WHERE id = $1",
        [coupon.id],
      );
    }

    await client.query(
      `INSERT INTO checkout_reservations (
         cart_reference, user_id, coupon_id, subtotal_cents, discount_cents,
         shipping_cents, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 * interval '1 second'))`,
      [
        cartReference,
        userId,
        coupon?.id || null,
        subtotalCents,
        discountCents,
        shippingCents,
        reservationDurationSeconds + reservationGraceSeconds,
      ],
    );

    for (const item of items) {
      const product = products.get(item.productId);
      await client.query(
        `UPDATE products
         SET reserved_quantity = reserved_quantity + $2, updated_at = now()
         WHERE id = $1`,
        [item.productId, item.quantity],
      );
      await client.query(
        `INSERT INTO checkout_reservation_items (
           cart_reference, product_id, product_name, unit_price_cents, quantity
         ) VALUES ($1, $2, $3, $4, $5)`,
        [cartReference, product.id, product.name, product.price_cents, item.quantity],
      );
    }

    return {
      products: items.map((item) => ({
        ...products.get(item.productId),
        quantity: item.quantity,
      })),
      subtotalCents,
      discountCents,
      shippingCents,
      stripeCouponId: coupon?.stripe_coupon_id || null,
    };
  });
}

async function releaseReservation(database, cartReference) {
  return database.transaction(async (client) => {
    const reservationResult = await client.query(
      `SELECT state, coupon_id FROM checkout_reservations
       WHERE cart_reference = $1 FOR UPDATE`,
      [cartReference],
    );
    const reservation = reservationResult.rows[0];
    if (!reservation || reservation.state !== "pending") return false;

    const items = await client.query(
      `SELECT product_id, quantity FROM checkout_reservation_items
       WHERE cart_reference = $1`,
      [cartReference],
    );
    for (const item of items.rows) {
      await client.query(
        `UPDATE products SET reserved_quantity = reserved_quantity - $2, updated_at = now()
         WHERE id = $1 AND reserved_quantity >= $2`,
        [item.product_id, item.quantity],
      );
    }
    if (reservation.coupon_id) {
      await client.query(
        `UPDATE coupons SET reserved_count = GREATEST(reserved_count - 1, 0)
         WHERE id = $1`,
        [reservation.coupon_id],
      );
    }
    await client.query(
      "UPDATE checkout_reservations SET state = 'released' WHERE cart_reference = $1",
      [cartReference],
    );
    return true;
  });
}

async function fulfillPaidOrder(database, session) {
  if (session.payment_status !== "paid") return null;
  if (typeof session.id !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(session.id)) {
    throw new HttpError(400, "The paid session has an invalid ID.");
  }
  if (session.currency !== "usd") {
    throw new HttpError(409, "The paid session currency does not match the storefront.");
  }
  const cartReference = session.client_reference_id || session.metadata?.cart_reference;
  if (typeof cartReference !== "string" || !/^[a-f0-9]{32}$/.test(cartReference)) {
    throw new HttpError(400, "The paid session has no valid checkout reference.");
  }
  if (!Number.isSafeInteger(session.amount_total) || typeof session.currency !== "string") {
    throw new HttpError(502, "The payment provider returned incomplete order totals.");
  }

  return database.transaction(async (client) => {
    const existingOrder = await client.query(
      "SELECT id FROM orders WHERE stripe_session_id = $1",
      [session.id],
    );
    if (existingOrder.rowCount > 0) return existingOrder.rows[0].id;

    const reservationResult = await client.query(
      `SELECT cart_reference, user_id, coupon_id, state, subtotal_cents,
              discount_cents, shipping_cents
       FROM checkout_reservations WHERE cart_reference = $1 FOR UPDATE`,
      [cartReference],
    );
    const reservation = reservationResult.rows[0];
    if (!reservation || reservation.state !== "pending") {
      throw new HttpError(409, "This checkout reservation is no longer active.");
    }

    const items = await client.query(
      `SELECT product_id, product_name, unit_price_cents, quantity
       FROM checkout_reservation_items WHERE cart_reference = $1`,
      [cartReference],
    );
    if (items.rowCount === 0) throw new HttpError(409, "The checkout has no reserved items.");

    for (const item of items.rows) {
      const updatedProduct = await client.query(
        `UPDATE products SET
           stock_quantity = stock_quantity - $2,
           reserved_quantity = reserved_quantity - $2,
           updated_at = now()
         WHERE id = $1 AND stock_quantity >= $2 AND reserved_quantity >= $2`,
        [item.product_id, item.quantity],
      );
      if (updatedProduct.rowCount === 0) {
        throw new HttpError(409, "A reserved item could not be fulfilled. Please contact the studio.");
      }
    }

    const orderId = randomUUID();
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;
    const customerEmail =
      session.customer_details?.email || session.customer_email || null;
    const shippingDetails = session.shipping_details || {};
    const actualDiscount =
      Number.isSafeInteger(session.total_details?.amount_discount)
        ? session.total_details.amount_discount
        : reservation.discount_cents;
    const actualShipping =
      Number.isSafeInteger(session.total_details?.amount_shipping)
        ? session.total_details.amount_shipping
        : reservation.shipping_cents;
    const actualSubtotal =
      Number.isSafeInteger(session.amount_subtotal)
        ? session.amount_subtotal
        : reservation.subtotal_cents;
    const expectedTotal = actualSubtotal - actualDiscount + actualShipping;
    if (expectedTotal !== session.amount_total) {
      throw new HttpError(409, "The paid session total does not match the reserved order.");
    }

    await client.query(
      `INSERT INTO orders (
         id, user_id, checkout_reference, stripe_session_id, stripe_payment_intent_id,
         status, currency, subtotal_cents, discount_cents, shipping_cents, total_cents,
         customer_email, shipping_details
       ) VALUES ($1, $2, $3, $4, $5, 'paid', $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        orderId,
        reservation.user_id,
        cartReference,
        session.id,
        paymentIntentId,
        session.currency,
        actualSubtotal,
        actualDiscount,
        actualShipping,
        session.amount_total,
        customerEmail,
        JSON.stringify(shippingDetails),
      ],
    );
    for (const item of items.rows) {
      await client.query(
        `INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          orderId,
          item.product_id,
          item.product_name,
          item.unit_price_cents,
          item.quantity,
        ],
      );
    }
    if (reservation.user_id) {
      for (const item of items.rows) {
        await client.query(
          "DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 AND quantity <= $3",
          [reservation.user_id, item.product_id, item.quantity],
        );
        await client.query(
          `UPDATE cart_items
           SET quantity = quantity - $3, updated_at = now()
           WHERE user_id = $1 AND product_id = $2 AND quantity > $3`,
          [reservation.user_id, item.product_id, item.quantity],
        );
      }
    }
    if (reservation.coupon_id) {
      await client.query(
        `UPDATE coupons
         SET reserved_count = GREATEST(reserved_count - 1, 0),
             redeemed_count = redeemed_count + 1
         WHERE id = $1`,
        [reservation.coupon_id],
      );
    }
    await client.query(
      "UPDATE checkout_reservations SET state = 'fulfilled' WHERE cart_reference = $1",
      [cartReference],
    );
    return orderId;
  });
}

async function releaseExpiredReservations(database) {
  const expired = await database.query(
    `SELECT cart_reference FROM checkout_reservations
     WHERE state = 'pending' AND expires_at <= now()
     ORDER BY expires_at LIMIT 100`,
  );
  for (const row of expired.rows) {
    await releaseReservation(database, row.cart_reference);
  }
}

function createCheckoutRouter({ database, paymentProvider, applicationUrl, webhookSecret }) {
  const router = express.Router();
  const sessions = createSessionTools(database, applicationUrl);
  const checkoutRateLimit = databaseRateLimit(database, {
    namespace: "checkout",
    limit: 20,
    windowMilliseconds: 15 * 60 * 1000,
  });

  router.post("/validate-coupon", checkoutRateLimit, async (request, response) => {
    const code = typeof request.body?.couponCode === "string"
      ? request.body.couponCode.trim().toUpperCase()
      : "";
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      throw new HttpError(400, "Enter a valid discount code.");
    }
    const items = parseCartItems(request.body?.items);
    if (items.length === 0) throw new HttpError(400, "Add a piece to your bag before applying a code.");

    const productResult = await database.query(
      `SELECT id, price_cents, stock_quantity, reserved_quantity
       FROM products WHERE id = ANY($1::text[]) AND active = true`,
      [items.map((item) => item.productId)],
    );
    if (productResult.rowCount !== items.length) {
      throw new HttpError(400, "Your bag contains a piece that is no longer available.");
    }
    const products = new Map(productResult.rows.map((product) => [product.id, product]));
    let subtotalCents = 0;
    for (const item of items) {
      const product = products.get(item.productId);
      if (product.stock_quantity - product.reserved_quantity < item.quantity) {
        throw new HttpError(409, "Your bag contains a quantity that is no longer in stock.");
      }
      subtotalCents += product.price_cents * item.quantity;
    }
    const couponResult = await database.query(
      `SELECT discount_type, discount_value, minimum_subtotal_cents,
              max_redemptions, redeemed_count, reserved_count
       FROM coupons
       WHERE code = $1 AND active = true
         AND (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at > now())`,
      [code],
    );
    const coupon = couponResult.rows[0];
    if (!coupon) throw new HttpError(400, "That discount code is invalid or no longer active.");
    if (subtotalCents < coupon.minimum_subtotal_cents) {
      throw new HttpError(400, "Your bag does not meet the minimum subtotal for that code.");
    }
    if (
      coupon.max_redemptions !== null &&
      coupon.redeemed_count + coupon.reserved_count >= coupon.max_redemptions
    ) {
      throw new HttpError(400, "That discount code has reached its redemption limit.");
    }
    const discountCents =
      coupon.discount_type === "percent"
        ? Math.floor((subtotalCents * coupon.discount_value) / 100)
        : Math.min(subtotalCents, coupon.discount_value);
    const shippingCents = subtotalCents >= shippingThresholdCents ? 0 : standardShippingCents;
    response.json({
      valid: true,
      code,
      discountCents,
      shippingCents,
      totalCents: Math.max(0, subtotalCents - discountCents) + shippingCents,
    });
  });

  router.post("/create-checkout-session", checkoutRateLimit, async (request, response) => {
    if (!paymentProvider) {
      throw new HttpError(503, "Configure Stripe to enable secure checkout.");
    }
    const cartReference = request.body?.cartReference;
    if (typeof cartReference !== "string" || !/^[a-f0-9]{32}$/.test(cartReference)) {
      throw new HttpError(400, "A valid checkout reference is required.");
    }
    const items = parseCartItems(request.body?.items);
    if (items.length < 1) {
      throw new HttpError(400, "Add at least one piece to your bag before checking out.");
    }
    const couponCode =
      typeof request.body?.couponCode === "string"
        ? request.body.couponCode.trim().toUpperCase()
        : "";
    if (couponCode && !/^[A-Z0-9_-]{3,32}$/.test(couponCode)) {
      throw new HttpError(400, "Enter a valid discount code.");
    }

    await releaseExpiredReservations(database);
    const user = await sessions.getCurrentUser(request);
    const reservation = await reserveCheckout(database, {
      cartReference,
      items,
      userId: user?.id || null,
      couponCode,
    });

    const expiresAt = Math.floor(Date.now() / 1000) + reservationDurationSeconds;
    let session;
    try {
      session = await paymentProvider.checkout.sessions.create({
        mode: "payment",
        line_items: reservation.products.map((product) => ({
          quantity: product.quantity,
          price_data: {
            currency: "usd",
            unit_amount: product.price_cents,
            product_data: { name: product.name },
          },
        })),
        shipping_address_collection: { allowed_countries: allowedShippingCountries },
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: reservation.shippingCents, currency: "usd" },
              display_name:
                reservation.shippingCents === 0
                  ? "Complimentary worldwide delivery"
                  : "Standard worldwide delivery",
            },
          },
        ],
        ...(reservation.stripeCouponId
          ? { discounts: [{ coupon: reservation.stripeCouponId }] }
          : {}),
        ...(user?.email ? { customer_email: user.email } : {}),
        client_reference_id: cartReference,
        metadata: { cart_reference: cartReference, user_id: user?.id || "" },
        expires_at: expiresAt,
        success_url: `${new URL(applicationUrl).origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${new URL(applicationUrl).origin}/?checkout=cancelled`,
      });
    } catch (error) {
      await releaseReservation(database, cartReference);
      console.error("Stripe could not create a Checkout Session.", error);
      throw new HttpError(502, "Secure checkout is temporarily unavailable. Please try again.");
    }

    if (
      typeof session?.id !== "string" ||
      typeof session.url !== "string" ||
      !session.url.startsWith("https://checkout.stripe.com/")
    ) {
      await releaseReservation(database, cartReference);
      throw new HttpError(502, "The payment provider returned an invalid checkout address.");
    }
    try {
      await database.query(
        "UPDATE checkout_reservations SET stripe_session_id = $2 WHERE cart_reference = $1",
        [cartReference, session.id],
      );
    } catch (error) {
      console.error("Unable to persist the Stripe Checkout Session reference.", error);
      if (paymentProvider.checkout.sessions.expire) {
        try {
          await paymentProvider.checkout.sessions.expire(session.id);
          await releaseReservation(database, cartReference);
        } catch (expirationError) {
          console.error("Unable to expire an untracked Stripe Checkout Session.", expirationError);
        }
      }
      throw new HttpError(502, "Checkout could not be recorded. Please contact the studio before retrying.");
    }
    response.status(201).json({
      url: session.url,
      expiresAt,
      discountCents: reservation.discountCents,
    });
  });

  router.get("/checkout-session", checkoutRateLimit, async (request, response) => {
    if (!paymentProvider) {
      throw new HttpError(503, "Secure payments are not configured.");
    }
    const sessionId = request.query.session_id;
    const cartReference = request.query.cart_reference;
    if (typeof sessionId !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      throw new HttpError(400, "A valid Checkout Session ID is required.");
    }
    if (typeof cartReference !== "string" || !/^[a-f0-9]{32}$/.test(cartReference)) {
      throw new HttpError(400, "A valid checkout reference is required.");
    }

    const session = await paymentProvider.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== cartReference) {
      response.status(404).json({ error: "This Checkout Session does not match the current bag." });
      return;
    }
    const orderId = session.payment_status === "paid"
      ? await fulfillPaidOrder(database, session)
      : null;
    response.json({
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      orderId,
    });
  });

  router.post("/stripe/webhook", async (request, response) => {
    if (!paymentProvider?.webhooks?.constructEvent || !webhookSecret) {
      throw new HttpError(503, "Stripe webhook verification is not configured.");
    }
    let event;
    try {
      event = paymentProvider.webhooks.constructEvent(
        request.body,
        request.get("stripe-signature"),
        webhookSecret,
      );
    } catch (error) {
      response.status(400).json({ error: "Invalid Stripe webhook signature." });
      return;
    }

    const session = event.data?.object;
    if (
      ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) &&
      session?.payment_status === "paid"
    ) {
      await fulfillPaidOrder(database, session);
    } else if (
      ["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)
    ) {
      const cartReference = session?.client_reference_id || session?.metadata?.cart_reference;
      if (typeof cartReference === "string" && /^[a-f0-9]{32}$/.test(cartReference)) {
        await releaseReservation(database, cartReference);
      }
    }
    response.json({ received: true });
  });

  return router;
}

module.exports = {
  createCheckoutRouter,
  fulfillPaidOrder,
  releaseExpiredReservations,
  releaseReservation,
  reserveCheckout,
};
