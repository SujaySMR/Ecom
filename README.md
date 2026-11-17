# Forma Storefront

Forma is a responsive, future-facing homeware storefront with a PostgreSQL-backed commerce API and Stripe-hosted checkout.

## Features

- Database-driven product catalog with server-side search, category, price, stock, sort, and pagination filters
- Shareable product detail routes with image galleries and specifications
- Guest cart and wishlist saved in the browser; signed-in carts and wishlists sync across devices
- Customer registration, secure password hashing, HttpOnly sessions, and order history
- Admin product, availability, inventory, and discount-code management
- Stripe Checkout with server-owned prices, stock reservations, worldwide shipping, and signed webhooks
- Order persistence and inventory updates after Stripe confirms payment
- Newsletter signup stored in PostgreSQL
- Security headers, same-origin checks, request limits, database-backed rate limits, and parameterized queries
- Responsive neon-glass storefront styling with accessible dialogs and keyboard search

## Catalog-only file preview

For a quick visual showcase without starting PostgreSQL, open `index.html` directly in a browser. The bundled `catalog-preview.js` provides a read-only local catalog API with the seeded products, search, filters, sorting, product details, and local cart/wishlist storage. Account, admin, newsletter, and checkout features require the full app below.

## Run locally

Requirements: Node.js 18+, npm, and Docker Compose.

```powershell
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres
npm run db:migrate
npm start
```

Open `http://localhost:3000`. Update `.env` before migrating:

- Keep `DATABASE_URL` and `POSTGRES_PASSWORD` in sync. The example password is for local development only.
- Set `STRIPE_SECRET_KEY` to a Stripe **test** secret key (`sk_test_...`) to enable checkout.
- To create the initial administrator, set both `INITIAL_ADMIN_EMAIL` and a strong `INITIAL_ADMIN_PASSWORD` (at least 16 characters), then run the migration command. Remove these bootstrap values afterward; running migrations with them present will reset that administrator's password.
- Set `APP_URL` to the exact storefront origin.

To receive order fulfillment events locally, run Stripe CLI in a second terminal:

```powershell
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` value printed by Stripe CLI into `STRIPE_WEBHOOK_SECRET`, then restart the app. A successful return from Stripe is also verified server-side; webhooks provide reliable fulfillment if the customer closes the return page.

The local database data is stored in the `forma-postgres-data` Docker volume. Use `docker compose down` to stop PostgreSQL; do not remove the volume unless you intend to delete local data.

## Tests

```powershell
npm test
```

The test suite uses injected payment/database doubles and does not require Stripe credentials or a running PostgreSQL server.

## Production checklist

- Use a managed PostgreSQL service, a strong secret-managed `DATABASE_URL`, TLS, backups, and appropriate pool sizing.
- Run `npm run db:migrate` as a deployment step before starting application instances.
- Configure a live Stripe secret and verified webhook secret in the hosting provider's secret manager.
- Use HTTPS for `APP_URL`; secure session cookies are enabled automatically for HTTPS origins.
- Replace the example shipping destinations and prices with actual carrier rules; configure tax/VAT collection before launch.
- Add email verification, password recovery, order/customer email delivery, and newsletter unsubscribe handling before collecting production accounts or marketing subscriptions.
- Review privacy, returns, accessibility, and regional consumer requirements.

The account system currently supports registration, sign-in, sign-out, and order history, but does not yet verify email addresses or provide password recovery. Newsletter addresses are stored for the store operator; no email campaign is sent by this application.

## Project structure

- `index.html`, `style.css`, `app.js` - storefront and browser interactions
- `api/` - catalog, accounts, admin, checkout, and newsletter route modules
- `database.js`, `migrate.js`, `migrations/` - PostgreSQL connection, versioned schema, and bootstrap
- `server.js` - Express application and startup
- `compose.yaml` - local PostgreSQL service
- `test/` - automated API and validation tests
- `assets/`, `img/` - storefront assets
