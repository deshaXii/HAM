const express = require("express");
const {
  listUsers,
  updateUser,
  setAdmin,
  deleteUser,
} = require("../controllers/usersController");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");

const router = express.Router();

router.get("/", auth, admin, listUsers);
router.patch("/:id", auth, admin, updateUser);
router.patch("/:id/admin", auth, admin, setAdmin);
router.delete("/:id", auth, admin, deleteUser);

module.exports = router;
