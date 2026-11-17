const { Pool } = require("pg");

function createDatabase({ connectionString = process.env.DATABASE_URL, pool } = {}) {
  if (!pool && !connectionString) {
    throw new Error("DATABASE_URL is required. Start the local database with Docker and configure .env.");
  }

  const maximumConnections = Number(process.env.DB_POOL_SIZE || 10);
  if (!Number.isInteger(maximumConnections) || maximumConnections < 1 || maximumConnections > 100) {
    throw new Error("DB_POOL_SIZE must be an integer between 1 and 100.");
  }

  const connectionPool =
    pool ||
    new Pool({
      connectionString,
      max: maximumConnections,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });

  return {
    query: (text, values) => connectionPool.query(text, values),
    async transaction(work) {
      const client = await connectionPool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => connectionPool.end(),
  };
}

module.exports = { createDatabase };
