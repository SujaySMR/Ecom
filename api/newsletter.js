const express = require("express");
const { HttpError, databaseRateLimit, normalizeEmail } = require("./helpers");

function createNewsletterRouter(database) {
  const router = express.Router();
  const rateLimit = databaseRateLimit(database, {
    namespace: "newsletter",
    limit: 5,
    windowMilliseconds: 60 * 60 * 1000,
  });

  router.post("/", rateLimit, async (request, response) => {
    const email = normalizeEmail(request.body?.email);
    if (request.body?.consent !== true) {
      throw new HttpError(400, "Confirm that you want to receive Forma updates.");
    }
    await database.query(
      `INSERT INTO newsletter_subscribers (email)
       VALUES ($1)
       ON CONFLICT (email) DO UPDATE
         SET subscribed_at = now(), consent_at = now(), unsubscribed_at = NULL`,
      [email],
    );
    response.status(202).json({ subscribed: true });
  });

  return router;
}

module.exports = { createNewsletterRouter };
