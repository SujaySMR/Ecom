require("dotenv").config();

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const Stripe = require("stripe");
const { createDatabase } = require("./database");
const { createApiRouter } = require("./api");
const { releaseExpiredReservations } = require("./api/checkout");

const port = Number(process.env.PORT || 3000);
const appUrl = new URL(process.env.APP_URL || `http://localhost:${port}`);
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const rootDirectory = __dirname;

if (!["http:", "https:"].includes(appUrl.protocol)) {
  throw new Error("APP_URL must use HTTP or HTTPS.");
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

function createApp({
  database,
  paymentProvider = stripe,
  applicationUrl = appUrl.origin,
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:", "https:"],
          "upgrade-insecure-requests": null,
        },
      },
    }),
  );

  if (database) {
    app.use(
      "/api",
      createApiRouter({ database, paymentProvider, applicationUrl, webhookSecret }),
    );
  } else {
    app.get("/api/config", (_request, response) => {
      response.json({
        checkoutAvailable: false,
        accountsAvailable: false,
        catalogApiAvailable: false,
      });
    });
    app.use("/api", (_request, response) => {
      response.status(503).json({ error: "Configure PostgreSQL to enable storefront services." });
    });
  }

  app.use((request, response, next) => {
    if (
      /^\/(?:server|database|migrate)\.js$/.test(request.path) ||
      /^\/(?:package(?:-lock)?\.json|README\.md|compose\.yaml|\.env(?:\..*)?)$/.test(request.path) ||
      /^\/(?:api|migrations|test|node_modules)\//.test(request.path)
    ) {
      response.status(404).end();
      return;
    }
    next();
  });

  app.use(express.static(rootDirectory, { index: "index.html", dotfiles: "deny" }));
  app.use((request, response, next) => {
    if (request.path.startsWith("/api/")) {
      response.status(404).json({ error: "API endpoint not found." });
      return;
    }
    response.sendFile(path.join(rootDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  app.use((error, _request, response, _next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
    if (status >= 500) console.error("The request could not be completed.", error);
    const message =
      status === 413
        ? "The request is too large."
        : status === 400 && error instanceof SyntaxError
          ? "The request body must be valid JSON."
          : status < 500
            ? error.message
            : "The request could not be completed.";
    response.status(status).json({ error: message });
  });

  return app;
}

async function startServer() {
  const database = createDatabase();
  try {
    const migration = await database.query(
      "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1",
    );
    if (migration.rowCount === 0) {
      throw new Error("No database migration has been applied. Run `npm run db:migrate` first.");
    }

    const app = createApp({
      database,
      applicationUrl: appUrl.origin,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    const server = app.listen(port, () => {
      console.log(`Forma storefront available at ${appUrl.origin}`);
      if (!stripe) {
        console.warn("Stripe is not configured. Set STRIPE_SECRET_KEY to enable secure checkout.");
      }
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.warn("Stripe webhook verification is not configured.");
      }
    });

    const maintenance = setInterval(async () => {
      try {
        await releaseExpiredReservations(database);
        await database.query(
          "DELETE FROM api_rate_limits WHERE window_started_at < now() - interval '1 day'",
        );
        await database.query("DELETE FROM user_sessions WHERE expires_at <= now()");
      } catch (error) {
        console.error("Scheduled storefront maintenance failed.", error);
      }
    }, 5 * 60 * 1000);
    maintenance.unref();
    server.on("close", () => {
      clearInterval(maintenance);
      database.close().catch((error) => {
        console.error("Unable to close the database pool.", error);
      });
    });
  } catch (error) {
    await database.close();
    console.error("The storefront could not start. Check DATABASE_URL and run `npm run db:migrate`.", error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("The storefront could not start.", error);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
