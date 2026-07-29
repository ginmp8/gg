import { openGitaDatabase } from "./client";

const database = openGitaDatabase();
database.sqlite.close();

console.log("Gita database is ready.");
