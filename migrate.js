const fs = require("node:fs/promises");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { createDatabase } = require("./database");

async function runMigrations(database) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationDirectory = path.join(__dirname, "migrations");
  const migrationNames = (await fs.readdir(migrationDirectory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();

  for (const name of migrationNames) {
    const alreadyApplied = await database.query(
      "SELECT 1 FROM schema_migrations WHERE name = $1",
      [name],
    );
    if (alreadyApplied.rowCount > 0) continue;

    const sql = await fs.readFile(path.join(migrationDirectory, name), "utf8");
    await database.transaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    console.log(`Applied database migration ${name}.`);
  }
}

async function bootstrapAdmin(database) {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || !password) {
    throw new Error("Set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD to bootstrap an administrator.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 16) {
    throw new Error("The initial admin email must be valid and the password must contain at least 16 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await database.query(
    `INSERT INTO users (id, email, name, password_hash, is_admin)
     VALUES ($1, $2, 'Store administrator', $3, true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           is_admin = true,
           updated_at = now()`,
    [require("node:crypto").randomUUID(), email, passwordHash],
  );
  console.log(`Administrator account ${email} is ready.`);
}

async function main() {
  const database = createDatabase();
  try {
    await runMigrations(database);
    await bootstrapAdmin(database);
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Database migration failed.", error);
    process.exitCode = 1;
  });
}

module.exports = { runMigrations, bootstrapAdmin };
