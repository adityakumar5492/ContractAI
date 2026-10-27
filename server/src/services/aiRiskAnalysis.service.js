import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const aiDirectory = path.resolve(serverDirectory, "../../../ai");

// Production can provide AI credentials in the server environment. For local
// development, load only the settings required by the existing AI modules.
if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY || !process.env.GROQ_API_KEY) {
  try {
    const aiEnvironment = dotenv.parse(readFileSync(path.join(aiDirectory, ".env")));
    for (const key of ["QDRANT_URL", "QDRANT_API_KEY", "GROQ_API_KEY"]) {
      if (!process.env[key] && aiEnvironment[key]) process.env[key] = aiEnvironment[key];
    }
  } catch {
    // Analyzer returns a safe configuration error when analysis is requested.
  }
}

const aiRequire = createRequire(path.join(aiDirectory, "package.json"));
const { analyzeContractRisks } = aiRequire("./src/risk-analyzer.js");

export default { analyzeContractRisks };
