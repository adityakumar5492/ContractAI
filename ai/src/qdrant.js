const { QdrantClient } = require('@qdrant/js-client-rest');

const COLLECTION_NAME = 'contractai_chunks';
const VECTOR_SIZE = 384;
const DISTANCE = 'Cosine';

function createQdrantClient(env = process.env) {
  const url = env.QDRANT_URL?.trim();
  const apiKey = env.QDRANT_API_KEY?.trim();

  if (!url) {
    throw new Error('QDRANT_URL is required.');
  }
  if (!apiKey) {
    throw new Error('QDRANT_API_KEY is required.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('QDRANT_URL must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('QDRANT_URL must use HTTP or HTTPS.');
  }

  return new QdrantClient({ url, apiKey, checkCompatibility: false });
}

function hasExpectedVectorConfig(collection) {
  const vectors = collection?.config?.params?.vectors;
  const matches = (vector) =>
    vector?.size === VECTOR_SIZE && vector?.distance === DISTANCE;

  if (matches(vectors)) return true;
  if (!vectors || typeof vectors !== 'object') return false;

  return Object.values(vectors).some(matches);
}

async function ensureCollection(client) {
  // This authenticated request also verifies that the supplied credentials work.
  const { collections = [] } = await client.getCollections();
  let created = false;

  if (!collections.some((collection) => collection.name === COLLECTION_NAME)) {
    try {
      await client.createCollection(COLLECTION_NAME, {
        vectors: { size: VECTOR_SIZE, distance: DISTANCE },
      });
      created = true;
    } catch (createError) {
      // Treat a concurrent initializer as success only if it created our target.
      const { collections: refreshed = [] } = await client.getCollections();
      if (!refreshed.some((collection) => collection.name === COLLECTION_NAME)) {
        throw createError;
      }
    }
  }

  const collection = await client.getCollection(COLLECTION_NAME);
  if (!hasExpectedVectorConfig(collection)) {
    throw new Error(
      `${COLLECTION_NAME} exists but does not have a compatible 384-dimensional Cosine vector configuration.`,
    );
  }

  return { created, collection };
}

module.exports = {
  COLLECTION_NAME,
  DISTANCE,
  VECTOR_SIZE,
  createQdrantClient,
  ensureCollection,
};
