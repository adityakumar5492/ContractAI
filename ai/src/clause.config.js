const CLAUSE_TYPES = Object.freeze([
  'PARTIES',
  'PAYMENT',
  'FEES',
  'TERM',
  'TERMINATION',
  'RENEWAL',
  'CONFIDENTIALITY',
  'INTELLECTUAL_PROPERTY',
  'DATA_PROTECTION',
  'LIABILITY',
  'INDEMNIFICATION',
  'WARRANTIES',
  'REPRESENTATIONS',
  'NON_COMPETE',
  'NON_SOLICITATION',
  'GOVERNING_LAW',
  'DISPUTE_RESOLUTION',
  'NOTICE',
  'FORCE_MAJEURE',
  'ASSIGNMENT',
  'AUDIT',
  'INSURANCE',
  'COMPLIANCE',
  'GENERAL',
]);

const CLAUSE_RETRIEVAL_QUERIES = Object.freeze([
  'parties, contracting entities, and their legal names',
  'payment terms, invoice deadlines, fees, and expenses',
  'agreement term, duration, effective date, and renewal',
  'termination rights, conditions, and notice period',
  'confidential information and confidentiality obligations',
  'intellectual property ownership, licenses, and work product',
  'data protection, privacy, and personal information obligations',
  'liability, limitations of liability, and damages',
  'indemnification, defense, and hold harmless obligations',
  'warranties, disclaimers, and representations',
  'non-compete and non-solicitation restrictions',
  'governing law, venue, arbitration, and dispute resolution',
  'notices, delivery methods, and notice addresses',
  'force majeure events and resulting obligations',
  'assignment, delegation, and transfer of the agreement',
  'audit rights, insurance requirements, and legal compliance',
]);

const DEFAULT_CHUNKS_PER_QUERY = 4;
const MAX_CHUNKS_PER_QUERY = 8;
const MAX_UNIQUE_CHUNKS = 48;
const MAX_CONTEXT_CHARACTERS = 24_000;
const MAX_COMPLETION_TOKENS = 3_000;
const MAX_DOCUMENT_ID_LENGTH = 255;
const MAX_CLAUSES = 48;

module.exports = {
  CLAUSE_TYPES,
  CLAUSE_RETRIEVAL_QUERIES,
  DEFAULT_CHUNKS_PER_QUERY,
  MAX_CHUNKS_PER_QUERY,
  MAX_UNIQUE_CHUNKS,
  MAX_CONTEXT_CHARACTERS,
  MAX_COMPLETION_TOKENS,
  MAX_DOCUMENT_ID_LENGTH,
  MAX_CLAUSES,
};
