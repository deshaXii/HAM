import React, { useCallback, useEffect, useState } from "react";
import {
  apiGetNotice,
  apiSetNotice,
  apiListUsers,
  apiSetUserAdmin,
  apiAllTasks,
  apiCreateTask,
  apiDeleteTask,
  apiUpdateTaskTitle,
  apiUpdateTaskItem,
  apiDeleteTaskItem,
  apiUpdateUser, // NEW
  apiDeleteUser, // NEW
} from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import useServerEventRefetch from "../hooks/useServerEventRefetch";
/* ---------------------------------
   PANEL 1: Global Notice
----------------------------------*/
function AdminNoticePanel() {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const refetch = useCallback(async () => {
    try {
      const res = await apiGetNotice();
      setMessage(res.message ?? res.content ?? "");
      setSavedAt(res.updatedAt || null);
    } catch {}
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);
  useServerEventRefetch(["notice:updated"], refetch);

  async function saveNotice() {
    setSaving(true);
    try {
      await apiSetNotice(message);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-slate-800">User Notice</div>
        <div className="text-[10px] text-slate-400">
          Last update: {savedAt ? new Date(savedAt).toLocaleString() : "—"}
        </div>
      </div>

      <textarea
        className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Write a message that appears to all users on the Profile page..."
      />

      <button
        onClick={saveNotice}
        disabled={saving}
        className="self-start bg-emerald-600 text-white text-xs font-semibold rounded-lg px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

/* ---------------------------------
   PANEL 2: User Access / Admin Roles (+ Edit/Delete)
----------------------------------*/
function AdminRolePanel() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // inline edit state per userId
  const [edit, setEdit] = useState({}); // { [id]: {name, email} }

  function normalizeUsersResponse(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.users)) return res.users;
    return [];
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListUsers();
      setUsers(normalizeUsersResponse(res) || []);
      setErr("");
    } catch (e) {
      setErr(e.message || "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  useServerEventRefetch(
    ["user:updated", "user:deleted", "user:role"],
    loadUsers
  );

  const adminCount = users.filter((u) => u.role === "admin").length;

  async function toggleAdmin(u, checked) {
    setBusyId(u.id);
    setErr("");
    try {
      if (!checked && u.role === "admin" && adminCount <= 1) {
        alert("Cannot remove permissions from the last admin in the system.");
        return;
      }
      await apiSetUserAdmin(u.id, checked);
      await loadUsers(); // refresh
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to update role");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(u) {
    setEdit((prev) => ({
      ...prev,
      [u.id]: { name: u.name || "", email: u.email || "" },
    }));
  }
  function cancelEdit(u) {
    setEdit((prev) => {
      const next = { ...prev };
      delete next[u.id];
      return next;
    });
  }
  async function saveEdit(u) {
    const data = edit[u.id];
    if (!data) return;

    // simple validation
    if (!data.name?.trim()) return alert("Name is required");
    if (!/^\S+@\S+\.\S+$/.test(data.email))
      return alert("Invalid email address");

    setBusyId(u.id);
    try {
      await apiUpdateUser(u.id, {
        name: data.name.trim(),
        email: data.email.trim(),
      });
      cancelEdit(u);
      await loadUsers();
    } catch (e) {
      alert(e.message || "Failed to update user");
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(u) {
    if (currentUser?.id === u.id) {
      return alert("You cannot delete yourself.");
    }
    if (u.role === "admin" && adminCount <= 1) {
      return alert("Cannot delete the last admin in the system.");
    }
    if (
      !confirm(`Are you sure you want to delete user "${u.name || u.email}"?`)
    )
      return;

    setBusyId(u.id);
    try {
      await apiDeleteUser(u.id);
      await loadUsers();
    } catch (e) {
      alert(e.message || "Failed to delete user");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-slate-800">User Access</div>

        {loading && (
          <div className="text-[10px] text-slate-400 animate-pulse">
            Loading...
          </div>
        )}

        {err && !loading && (
          <div className="text-[10px] text-red-600 font-medium">{err}</div>
        )}
      </div>

      <div className="overflow-x-auto max-h-[300px] border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="text-[11px] uppercase text-slate-400 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="py-2 px-3 font-semibold">NAME</th>
              <th className="py-2 px-3 font-semibold">EMAIL</th>
              <th className="py-2 px-3 font-semibold text-center w-20">
                ADMIN?
              </th>
              <th className="py-2 px-3 font-semibold text-center w-40">
                ACTIONS
              </th>
            </tr>
          </thead>

          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-4 text-center text-[12px] text-slate-400"
                >
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isEditing = !!edit[u.id];
                const isAdmin = u.role === "admin";
                const isSelf = currentUser && currentUser.id === u.id;

                return (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    {/* NAME */}
                    <td className="py-2 px-3 text-[13px] font-medium text-slate-800 break-all">
                      {isEditing ? (
                        <input
                          className="border border-slate-300 rounded-md text-[12px] p-1 w-full"
                          value={edit[u.id].name}
                          onChange={(e) =>
                            setEdit((prev) => ({
                              ...prev,
                              [u.id]: { ...prev[u.id], name: e.target.value },
                            }))
                          }
                        />
                      ) : (
                        u.name || "—"
                      )}
                    </td>

                    {/* EMAIL */}
                    <td className="py-2 px-3 text-[12px] text-slate-600 break-all">
                      {isEditing ? (
                        <input
                          className="border border-slate-300 rounded-md text-[12px] p-1 w-full"
                          value={edit[u.id].email}
                          onChange={(e) =>
                            setEdit((prev) => ({
                              ...prev,
                              [u.id]: { ...prev[u.id], email: e.target.value },
                            }))
                          }
                        />
                      ) : (
                        u.email
                      )}
                    </td>

                    {/* ADMIN TOGGLE */}
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                        checked={isAdmin}
                        disabled={
                          busyId === u.id || (isSelf && !isAdmin) // Additional frontend protection; backend should also prevent last admin
                        }
                        onChange={(e) => toggleAdmin(u, e.target.checked)}
                      />
                    </td>

                    {/* ACTIONS */}
                    <td className="py-2 px-3 text-center">
                      {!isEditing ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEdit(u)}
                            className="px-2 py-1 rounded-md border border-slate-300 text-[12px] hover:bg-slate-50"
                            disabled={busyId === u.id}
                          >
                            Edit
                          </button>
                          {u.role !== "admin" ? (
                            <button
                              onClick={() => removeUser(u)}
                              className="px-2 py-1 rounded-md border border-red-300 text-[12px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                              disabled={busyId === u.id}
                              title={isSelf ? "You cannot delete yourself" : ""}
                            >
                              Delete
                            </button>
                          ) : (
                            <span
                              className="px-2 py-1 rounded-md border border-slate-200 text-[11px] text-slate-400 cursor-not-allowed"
                              title="Admins cannot be deleted"
                            >
                              Admin
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => saveEdit(u)}
                            className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[12px] hover:bg-emerald-700 disabled:opacity-60"
                            disabled={busyId === u.id}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => cancelEdit(u)}
                            className="px-2 py-1 rounded-md border border-slate-300 text-[12px] hover:bg-slate-50"
                            disabled={busyId === u.id}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-slate-400 leading-relaxed">
        - The first registered account automatically gets Role = Admin.
        <br />
        - You can edit name and email or delete users (with protection: no
        self-deletion, no deletion/removal of last admin permissions).
        <br />- Checking the box grants Admin permissions (modify status, add
        Tasks, change Notice).
      </div>
    </div>
  );
}

/* ---------------------------------
   PANEL 3: Task Management
----------------------------------*/
function AdminTasksPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newUserId, setNewUserId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newItemsText, setNewItemsText] = useState("");
  const [usersForAssign, setUsersForAssign] = useState([]);

  function normalizeUsersResponse(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.users)) return res.users;
    return [];
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes] = await Promise.all([
        apiAllTasks(),
        apiListUsers(),
      ]);
      setUsersForAssign(normalizeUsersResponse(usersRes) || []);
      setTasks(tasksRes.tasks || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, []);

  useServerEventRefetch(
    [
      "task:created",
      "task:updated",
      "task:deleted",
      "task:item-updated",
      "task:item-deleted",
    ],
    loadAll
  );

  async function createTask() {
    if (!newUserId || !newTitle) return;
    const itemsArr = newItemsText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      await apiCreateTask({
        userId: newUserId,
        title: newTitle,
        items: itemsArr,
      });
      setNewUserId("");
      setNewTitle("");
      setNewItemsText("");
      await loadAll();
    } catch (e) {
      alert(e.message || "Failed to create task");
    }
  }

  async function deleteTask(taskId) {
    await apiDeleteTask(taskId);
    await loadAll();
  }
  async function updateTaskTitle(taskId, title) {
    await apiUpdateTaskTitle(taskId, { title });
    await loadAll();
  }
  async function toggleItemDone(itemId, currentDone) {
    await apiUpdateTaskItem(itemId, { done: !currentDone });
    await loadAll();
  }
  async function removeItem(itemId) {
    await apiDeleteTaskItem(itemId);
    await loadAll();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-slate-800">
          Task Management
        </div>
        {loading && (
          <div className="text-[10px] text-slate-400 animate-pulse">
            Loading...
          </div>
        )}
      </div>

      {/* Create task */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-500 font-semibold mb-1">
            Assign To (User)
          </label>
          <select
            className="border border-slate-300 rounded-md text-xs p-1.5"
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
          >
            <option value="">Select...</option>
            {usersForAssign.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email} ({u.role})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-[10px] text-slate-500 font-semibold mb-1">
            Task Title
          </label>
          <input
            className="border border-slate-300 rounded-md text-xs p-1.5"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g., Check trucks before night shift"
          />
        </div>

        <div className="flex flex-col md:col-span-3">
          <label className="text-[10px] text-slate-500 font-semibold mb-1">
            Items (each line = one checklist item)
          </label>
          <textarea
            rows={2}
            className="border border-slate-300 rounded-md text-xs p-1.5"
            value={newItemsText}
            onChange={(e) => setNewItemsText(e.target.value)}
            placeholder={
              "Load cargo from A\nTake receipt photos\nConfirm tire condition"
            }
          />
        </div>

        <div className="md:col-span-3">
          <button
            onClick={createTask}
            className="bg-emerald-600 text-white text-xs font-semibold rounded-lg px-3 py-1.5 hover:bg-emerald-700"
          >
            + Create Task
          </button>
        </div>
      </div>

      {/* Tasks table */}
      <div className="overflow-x-auto max-h-[260px] border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="text-[11px] uppercase text-slate-400 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="py-2 px-3 font-semibold">User</th>
              <th className="py-2 px-3 font-semibold">Task Title</th>
              <th className="py-2 px-3 font-semibold">Items</th>
              <th className="py-2 px-3 font-semibold w-16 text-center">
                Delete
              </th>
            </tr>
          </thead>

          <tbody>
            {tasks.map((t) => (
              <tr
                key={t.id}
                className="border-b border-slate-100 align-top last:border-b-0"
              >
                <td className="py-2 px-3 text-[12px] text-slate-600 min-w-[140px]">
                  <div className="font-medium text-slate-800 text-[13px]">
                    {t.user?.name || "—"}
                  </div>
                  <div className="text-[11px] text-slate-400 break-all">
                    {t.user?.email}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {t.user?.role}
                  </div>
                </td>

                <td className="py-2 px-3 min-w-[200px]">
                  <EditableTitle
                    initialValue={t.title}
                    onSave={(val) => updateTaskTitle(t.id, val)}
                  />
                  <div className="text-[10px] text-slate-400">
                    {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}
                  </div>
                </td>

                <td className="py-2 px-3">
                  <div className="flex flex-col gap-1">
                    {t.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-start gap-2 text-[12px]"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-emerald-600 mt-0.5"
                          checked={it.done}
                          onChange={() => toggleItemDone(it.id, it.done)}
                        />
                        <div
                          className={`flex-1 ${
                            it.done
                              ? "line-through text-slate-400"
                              : "text-slate-700"
                          }`}
                        >
                          {it.text}
                        </div>
                        <button
                          onClick={() => removeItem(it.id)}
                          className="text-[10px] text-red-500 hover:text-red-700"
                          title="Remove item"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {t.items.length === 0 && (
                      <div className="text-[11px] text-slate-400 italic">
                        (no items)
                      </div>
                    )}
                  </div>
                </td>

                <td className="py-2 px-3 text-center align-top">
                  <button
                    onClick={() => deleteTask(t.id)}
                    className="text-[11px] text-red-600 hover:text-red-800 font-semibold"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={4}
                  className="py-4 px-3 text-center text-[12px] text-slate-400"
                >
                  No tasks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------
   inline editable task title
----------------------------------*/
function EditableTitle({ initialValue, onSave }) {
  const [val, setVal] = useState(initialValue);
  const [editing, setEditing] = useState(false);

  function handleBlur() {
    setEditing(false);
    if (val !== initialValue) onSave(val);
  }

  if (!editing) {
    return (
      <div
        className="text-[13px] font-semibold text-slate-800 cursor-pointer"
        onClick={() => setEditing(true)}
        title="Click to edit title"
      >
        {val || "Untitled Task"}
      </div>
    );
  }

  return (
    <input
      className="border border-slate-300 rounded-md text-[12px] p-1 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      autoFocus
    />
  );
}

/* ---------------------------------
   MAIN EXPORT
----------------------------------*/
export default function AdminExtras() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-1 gap-6">
      <AdminNoticePanel />
      <AdminRolePanel />
      <AdminTasksPanel />
    </div>
  );
}
