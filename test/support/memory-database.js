class MemoryDatabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.products = new Map([
      ["minimal-lamp", { id: "minimal-lamp", name: "Minimal Lamp", price_cents: 4900, stock_quantity: 40, reserved_quantity: 0, active: true }],
      ["wood-table", { id: "wood-table", name: "Wood Table", price_cents: 19900, stock_quantity: 8, reserved_quantity: 0, active: true }],
    ]);
    this.reservations = new Map();
    this.reservationItems = [];
    this.rateLimits = new Map();
  }

  async transaction(work) {
    return work({ query: (text, values) => this.query(text, values) });
  }

  async query(text, values = []) {
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (sql.startsWith("insert into api_rate_limits")) {
      const [bucket] = values;
      const count = (this.rateLimits.get(bucket) || 0) + 1;
      this.rateLimits.set(bucket, count);
      return { rows: [{ request_count: count, window_started_at: new Date() }], rowCount: 1 };
    }

    if (sql.startsWith("select state from checkout_reservations")) {
      const row = this.reservations.get(values[0]);
      return { rows: row ? [{ state: row.state }] : [], rowCount: row ? 1 : 0 };
    }

    if (sql.startsWith("select id, name, price_cents, stock_quantity, reserved_quantity from products")) {
      const rows = values[0]
        .map((id) => this.products.get(id))
        .filter((product) => product?.active);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith("insert into checkout_reservations")) {
      const [cartReference, userId, couponId, subtotalCents, discountCents, shippingCents] = values;
      this.reservations.set(cartReference, {
        cartReference,
        userId,
        couponId,
        subtotalCents,
        discountCents,
        shippingCents,
        state: "pending",
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith("update products set reserved_quantity = reserved_quantity +")) {
      const [productId, quantity] = values;
      const product = this.products.get(productId);
      product.reserved_quantity += quantity;
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith("insert into checkout_reservation_items")) {
      const [cartReference, productId, productName, unitPriceCents, quantity] = values;
      this.reservationItems.push({
        cartReference,
        productId,
        productName,
        unitPriceCents,
        quantity,
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith("update checkout_reservations set stripe_session_id")) {
      const [cartReference, stripeSessionId] = values;
      const reservation = this.reservations.get(cartReference);
      reservation.stripeSessionId = stripeSessionId;
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in memory database: ${sql}`);
  }
}

module.exports = { MemoryDatabase };
