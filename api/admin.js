const { randomUUID } = require("node:crypto");
const express = require("express");
const {
  HttpError,
  requireInteger,
  safeImageUrl,
} = require("./helpers");
const { productFromRow } = require("./catalog");

const productFields = `id, slug, name, category, material, description, specifications,
  images, image_theme, price_cents, stock_quantity, reserved_quantity, featured_rank`;

function parseProduct(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Provide valid product details.");
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const category = typeof body?.category === "string" ? body.category.trim().toLowerCase() : "";
  const material = typeof body?.material === "string" ? body.material.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (name.length < 2 || name.length > 120) {
    throw new HttpError(400, "Product name must be between 2 and 120 characters.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new HttpError(400, "Use a lowercase, URL-friendly product slug.");
  }
  if (!/^[a-z0-9-]{2,40}$/.test(category)) {
    throw new HttpError(400, "Choose a category using lowercase letters, numbers, or hyphens.");
  }
  if (material.length > 120 || description.length > 2000) {
    throw new HttpError(400, "Product material or description is too long.");
  }

  const images = body.images === undefined ? [] : body.images;
  if (!Array.isArray(images) || images.length > 8 || images.some((image) => !safeImageUrl(image))) {
    throw new HttpError(400, "Add up to eight secure image URLs for this product.");
  }
  const specifications = body.specifications === undefined ? {} : body.specifications;
  if (
    !specifications ||
    typeof specifications !== "object" ||
    Array.isArray(specifications) ||
    Object.keys(specifications).length > 20 ||
    Object.entries(specifications).some(
      ([key, value]) =>
        key.trim().length === 0 ||
        key.length > 60 ||
        typeof value !== "string" ||
        value.length > 160,
    )
  ) {
    throw new HttpError(400, "Product specifications must be a short list of text values.");
  }

  const imageTheme = body.imageTheme ?? "product-one";
  if (
    typeof imageTheme !== "string" ||
    !/^product-(one|two|three|four|five|six|seven|eight)$/.test(imageTheme)
  ) {
    throw new HttpError(400, "Choose one of the available studio image styles.");
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    throw new HttpError(400, "Product availability must be true or false.");
  }

  return {
    name,
    slug,
    category,
    material,
    description,
    images,
    specifications,
    imageTheme,
    priceCents: requireInteger(body.priceCents, {
      name: "Price in cents",
      minimum: 1,
      maximum: 100000000,
    }),
    stockQuantity: requireInteger(body.stockQuantity, {
      name: "Inventory",
      minimum: 0,
      maximum: 1000000,
    }),
    featuredRank: requireInteger(body.featuredRank ?? 1000, {
      name: "Featured rank",
      minimum: 0,
      maximum: 1000000,
    }),
    active: body.active ?? true,
  };
}

function parseOptionalDate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, `${label} must be a valid date.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${label} must be a valid date.`);
  return date.toISOString();
}

function createAdminRouter({ database, sessions, paymentProvider }) {
  const router = express.Router();

  router.get("/products", sessions.requireAdmin, async (_request, response) => {
    const result = await database.query(
      `SELECT ${productFields}, active FROM products ORDER BY featured_rank, name`,
    );
    response.json({
      products: result.rows.map((row) => ({
        ...productFromRow(row),
        active: row.active,
      })),
    });
  });

  router.post("/products", sessions.requireAdmin, async (request, response) => {
    const product = parseProduct(request.body);
    try {
      const result = await database.query(
        `INSERT INTO products (
           id, slug, name, category, material, description, specifications, images,
           image_theme, price_cents, stock_quantity, featured_rank, active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13)
         RETURNING ${productFields}, active`,
        [
          randomUUID(),
          product.slug,
          product.name,
          product.category,
          product.material,
          product.description,
          JSON.stringify(product.specifications),
          JSON.stringify(product.images),
          product.imageTheme,
          product.priceCents,
          product.stockQuantity,
          product.featuredRank,
          product.active,
        ],
      );
      response.status(201).json({
        product: { ...productFromRow(result.rows[0]), active: result.rows[0].active },
      });
    } catch (error) {
      if (error.code === "23505") throw new HttpError(409, "That product slug is already in use.");
      throw error;
    }
  });

  router.put("/products/:id", sessions.requireAdmin, async (request, response) => {
    const product = parseProduct(request.body);
    try {
      const result = await database.query(
        `UPDATE products SET
           slug = $2, name = $3, category = $4, material = $5, description = $6,
           specifications = $7::jsonb, images = $8::jsonb, image_theme = $9,
           price_cents = $10, stock_quantity = $11, featured_rank = $12,
           active = $13, updated_at = now()
         WHERE id = $1 AND reserved_quantity <= $11
         RETURNING ${productFields}, active`,
        [
          request.params.id,
          product.slug,
          product.name,
          product.category,
          product.material,
          product.description,
          JSON.stringify(product.specifications),
          JSON.stringify(product.images),
          product.imageTheme,
          product.priceCents,
          product.stockQuantity,
          product.featuredRank,
          product.active,
        ],
      );
      if (result.rowCount === 0) {
        const existing = await database.query(
          "SELECT reserved_quantity FROM products WHERE id = $1",
          [request.params.id],
        );
        if (existing.rowCount === 0) {
          response.status(404).json({ error: "Product not found." });
          return;
        }
        throw new HttpError(409, "Inventory cannot be lower than units currently reserved for checkout.");
      }
      response.json({ product: { ...productFromRow(result.rows[0]), active: result.rows[0].active } });
    } catch (error) {
      if (error.code === "23505") throw new HttpError(409, "That product slug is already in use.");
      throw error;
    }
  });

  router.delete("/products/:id", sessions.requireAdmin, async (request, response) => {
    const result = await database.query(
      `UPDATE products SET active = false, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [request.params.id],
    );
    if (result.rowCount === 0) {
      response.status(404).json({ error: "Product not found." });
      return;
    }
    response.status(204).end();
  });

  router.get("/coupons", sessions.requireAdmin, async (_request, response) => {
    const result = await database.query(
      `SELECT id, code, discount_type, discount_value, minimum_subtotal_cents,
              max_redemptions, redeemed_count, reserved_count, starts_at, ends_at, active
       FROM coupons ORDER BY created_at DESC`,
    );
    response.json({ coupons: result.rows });
  });

  router.post("/coupons", sessions.requireAdmin, async (request, response) => {
    if (!paymentProvider?.coupons?.create) {
      throw new HttpError(503, "Configure Stripe before creating discount codes.");
    }
    const code = typeof request.body?.code === "string" ? request.body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      throw new HttpError(400, "Discount codes must be 3 to 32 letters, numbers, hyphens, or underscores.");
    }
    const percentOff = request.body?.percentOff;
    const amountOffCents = request.body?.amountOffCents;
    if ((percentOff === undefined) === (amountOffCents === undefined)) {
      throw new HttpError(400, "Choose either a percentage or fixed-amount discount.");
    }
    const discountType = percentOff === undefined ? "amount" : "percent";
    const discountValue = requireInteger(discountType === "percent" ? percentOff : amountOffCents, {
      name: discountType === "percent" ? "Percentage discount" : "Discount in cents",
      minimum: 1,
      maximum: discountType === "percent" ? 100 : 100000000,
    });
    const minimumSubtotalCents = requireInteger(request.body?.minimumSubtotalCents ?? 0, {
      name: "Minimum subtotal in cents",
      minimum: 0,
      maximum: 100000000,
    });
    const maxRedemptions =
      request.body?.maxRedemptions === undefined || request.body.maxRedemptions === null || request.body.maxRedemptions === ""
        ? null
        : requireInteger(request.body.maxRedemptions, {
            name: "Redemption limit",
            minimum: 1,
            maximum: 100000000,
          });
    const startsAt = parseOptionalDate(request.body?.startsAt, "Start date");
    const endsAt = parseOptionalDate(request.body?.endsAt, "End date");
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new HttpError(400, "The end date must be after the start date.");
    }

    const existing = await database.query("SELECT 1 FROM coupons WHERE code = $1", [code]);
    if (existing.rowCount > 0) throw new HttpError(409, "That discount code already exists.");

    let stripeCoupon;
    try {
      stripeCoupon = await paymentProvider.coupons.create({
        name: code,
        duration: "once",
        ...(discountType === "percent"
          ? { percent_off: discountValue }
          : { amount_off: discountValue, currency: "usd" }),
        ...(maxRedemptions === null ? {} : { max_redemptions: maxRedemptions }),
        ...(endsAt ? { redeem_by: Math.floor(new Date(endsAt).getTime() / 1000) } : {}),
      });
    } catch (error) {
      console.error("Stripe could not create the discount code.", error);
      throw new HttpError(502, "Stripe is temporarily unable to create this discount code.");
    }
    try {
      const result = await database.query(
        `INSERT INTO coupons (
           id, code, stripe_coupon_id, discount_type, discount_value,
           minimum_subtotal_cents, max_redemptions, starts_at, ends_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, code, discount_type, discount_value, minimum_subtotal_cents,
                   max_redemptions, redeemed_count, reserved_count, starts_at, ends_at, active`,
        [
          randomUUID(),
          code,
          stripeCoupon.id,
          discountType,
          discountValue,
          minimumSubtotalCents,
          maxRedemptions,
          startsAt,
          endsAt,
        ],
      );
      response.status(201).json({ coupon: result.rows[0] });
    } catch (error) {
      try {
        await paymentProvider.coupons.del(stripeCoupon.id);
      } catch (cleanupError) {
        console.error("Unable to remove the unused Stripe coupon after database insertion failed.", cleanupError);
      }
      if (error.code === "23505") throw new HttpError(409, "That discount code already exists.");
      throw error;
    }
  });

  router.patch("/coupons/:id", sessions.requireAdmin, async (request, response) => {
    if (typeof request.body?.active !== "boolean") {
      throw new HttpError(400, "Coupon availability must be true or false.");
    }
    const result = await database.query(
      `UPDATE coupons SET active = $2 WHERE id = $1
       RETURNING id, code, discount_type, discount_value, minimum_subtotal_cents,
                 max_redemptions, redeemed_count, reserved_count, starts_at, ends_at, active`,
      [request.params.id, request.body.active],
    );
    if (result.rowCount === 0) {
      response.status(404).json({ error: "Discount code not found." });
      return;
    }
    response.json({ coupon: result.rows[0] });
  });

  return router;
}

module.exports = { createAdminRouter, parseProduct };
