const assert = require("node:assert/strict");
const { test } = require("node:test");
const catalogPreview = require("../catalog-preview");

test("provides categories and the seeded catalog to the standalone preview", async () => {
  const categories = await catalogPreview.request("/api/products/categories");
  const catalog = await catalogPreview.request("/api/products?page=1&pageSize=24");

  assert.deepEqual(
    categories.categories.map(({ category }) => category),
    ["decor", "furniture", "lighting", "textiles"],
  );
  assert.equal(catalog.pagination.total, 8);
  assert.equal(catalog.items[0].id, "minimal-lamp");
  assert.equal(catalog.items[0].priceCents, 4900);
});

test("applies catalog search, category, price, sort, and pagination filters", async () => {
  const result = await catalogPreview.request(
    "/api/products?q=lamp&category=lighting&minPrice=4000&sort=price-descending&page=1&pageSize=1",
  );

  assert.deepEqual(result.items.map(({ id }) => id), ["arc-floor-lamp"]);
  assert.deepEqual(result.pagination, { page: 1, pageSize: 1, total: 2, totalPages: 2 });
});

test("looks up catalog products by ID or slug", async () => {
  const result = await catalogPreview.request("/api/products/modular-shelf");

  assert.equal(result.product.id, "modular-shelf");
  assert.equal(result.product.specifications.Mounting, "Wall-mounted");
});

test("keeps the file preview read-only for commerce operations", async () => {
  await assert.rejects(
    catalogPreview.request("/api/auth/login", { method: "POST" }),
    /file preview is read-only/i,
  );
});
