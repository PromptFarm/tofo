// Creates the SQLite DB file and schema up front, before `next build` starts.
// next build's page-data-collection phase spawns several worker processes
// that each import route modules touching the DB; against a file that
// doesn't exist yet, those workers race to CREATE TABLE and can throw
// "database is locked" even with WAL + busy_timeout (see db.ts). Running
// this once, single-process, beforehand means every worker just opens an
// already-initialized file — no race to have.
import { getDb } from "../src/lib/sqlite/db";

getDb();
