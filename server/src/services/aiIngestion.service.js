import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const aiDirectory = path.resolve(serverDirectory, "../../../ai");

// The AI package has its own local .env. Load only the Qdrant settings it needs;
// production deployments can provide these directly in the server environment.
if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
  try {
    const aiEnvironment = dotenv.parse(
      readFileSync(path.join(aiDirectory, ".env")),
    );
    for (const key of ["QDRANT_URL", "QDRANT_API_KEY"]) {
      if (!process.env[key] && aiEnvironment[key]) {
        process.env[key] = aiEnvironment[key];
      }
    }
  } catch {
    // The ingestion module will report a safe configuration error if required
    // settings are unavailable when an upload is processed.
  }
}

const aiRequire = createRequire(path.join(aiDirectory, "package.json"));
const { ingestContractDocument } = aiRequire("./src/document-ingestion.js");

export default { ingestContractDocument };
