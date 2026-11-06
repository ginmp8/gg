import { openGGDatabase } from "./client";

const database = openGGDatabase();
database.sqlite.close();

console.log("GG database is ready.");
