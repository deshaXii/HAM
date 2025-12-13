// backend/src/routes/agenda.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getAgenda,
  createAgendaItem,
  updateAgendaItem,
  deleteAgendaItem,
} = require("../controllers/agendaController");

const router = express.Router();

router.get("/", auth, getAgenda);
router.post("/", auth, admin, createAgendaItem);
router.patch("/:id", auth, admin, updateAgendaItem);
router.delete("/:id", auth, admin, deleteAgendaItem);

module.exports = router;
