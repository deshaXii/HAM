import React, { useEffect, useState } from "react";
import { apiMyTasks, apiUpdateTaskItem, apiGetNotice } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

export default function Profile() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]); // [{id, title, items: [...]}, ...]
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // drafts[itemId] = { done, comment }
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [myTasksRes, noticeRes] = await Promise.all([
          apiMyTasks(), // بيرجع { tasks: [...] }
          apiGetNotice(),
        ]);

        const myTasks = Array.isArray(myTasksRes?.tasks)
          ? myTasksRes.tasks
          : [];

        setTasks(myTasks);
        setNotice(noticeRes?.content || "");

        // حضّر الـ drafts من الداتا
        const initDrafts = {};
        myTasks.forEach((task) => {
          (task.items || []).forEach((it) => {
            initDrafts[it.id] = {
              done: !!it.done,
              comment: it.comment || "",
            };
          });
        });
        setDrafts(initDrafts);
      } catch (e) {
        setErr(e.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleDoneLocal = (itemId) => {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        done: !prev[itemId]?.done,
      },
    }));
  };

  const updateCommentLocal = (itemId, val) => {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        comment: val,
      },
    }));
  };

  const saveItem = async (taskId, itemId) => {
    const draft = drafts[itemId];
    if (!draft) return;

    const updatedFromServer = await apiUpdateTaskItem(itemId, {
      done: draft.done,
      comment: draft.comment,
    });

    setTasks((prevTasks) =>
      prevTasks.map((task) => {
        if (task.id !== taskId) return task;
        return {
          ...task,
          items: (task.items || []).map((it) =>
            it.id === itemId ? { ...it, ...updatedFromServer } : it
          ),
        };
      })
    );
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  if (err) {
    return <div className="p-6 text-sm text-red-600 font-medium">{err}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* account info */}
      <section className="bg-white shadow rounded-xl border border-gray-200 p-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-4">My Profile</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-800">
          <div>
            <span className="font-medium text-gray-600">Name: </span>
            {user?.name}
          </div>
          <div>
            <span className="font-medium text-gray-600">Email: </span>
            {user?.email}
          </div>
          <div>
            <span className="font-medium text-gray-600">Role: </span>
            {user?.role}
          </div>
        </div>
      </section>

      {/* admin notice */}
      {notice?.trim() && (
        <section className="bg-white shadow rounded-xl border border-yellow-200 p-6 bg-yellow-50/50">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Admin Notice
          </h2>
          <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
            {notice}
          </div>
        </section>
      )}

      {/* tasks for non-admin */}
      {user?.role !== "admin" && (
        <section className="bg-white shadow rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Required Tasks
          </h2>

          {tasks.length === 0 ? (
            <div className="text-sm text-gray-500">
              No tasks assigned to you.
            </div>
          ) : (
            <div className="space-y-6">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-gray-50 border border-gray-300 rounded-lg p-4"
                >
                  <div className="font-medium text-gray-900 text-base mb-4">
                    {task.title}
                  </div>

                  <div className="space-y-4 text-sm">
                    {(task.items || []).map((item) => {
                      const d = drafts[item.id] || {
                        done: !!item.done,
                        comment: item.comment || "",
                      };

                      return (
                        <div
                          key={item.id}
                          className="bg-white border border-gray-200 rounded-lg p-4"
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                              checked={d.done}
                              onChange={() => toggleDoneLocal(item.id)}
                            />

                            <div className="flex-1">
                              <div
                                className={`text-sm font-medium ${
                                  d.done
                                    ? "text-gray-400 line-through"
                                    : "text-gray-800"
                                }`}
                              >
                                {item.text}
                              </div>

                              <div className="mt-3">
                                <textarea
                                  className="input-field w-full min-h-[120px] text-sm leading-relaxed"
                                  placeholder="اكتب ملاحظتك..."
                                  value={d.comment}
                                  onChange={(e) =>
                                    updateCommentLocal(item.id, e.target.value)
                                  }
                                />
                              </div>

                              <div className="mt-3 flex justify-end">
                                <button
                                  onClick={() => saveItem(task.id, item.id)}
                                  className="bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                  Save Update
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
