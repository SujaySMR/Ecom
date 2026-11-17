const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const { createApp } = require("../server");
const { MemoryDatabase } = require("./support/memory-database");

const cartReference = "0123456789abcdef0123456789abcdef";
const sessionsCreated = [];
const database = new MemoryDatabase();
let server;
let baseUrl;

const paymentProvider = {
  checkout: {
    sessions: {
      create: async (options) => {
        sessionsCreated.push(options);
        return {
          id: "cs_test_example",
          url: "https://checkout.stripe.com/c/pay/cs_test_example",
        };
      },
      retrieve: async (sessionId) => ({
        id: sessionId,
        client_reference_id: cartReference,
        payment_status: "unpaid",
        amount_total: 5895,
        currency: "usd",
      }),
    },
  },
};

before(async () => {
  server = createApp({
    database,
    paymentProvider,
    applicationUrl: "http://localhost:3000",
    webhookSecret: "whsec_test",
  }).listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function closeServer(listener) {
  const closing = new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  if (typeof listener.closeAllConnections === "function") listener.closeAllConnections();
  await closing;
}

after(async () => {
  await closeServer(server);
});

beforeEach(() => {
  database.reset();
  sessionsCreated.length = 0;
});

async function createCheckout(items, extra = {}) {
  return fetch(`${baseUrl}/api/create-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({ cartReference, items, ...extra }),
  });
}

test("creates checkout with database-owned prices and reserves stock", async () => {
  const response = await createCheckout(
    [{ productId: "minimal-lamp", quantity: 1, priceCents: 1, name: "Free lamp" }],
  );
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.url, "https://checkout.stripe.com/c/pay/cs_test_example");
  assert.equal(sessionsCreated.length, 1);
  assert.equal(sessionsCreated[0].line_items[0].price_data.unit_amount, 4900);
  assert.equal(sessionsCreated[0].line_items[0].price_data.product_data.name, "Minimal Lamp");
  assert.equal(sessionsCreated[0].shipping_options[0].shipping_rate_data.fixed_amount.amount, 895);
  assert.equal(sessionsCreated[0].client_reference_id, cartReference);
  assert.equal(database.products.get("minimal-lamp").reserved_quantity, 1);
});

test("offers complimentary shipping above the threshold", async () => {
  const response = await createCheckout([{ productId: "wood-table", quantity: 1 }]);

  assert.equal(response.status, 201);
  assert.equal(sessionsCreated[0].shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
});

test("rejects invalid quantities and unavailable products without contacting Stripe", async () => {
  const invalidQuantity = await createCheckout([{ productId: "minimal-lamp", quantity: 11 }]);
  const unavailableProduct = await createCheckout([{ productId: "not-a-product", quantity: 1 }]);

  assert.equal(invalidQuantity.status, 400);
  assert.equal(unavailableProduct.status, 400);
  assert.equal(sessionsCreated.length, 0);
});

test("rejects checkout requests from a different origin", async () => {
  const response = await fetch(`${baseUrl}/api/create-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" },
    body: JSON.stringify({
      cartReference,
      items: [{ productId: "minimal-lamp", quantity: 1 }],
    }),
  });

  assert.equal(response.status, 403);
});

test("verifies the checkout session belongs to the supplied cart reference", async () => {
  const response = await fetch(
    `${baseUrl}/api/checkout-session?session_id=cs_test_example&cart_reference=${cartReference}`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    paymentStatus: "unpaid",
    amountTotal: 5895,
    currency: "usd",
    orderId: null,
  });
});

test("rejects a checkout session with a different cart reference", async () => {
  const response = await fetch(
    `${baseUrl}/api/checkout-session?session_id=cs_test_example&cart_reference=ffffffffffffffffffffffffffffffff`,
  );

  assert.equal(response.status, 404);
});

test("reports checkout availability without exposing secret configuration", async () => {
  const response = await fetch(`${baseUrl}/api/config`);
  assert.deepEqual(await response.json(), {
    checkoutAvailable: true,
    accountsAvailable: true,
    catalogApiAvailable: true,
  });
});
