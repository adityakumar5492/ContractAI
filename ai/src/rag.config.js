const GROQ_MODEL = 'openai/gpt-oss-20b';
const MAX_COMPLETION_TOKENS = 600;
const MAX_RETRIEVAL_CHUNKS = 8;
const INSUFFICIENT_CONTEXT_ANSWER = 'The available contract context is insufficient to answer this question.';

module.exports = {
  GROQ_MODEL,
  MAX_COMPLETION_TOKENS,
  MAX_RETRIEVAL_CHUNKS,
  INSUFFICIENT_CONTEXT_ANSWER,
};
