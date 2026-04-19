/**
 * Sentinel now uses MongoDB (not Supabase). No SQL migration required.
 *
 * 1. Create a cluster or run local MongoDB: mongodb://127.0.0.1:27017
 * 2. Set MONGODB_URI and optional MONGODB_DB_NAME in .env
 * 3. Start the app — indexes on `incidents` are created on first use.
 */
console.log(`
MongoDB setup (Sentinel + ARIA unified app)
──────────────────────────────────────────
• Add to .env:
    MONGODB_URI=mongodb://127.0.0.1:27017
    (or your Atlas connection string)

• Optional:
    MONGODB_DB_NAME=sentinel

• Collections are created automatically when you ingest the first incident.
`);
