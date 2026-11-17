const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const express = require("express");
const {
  HttpError,
  createSessionTools,
  databaseRateLimit,
  normalizeEmail,
  requireInteger,
} = require("./helpers");

function parseCartItems(items) {
  if (!Array.isArray(items) || items.length > 20) {
    throw new HttpError(400, "Your bag can contain up to 20 different pieces.");
  }
  const seen = new Set();
  return items.map((item) => {
    if (
      !item ||
      typeof item.productId !== "string" ||
      item.productId.length > 80 ||
      seen.has(item.productId)
    ) {
      throw new HttpError(400, "Your bag contains an invalid or repeated product.");
    }
    seen.add(item.productId);
    return {
      productId: item.productId,
      quantity: requireInteger(item.quantity, {
        name: "Quantity",
        minimum: 1,
        maximum: 10,
      }),
    };
  });
}

async function validateProducts(client, productIds) {
  if (productIds.length === 0) return new Set();
  const result = await client.query(
    "SELECT id FROM products WHERE id = ANY($1::text[]) AND active = true",
    [productIds],
  );
  return new Set(result.rows.map((row) => row.id));
}

function createAccountRouter({ database, applicationUrl }) {
  const router = express.Router();
  const authRouter = express.Router();
  const accountRouter = express.Router();
  const sessions = createSessionTools(database, applicationUrl);
  const authRateLimit = databaseRateLimit(database, {
    namespace: "auth",
    limit: 10,
    windowMilliseconds: 15 * 60 * 1000,
  });

  authRouter.get("/session", async (request, response) => {
    response.json({ user: await sessions.getCurrentUser(request) });
  });

  authRouter.post("/register", authRateLimit, async (request, response) => {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const email = normalizeEmail(request.body?.email);
    const password = request.body?.password;
    if (name.length < 2 || name.length > 100) {
      throw new HttpError(400, "Your name must be between 2 and 100 characters.");
    }
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      throw new HttpError(400, "Choose a password between 12 and 128 characters.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await database.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO users (id, email, name, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, name, is_admin`,
        [randomUUID(), email, name, passwordHash],
      );
      if (result.rowCount === 0) throw new HttpError(409, "An account with that email already exists.");
      return result.rows[0];
    });
    await sessions.issueSession(user.id, response);
    response.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin },
    });
  });

  authRouter.post("/login", authRateLimit, async (request, response) => {
    const email = normalizeEmail(request.body?.email);
    const password = request.body?.password;
    if (typeof password !== "string" || password.length > 128) {
      throw new HttpError(400, "Enter your email and password.");
    }
    const result = await database.query(
      "SELECT id, email, name, password_hash, is_admin FROM users WHERE email = $1",
      [email],
    );
    const user = result.rows[0];
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!passwordMatches) {
      response.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    await sessions.issueSession(user.id, response);
    response.json({
      user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin },
    });
  });

  authRouter.post("/logout", async (request, response) => {
    await sessions.clearSession(request, response);
    response.status(204).end();
  });

  accountRouter.get("/cart", sessions.requireAuth, async (request, response) => {
    const result = await database.query(
      `SELECT cart_items.product_id, cart_items.quantity, products.slug, products.name,
              products.category, products.price_cents, products.stock_quantity,
              products.reserved_quantity, products.image_theme, products.images
       FROM cart_items
       JOIN products ON products.id = cart_items.product_id
       WHERE cart_items.user_id = $1 AND products.active = true
       ORDER BY cart_items.updated_at DESC`,
      [request.user.id],
    );
    response.json({
      items: result.rows.map((row) => ({
        productId: row.product_id,
        quantity: row.quantity,
        product: {
          id: row.product_id,
          slug: row.slug,
          name: row.name,
          category: row.category,
          priceCents: row.price_cents,
          availableQuantity: row.stock_quantity - row.reserved_quantity,
          imageTheme: row.image_theme,
          images: row.images,
        },
      })),
    });
  });

  accountRouter.put("/cart", sessions.requireAuth, async (request, response) => {
    const items = parseCartItems(request.body?.items);
    await database.transaction(async (client) => {
      const availableIds = await validateProducts(
        client,
        items.map((item) => item.productId),
      );
      if (availableIds.size !== items.length) {
        throw new HttpError(400, "Your bag contains a piece that is no longer available.");
      }
      await client.query("DELETE FROM cart_items WHERE user_id = $1", [request.user.id]);
      for (const item of items) {
        await client.query(
          `INSERT INTO cart_items (user_id, product_id, quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, product_id) DO UPDATE
             SET quantity = EXCLUDED.quantity, updated_at = now()`,
          [request.user.id, item.productId, item.quantity],
        );
      }
    });
    response.json({ saved: true });
  });

  accountRouter.get("/wishlist", sessions.requireAuth, async (request, response) => {
    const result = await database.query(
      `SELECT products.id, products.slug, products.name, products.category,
              products.price_cents, products.image_theme, products.images
       FROM wishlist_items
       JOIN products ON products.id = wishlist_items.product_id
       WHERE wishlist_items.user_id = $1 AND products.active = true
       ORDER BY wishlist_items.created_at DESC`,
      [request.user.id],
    );
    response.json({ items: result.rows });
  });

  accountRouter.put("/wishlist", sessions.requireAuth, async (request, response) => {
    const items = request.body?.items;
    if (!Array.isArray(items) || items.length > 100 || items.some((id) => typeof id !== "string")) {
      throw new HttpError(400, "Your wishlist must contain up to 100 product IDs.");
    }
    const uniqueIds = [...new Set(items)];
    await database.transaction(async (client) => {
      const availableIds = await validateProducts(client, uniqueIds);
      if (availableIds.size !== uniqueIds.length) {
        throw new HttpError(400, "Your wishlist contains a piece that is no longer available.");
      }
      await client.query("DELETE FROM wishlist_items WHERE user_id = $1", [request.user.id]);
      for (const productId of uniqueIds) {
        await client.query(
          "INSERT INTO wishlist_items (user_id, product_id) VALUES ($1, $2)",
          [request.user.id, productId],
        );
      }
    });
    response.json({ saved: true });
  });

  accountRouter.post("/sync", sessions.requireAuth, async (request, response) => {
    const localCart = parseCartItems(request.body?.cart || []);
    const localWishlist = request.body?.wishlist || [];
    if (
      !Array.isArray(localWishlist) ||
      localWishlist.length > 100 ||
      localWishlist.some((id) => typeof id !== "string")
    ) {
      throw new HttpError(400, "Your wishlist contains invalid product IDs.");
    }

    const wishlistIds = [...new Set(localWishlist)];
    const result = await database.transaction(async (client) => {
      const productIds = [
        ...new Set([...localCart.map((item) => item.productId), ...wishlistIds]),
      ];
      const availableIds = await validateProducts(client, productIds);
      const removedProductIds = productIds.filter((productId) => !availableIds.has(productId));
      const validCart = localCart.filter((item) => availableIds.has(item.productId));
      const validWishlist = wishlistIds.filter((productId) => availableIds.has(productId));

      const savedCart = await client.query(
        `SELECT cart_items.product_id, cart_items.quantity
         FROM cart_items
         JOIN products ON products.id = cart_items.product_id
         WHERE cart_items.user_id = $1 AND products.active = true
         FOR UPDATE OF cart_items`,
        [request.user.id],
      );
      const mergedCart = new Map(
        savedCart.rows.map((item) => [item.product_id, item.quantity]),
      );
      for (const item of validCart) {
        mergedCart.set(item.productId, Math.min(10, (mergedCart.get(item.productId) || 0) + item.quantity));
      }
      for (const [productId, quantity] of mergedCart) {
        await client.query(
          `INSERT INTO cart_items (user_id, product_id, quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, product_id) DO UPDATE
             SET quantity = EXCLUDED.quantity, updated_at = now()`,
          [request.user.id, productId, quantity],
        );
      }
      await client.query(
        `INSERT INTO wishlist_items (user_id, product_id)
         SELECT $1, unnest($2::text[])
         ON CONFLICT (user_id, product_id) DO NOTHING`,
        [request.user.id, validWishlist],
      );
      return {
        cart: [...mergedCart].map(([productId, quantity]) => ({ productId, quantity })),
        removedProductIds,
      };
    });
    response.json(result);
  });

  accountRouter.get("/orders", sessions.requireAuth, async (request, response) => {
    const result = await database.query(
      `SELECT orders.id, orders.status, orders.currency, orders.subtotal_cents,
              orders.discount_cents, orders.shipping_cents, orders.total_cents,
              orders.created_at,
              COALESCE(
                json_agg(json_build_object(
                  'productName', order_items.product_name,
                  'unitPriceCents', order_items.unit_price_cents,
                  'quantity', order_items.quantity
                )) FILTER (WHERE order_items.id IS NOT NULL),
                '[]'::json
              ) AS items
       FROM orders
       LEFT JOIN order_items ON order_items.order_id = orders.id
       WHERE orders.user_id = $1
       GROUP BY orders.id
       ORDER BY orders.created_at DESC
       LIMIT 50`,
      [request.user.id],
    );
    response.json({ orders: result.rows });
  });

  router.use("/auth", authRouter);
  router.use("/account", accountRouter);
  return router;
}

module.exports = { createAccountRouter, parseCartItems };
