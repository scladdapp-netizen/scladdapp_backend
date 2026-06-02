const mongoose = require("mongoose");

const subjectBookSchema = new mongoose.Schema(
  {
    book_id: { type: String, required: true, unique: true },
    subject_id: { type: String, required: true },
    school_id: { type: String, required: true },
    title: { type: String, required: true },
    author: { type: String, default: null },
    isbn: { type: String, default: null },
    publisher: { type: String, default: null },
    edition: { type: String, default: null },
    publication_year: { type: String, default: null },
    type: { type: String, default: null },
    level: { type: String, default: null },
    price: { type: String, default: null },
    language: { type: String, default: "English" },
    description: { type: String, default: null },
    class_id: { type: String, default: null },
    class_name: { type: String, default: null },
    cover_image: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    entered_by_id: { type: String, default: null },
    entered_by_name: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("SubjectBook", subjectBookSchema);
