const fs = require('node:fs/promises');
const { PDFParse } = require('pdf-parse');

function normalizePdfText(value) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, '\n\n')
    .trim();
}

async function extractPdfText(input) {
  let buffer;

  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (typeof input === 'string' && input.trim()) {
    try {
      buffer = await fs.readFile(input);
    } catch {
      throw new Error('Unable to read the PDF file.');
    }
  } else {
    throw new Error('PDF input must be a non-empty file path or Buffer.');
  }

  if (buffer.length === 0) {
    throw new Error('PDF input is empty.');
  }
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
    throw new Error('Input does not appear to be a PDF file.');
  }

  const parser = new PDFParse({ data: buffer });
  let result;
  try {
    result = await parser.getText();
  } catch {
    throw new Error('Unable to extract text from the PDF. The file may be damaged or protected.');
  } finally {
    await parser.destroy();
  }

  const text = normalizePdfText(result.text || '');
  if (!/[\p{L}\p{N}]/u.test(text)) {
    throw new Error('PDF contains no meaningful extractable text.');
  }

  return {
    text,
    pageCount: Number.isInteger(result.total) ? result.total : (result.pages?.length || 0),
    characterCount: text.length,
  };
}

module.exports = { extractPdfText, normalizePdfText };
