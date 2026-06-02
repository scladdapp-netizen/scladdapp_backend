const express = require("express");
const router = express.Router();
const { getBooksBySubject, createBook, updateBook, deleteBook } = require("../controllers/subject_book.controller");

router.get("/subject/:subjectId", (req, res) => getBooksBySubject(req, res));
router.post("/", (req, res) => createBook(req, res));
router.put("/:bookId", (req, res) => updateBook(req, res));
router.delete("/:bookId", (req, res) => deleteBook(req, res));

module.exports = router;
