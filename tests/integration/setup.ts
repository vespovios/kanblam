import { config } from "dotenv";
import path from "path";

// Load test env
config({ path: path.resolve(process.cwd(), ".env.test") });
