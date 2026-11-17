const express = require("express");
const { HttpError, requireInteger } = require("./helpers");

function productFromRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    material: row.material,
    description: row.description,
    specifications: row.specifications,
    images: row.images,
    imageTheme: row.image_theme,
    priceCents: row.price_cents,
    stockQuantity: row.stock_quantity,
    availableQuantity: row.stock_quantity - row.reserved_quantity,
    inStock: row.stock_quantity > row.reserved_quantity,
    featuredRank: row.featured_rank,
  };
}

function createCatalogRouter(database) {
  const router = express.Router();
  const selectFields = `id, slug, name, category, material, description, specifications,
    images, image_theme, price_cents, stock_quantity, reserved_quantity, featured_rank`;

  router.get("/categories", async (_request, response) => {
    const result = await database.query(
      `SELECT category, count(*)::integer AS product_count
       FROM products
       WHERE active = true
       GROUP BY category
       ORDER BY category`,
    );
    response.json({ categories: result.rows });
  });

  router.get("/", async (request, response) => {
    const term = typeof request.query.q === "string" ? request.query.q.trim() : "";
    if (term.length > 100) throw new HttpError(400, "Search text must be 100 characters or fewer.");

    const category =
      typeof request.query.category === "string" && request.query.category !== "all"
        ? request.query.category.trim().toLowerCase()
        : null;
    if (category && !/^[a-z0-9-]{1,40}$/.test(category)) {
      throw new HttpError(400, "Choose a valid product category.");
    }

    const minPrice = request.query.minPrice
      ? requireInteger(request.query.minPrice, { name: "Minimum price", minimum: 0, maximum: 100000000 })
      : null;
    const maxPrice = request.query.maxPrice
      ? requireInteger(request.query.maxPrice, { name: "Maximum price", minimum: 0, maximum: 100000000 })
      : null;
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      throw new HttpError(400, "Minimum price cannot exceed maximum price.");
    }

    const inStockValue = request.query.inStock;
    if (inStockValue !== undefined && !["true", "false"].includes(inStockValue)) {
      throw new HttpError(400, "The in-stock filter must be true or false.");
    }
    const inStockOnly = inStockValue === "true";
    const page = requireInteger(request.query.page || "1", {
      name: "Page",
      minimum: 1,
      maximum: 100000,
    });
    const pageSize = requireInteger(request.query.pageSize || "8", {
      name: "Page size",
      minimum: 1,
      maximum: 24,
    });

    const sort = request.query.sort || "featured";
    const sortExpressions = {
      featured: "featured_rank ASC, created_at DESC",
      "price-ascending": "price_cents ASC, id ASC",
      "price-descending": "price_cents DESC, id ASC",
      name: "name ASC, id ASC",
      newest: "created_at DESC, id ASC",
    };
    if (typeof sort !== "string" || !sortExpressions[sort]) {
      throw new HttpError(400, "Choose a valid sort order.");
    }

    const searchPattern = `%${term}%`;
    const values = [searchPattern, category, minPrice, maxPrice, inStockOnly];
    const where = `active = true
      AND ($1 = '%%' OR name ILIKE $1 OR material ILIKE $1 OR description ILIKE $1)
      AND ($2::text IS NULL OR category = $2)
      AND ($3::integer IS NULL OR price_cents >= $3)
      AND ($4::integer IS NULL OR price_cents <= $4)
      AND (NOT $5::boolean OR stock_quantity > reserved_quantity)`;
    const [countResult, productsResult] = await Promise.all([
      database.query(`SELECT count(*)::integer AS total FROM products WHERE ${where}`, values),
      database.query(
        `SELECT ${selectFields} FROM products
         WHERE ${where}
         ORDER BY ${sortExpressions[sort]}
         LIMIT $6 OFFSET $7`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
    ]);

    const total = countResult.rows[0].total;
    response.json({
      items: productsResult.rows.map(productFromRow),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  });

  router.get("/:slug", async (request, response) => {
    const result = await database.query(
      `SELECT ${selectFields} FROM products
       WHERE (slug = $1 OR id = $1) AND active = true
       ORDER BY (slug = $1) DESC LIMIT 1`,
      [request.params.slug],
    );
    if (result.rowCount === 0) {
      response.status(404).json({ error: "This piece could not be found." });
      return;
    }
    response.json({ product: productFromRow(result.rows[0]) });
  });

  return router;
}

module.exports = { createCatalogRouter, productFromRow };
