/**
 * File upload utility.
 *
 * Currently uses a FAKE local upload — saves the file to disk under
 * backend/uploads/ and returns a local URL.
 *
 * To switch to Cloudinary in the future:
 *  1. npm install cloudinary multer-storage-cloudinary
 *  2. Replace the `uploadFile` function body with Cloudinary upload logic.
 *  3. The rest of the codebase (controller) stays the same — it only calls
 *     `uploadFile(file)` and uses the returned `{ url, public_id }`.
 */

const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Fake upload — copies the temp multer file into backend/uploads/
 * and returns a local URL.
 *
 * @param {object} file  - multer file object (req.file)
 * @returns {{ url: string, public_id: string }}
 */
const uploadFile = (file) => {
  const uniqueName = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
  const destPath = path.join(UPLOAD_DIR, uniqueName);

  fs.copyFileSync(file.path, destPath);

  // Clean up multer temp file
  fs.unlinkSync(file.path);

  return {
    url: `/uploads/${uniqueName}`,          // served as static by express
    public_id: uniqueName,                  // used for deletion later
  };
};

/**
 * Delete a previously uploaded file.
 * For Cloudinary: call cloudinary.uploader.destroy(public_id)
 *
 * @param {string} public_id
 */
const deleteFile = (public_id) => {
  const filePath = path.join(UPLOAD_DIR, public_id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

module.exports = { uploadFile, deleteFile };
