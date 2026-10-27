import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype !== "application/pdf") {
    const error = new Error("Only PDF files are allowed");
    error.statusCode = 400;
    return cb(error);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

export default upload;
