const assert = require('node:assert/strict');
const { chunkText } = require('../src/chunker');
const { extractPdfText } = require('../src/pdf-extractor');

function createTinyPdf(text) {
  const escapedText = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

async function main() {
  const sample = Array.from({ length: 30 }, (_, index) =>
    `Section ${String(index + 1).padStart(2, '0')}: Contract language for deterministic chunk ordering.`,
  ).join('\n\n');

  const firstRun = await chunkText(sample, { chunkSize: 180, chunkOverlap: 30 });
  const secondRun = await chunkText(sample, { chunkSize: 180, chunkOverlap: 30 });
  assert.deepEqual(firstRun, secondRun, 'chunking should be deterministic');
  assert.ok(firstRun.totalChunks > 1, 'sample should produce multiple chunks');
  assert.ok(firstRun.chunks.every((chunk) => chunk.text.length > 0), 'chunks should not be empty');
  assert.deepEqual(firstRun.chunks.map((chunk) => chunk.index), firstRun.chunks.map((_, index) => index));

  let cursor = 0;
  for (const chunk of firstRun.chunks) {
    const position = sample.indexOf(chunk.text, cursor);
    assert.notEqual(position, -1, 'chunk order should follow source order');
    cursor = position;
  }

  const pdfResult = await extractPdfText(createTinyPdf('Contract test paragraph.'));
  assert.equal(pdfResult.pageCount, 1);
  assert.ok(pdfResult.text.includes('Contract test paragraph.'));
  assert.equal(pdfResult.characterCount, pdfResult.text.length);

  await assert.rejects(() => extractPdfText(Buffer.from('not a PDF')), /does not appear to be a PDF/);

  console.log(`Document tests passed: ${firstRun.totalChunks} ordered chunks and a 1-page PDF Buffer.`);
}

main().catch(() => {
  console.error('Document tests failed.');
  process.exitCode = 1;
});
