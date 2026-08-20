const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary
 * @param {Buffer} buffer - file buffer from multer memoryStorage
 * @param {string} folder - cloudinary folder name
 * @param {string} resourceType - "image" | "raw" | "auto" (default: "image")
 * @param {string} [originalName] - original filename (used to preserve extension in public_id)
 * @returns {Promise<{url: string, public_id: string}>}
 */
const uploadToCloudinary = (buffer, folder = "scladapp", resourceType = "image", originalName = null) => {
  return new Promise((resolve, reject) => {
    const options = { folder, resource_type: resourceType, access_mode: "public" };
    if (originalName) {
      // Preserve original filename (with extension) as the public_id
      options.use_filename      = true;
      options.unique_filename   = true;
      options.filename_override = originalName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
    }
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
};

module.exports = { uploadToCloudinary };
