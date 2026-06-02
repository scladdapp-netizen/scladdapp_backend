const SubjectBook = require("../models/SubjectBook.model");

const getBooksBySubject = async (req, res) => {
  try {
    const books = await SubjectBook.find({ subject_id: req.params.subjectId }).sort({ created_at: -1 }).lean();
    return res.json({ success: true, data: books });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createBook = async (req, res) => {
  try {
    const { subject_id, school_id, title, author, isbn, publisher, edition, publication_year,
            type, level, price, language, description, class_id, class_name, entered_by_id, entered_by_name } = req.body;

    if (!subject_id || !school_id || !title) {
      return res.status(400).json({ success: false, message: "subject_id, school_id and title are required" });
    }

    const book = await SubjectBook.create({
      book_id:          Date.now().toString(),
      subject_id,
      school_id,
      title,
      author:           author || null,
      isbn:             isbn || null,
      publisher:        publisher || null,
      edition:          edition || null,
      publication_year: publication_year || null,
      type:             type || "Textbook",
      level:            level || null,
      price:            price || null,
      language:         language || "English",
      description:      description || null,
      class_id:         class_id || null,
      class_name:       class_name || null,
      cover_image:      null,
      is_active:        true,
      entered_by_id:    entered_by_id || null,
      entered_by_name:  entered_by_name || null,
    });

    return res.status(201).json({ success: true, data: book, message: "Book added successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateBook = async (req, res) => {
  try {
    const book = await SubjectBook.findOne({ book_id: req.params.bookId });
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });

    const allowed = ["title","author","isbn","publisher","edition","publication_year","type","level","price","language","description","class_id","class_name","is_active"];
    allowed.forEach((key) => { if (req.body[key] !== undefined) book[key] = req.body[key]; });
    book.updated_at = new Date();
    await book.save();

    return res.json({ success: true, data: book, message: "Book updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const deleteBook = async (req, res) => {
  try {
    const book = await SubjectBook.findOneAndDelete({ book_id: req.params.bookId });
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    return res.json({ success: true, message: "Book deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getBooksBySubject, createBook, updateBook, deleteBook };
