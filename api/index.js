const express = require("express");
const { createAccountRouter } = require("./accounts");
const { createAdminRouter } = require("./admin");
const { createCatalogRouter } = require("./catalog");
const { createCheckoutRouter } = require("./checkout");
const { createSessionTools } = require("./helpers");
const { createNewsletterRouter } = require("./newsletter");

function createApiRouter({ database, paymentProvider, applicationUrl, webhookSecret }) {
  const router = express.Router();
  const sessions = createSessionTools(database, applicationUrl);

  router.use(
    "/stripe/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
  );
  router.use(express.json({ limit: "50kb" }));
  router.use((request, response, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      next();
      return;
    }
    if (request.path === "/stripe/webhook") {
      next();
      return;
    }

    const origin = request.get("origin");
    try {
      if (!origin || new URL(origin).origin !== new URL(applicationUrl).origin) {
        response.status(403).json({ error: "Requests must come from the storefront." });
        return;
      }
    } catch {
      response.status(403).json({ error: "Requests must come from the storefront." });
      return;
    }
    next();
  });

  router.get("/config", (_request, response) => {
    response.json({
      checkoutAvailable: Boolean(paymentProvider),
      accountsAvailable: true,
      catalogApiAvailable: true,
    });
  });
  router.use("/products", createCatalogRouter(database));
  router.use(createAccountRouter({ database, applicationUrl }));
  router.use("/admin", createAdminRouter({ database, sessions, paymentProvider }));
  router.use(
    "/",
    createCheckoutRouter({ database, paymentProvider, applicationUrl, webhookSecret }),
  );
  router.use("/newsletter", createNewsletterRouter(database));
  router.use((_request, response) => {
    response.status(404).json({ error: "API endpoint not found." });
  });

  return router;
}

module.exports = { createApiRouter };
