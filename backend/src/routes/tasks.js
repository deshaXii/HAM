// routes/tasks.js
const express = require("express");
const { auth } = require("../middleware/auth");
const { admin } = require("../middleware/admin");
const {
  getTasks,
  createTaskForUser,
  createTask,
  updateTask,
  deleteTask,
  getMyTasks,
  updateTaskItem,
  deleteTaskItem,
} = require("../controllers/tasksController");

const router = express.Router();

/**
 * ملاحظة مهمة:
 * لو الملف متسجل على البادئة /tasks في app.use('/tasks', router)
 * فالمسارات هنا تكون بالنسبة لـ /tasks.
 */

// قائمة كل الـ tasks (للوحة الأدمن) — أدمن فقط
router.get("/all", auth, admin, getTasks);

// مهامي الشخصية — أي يوزر مسجّل
router.get("/me", auth, getMyTasks);

// إنشاء تسك (الأدمن يوزّع على يوزر معيّن)
router.post("/:userId", auth, admin, createTaskForUser);
router.post("/", auth, admin, createTask);

// تعديل/حذف التسك نفسها (العنوان/الإسناد) — أدمن فقط
router.patch("/:taskId", auth, admin, updateTask);
router.delete("/:taskId", auth, admin, deleteTask);

// ✅ تعديل/حذف عناصر التسكات (items) — يكفي auth
// التفويض الدقيق (Owner أو Admin) بيحصل داخل الكنترولر عبر canEditItem
router.patch("/item/:itemId", auth, updateTaskItem);
router.delete("/item/:itemId", auth, deleteTaskItem);

module.exports = router;
