import supabase from "../config/supabase.js";

const BUCKET_NAME = "contractai-documents";

export const uploadPdf = async (buffer, filePath) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("PDF upload requires a Buffer.");
  }
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("PDF upload requires a destination path.");
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, buffer, {
      upsert: false,
      contentType: "application/pdf",
    });

  if (error) {
    throw new Error("Failed to upload PDF to Supabase Storage.");
  }

  return data.path;
};

export const deletePdf = async (filePath) => {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("PDF deletion requires a file path.");
  }

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath]);

  if (error) {
    throw new Error("Failed to delete PDF from Supabase Storage.");
  }
};
