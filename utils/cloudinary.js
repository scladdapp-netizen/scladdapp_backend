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
 * @returns {Promise<{url: string, public_id: string}>}
 */
const uploadToCloudinary = (buffer, folder = "scladapp", resourceType = "image") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, access_mode: "public" },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
};

module.exports = { uploadToCloudinary };
