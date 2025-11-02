const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getTasks,
  createTaskForUser,
  createTask,
  updateTask,
  deleteTask,
  updateTaskItem,
  deleteTaskItem,
} = require("../controllers/tasksController");

const router = express.Router();

// الكل يقدر يشوفها (أو خليه admin لو حابب)
router.get("/all", auth, getTasks);

// الاتنين دول علشان الفرونت ساعات يبعت كده وساعات كده
router.post("/:userId", auth, admin, createTaskForUser);
router.post("/", auth, admin, createTask);

router.patch("/:taskId", auth, admin, updateTask);
router.delete("/:taskId", auth, admin, deleteTask);

router.patch("/item/:itemId", auth, admin, updateTaskItem);
router.delete("/item/:itemId", auth, admin, deleteTaskItem);

module.exports = router;
