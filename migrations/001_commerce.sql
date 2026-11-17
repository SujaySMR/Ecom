CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX user_sessions_expires_at_idx ON user_sessions(expires_at);

CREATE TABLE products (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  material text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_theme text NOT NULL DEFAULT 'product-one',
  price_cents integer NOT NULL CHECK (price_cents > 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  featured_rank integer NOT NULL DEFAULT 1000,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_quantity <= stock_quantity)
);
CREATE INDEX products_catalog_idx ON products(active, category, featured_rank, created_at DESC);
CREATE INDEX products_price_idx ON products(active, price_cents);

CREATE TABLE cart_items (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE wishlist_items (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE coupons (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  stripe_coupon_id text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'amount')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  minimum_subtotal_cents integer NOT NULL DEFAULT 0 CHECK (minimum_subtotal_cents >= 0),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  reserved_count integer NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  redeemed_count integer NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type != 'percent' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE checkout_reservations (
  cart_reference text PRIMARY KEY CHECK (cart_reference ~ '^[a-f0-9]{32}$'),
  stripe_session_id text UNIQUE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  coupon_id text REFERENCES coupons(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'fulfilled', 'released')),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  shipping_cents integer NOT NULL CHECK (shipping_cents >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkout_reservations_expiry_idx ON checkout_reservations(state, expires_at);

CREATE TABLE checkout_reservation_items (
  cart_reference text NOT NULL REFERENCES checkout_reservations(cart_reference) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  PRIMARY KEY (cart_reference, product_id)
);

CREATE TABLE orders (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  checkout_reference text NOT NULL UNIQUE REFERENCES checkout_reservations(cart_reference),
  stripe_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  status text NOT NULL CHECK (status IN ('paid', 'refunded', 'cancelled')),
  currency text NOT NULL DEFAULT 'usd',
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  shipping_cents integer NOT NULL CHECK (shipping_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  customer_email text,
  shipping_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_created_idx ON orders(user_id, created_at DESC);

CREATE TABLE order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10)
);
CREATE INDEX order_items_order_id_idx ON order_items(order_id);

CREATE TABLE newsletter_subscribers (
  email text PRIMARY KEY,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  consent_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz
);

CREATE TABLE api_rate_limits (
  bucket text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0)
);

INSERT INTO products (
  id, slug, name, category, material, description, specifications, image_theme,
  price_cents, stock_quantity, featured_rank
) VALUES
  ('minimal-lamp', 'minimal-lamp', 'Minimal Lamp', 'lighting', 'Brushed brass',
   'A sculptural table lamp with a warm, diffused glow for slow evenings.',
   '{"Finish":"Brushed brass","Bulb":"E14 LED","Dimensions":"28 × 16 cm"}'::jsonb,
   'product-one', 4900, 40, 1),
  ('leather-chair', 'leather-chair', 'Leather Chair', 'furniture', 'Forest green leather',
   'A low-profile lounge chair built around a solid frame and considered comfort.',
   '{"Frame":"Solid ash","Upholstery":"Forest green leather","Dimensions":"76 × 82 × 74 cm"}'::jsonb,
   'product-two', 12900, 12, 2),
  ('soft-throw', 'soft-throw', 'Soft Throw', 'textiles', 'Handwoven cotton',
   'A breathable, tactile layer for the sofa, reading chair, or end of the bed.',
   '{"Material":"100% cotton","Weave":"Handwoven","Dimensions":"130 × 180 cm"}'::jsonb,
   'product-three', 3500, 55, 3),
  ('wood-table', 'wood-table', 'Wood Table', 'furniture', 'Solid oak',
   'A compact side table with a softly finished top and honest oak grain.',
   '{"Material":"Solid oak","Finish":"Natural oil","Dimensions":"48 × 48 × 52 cm"}'::jsonb,
   'product-four', 19900, 8, 4),
  ('ceramic-vase', 'ceramic-vase', 'Sculpted Ceramic Vase', 'decor', 'Matte stoneware',
   'A hand-finished vessel with a quiet silhouette, made to stand alone or hold a single stem.',
   '{"Material":"Stoneware","Finish":"Matte chalk","Dimensions":"24 × 14 cm"}'::jsonb,
   'product-five', 4200, 24, 5),
  ('arc-floor-lamp', 'arc-floor-lamp', 'Arc Floor Lamp', 'lighting', 'Powder-coated steel',
   'An architectural reading light with a sweeping arm and a softly focused shade.',
   '{"Material":"Powder-coated steel","Bulb":"E27 LED","Dimensions":"165 × 42 cm"}'::jsonb,
   'product-six', 17900, 9, 6),
  ('wool-cushion', 'wool-cushion', 'Wool Cushion', 'textiles', 'Recycled wool blend',
   'A richly textured cushion cover in a warm neutral weave, finished with a hidden zip.',
   '{"Material":"70% recycled wool","Care":"Dry clean","Dimensions":"45 × 45 cm"}'::jsonb,
   'product-seven', 5800, 30, 7),
  ('modular-shelf', 'modular-shelf', 'Modular Shelf', 'furniture', 'FSC-certified oak',
   'A wall-mounted shelf designed to grow with your space, one considered module at a time.',
   '{"Material":"FSC-certified oak","Mounting":"Wall-mounted","Dimensions":"80 × 22 × 30 cm"}'::jsonb,
   'product-eight', 24900, 6, 8)
ON CONFLICT (id) DO NOTHING;
