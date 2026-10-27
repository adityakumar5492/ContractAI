const {
  COLLECTION_NAME,
  DISTANCE,
  VECTOR_SIZE,
  createQdrantClient,
  ensureCollection,
} = require('../src/qdrant');

async function main() {
  try {
    const client = createQdrantClient();
    const { created } = await ensureCollection(client);

    console.log('Qdrant authentication succeeded.');
    console.log(
      `Collection ${COLLECTION_NAME} ${created ? 'created' : 'already existed'} and verified.`,
    );
    console.log(`Configuration: ${VECTOR_SIZE} dimensions, ${DISTANCE} distance.`);
  } catch (error) {
    // Do not print SDK errors: request details can include credential-bearing headers.
    const safeMessage =
      error instanceof Error &&
      ['QDRANT_URL is required.', 'QDRANT_API_KEY is required.', 'QDRANT_URL must be a valid URL.', 'QDRANT_URL must use HTTP or HTTPS.', `${COLLECTION_NAME} exists but does not have a compatible 384-dimensional Cosine vector configuration.`].includes(error.message)
        ? error.message
        : 'Qdrant check failed (connection, authentication, or collection operation).';
    console.error(safeMessage);
    process.exitCode = 1;
  }
}

main();
