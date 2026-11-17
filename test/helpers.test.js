const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseCartItems } = require("../api/accounts");
const { parseProduct } = require("../api/admin");
const { HttpError, normalizeEmail, safeImageUrl } = require("../api/helpers");

test("normalizes valid customer email addresses", () => {
  assert.equal(normalizeEmail("  Studio@Example.com "), "studio@example.com");
});

test("rejects malformed email addresses", () => {
  assert.throws(() => normalizeEmail("not-an-email"), HttpError);
});

test("validates and normalizes cart item quantities", () => {
  assert.deepEqual(parseCartItems([{ productId: "lamp", quantity: 2 }]), [
    { productId: "lamp", quantity: 2 },
  ]);
  assert.throws(() => parseCartItems([{ productId: "lamp", quantity: 11 }]), HttpError);
  assert.throws(
    () => parseCartItems([{ productId: "lamp", quantity: 1 }, { productId: "lamp", quantity: 2 }]),
    HttpError,
  );
});

test("validates product prices, inventory, and image sources", () => {
  const product = parseProduct({
    name: "Arc Lamp",
    slug: "arc-lamp",
    category: "lighting",
    material: "Steel",
    priceCents: 12500,
    stockQuantity: 4,
    featuredRank: 1,
    images: ["/assets/photo.jpg"],
    specifications: { Finish: "Black" },
  });
  assert.equal(product.priceCents, 12500);
  assert.equal(product.stockQuantity, 4);
  assert.equal(safeImageUrl("javascript:alert(1)"), false);
  assert.equal(safeImageUrl("https://images.example.com/lamp.jpg"), true);
  assert.throws(
    () =>
      parseProduct({
        name: "Arc Lamp",
        slug: "arc-lamp",
        category: "lighting",
        priceCents: 12500,
        stockQuantity: 4,
        images: ["javascript:alert(1)"],
      }),
    HttpError,
  );
});
