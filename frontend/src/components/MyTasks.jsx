// src/components/MyTasks.jsx
import React, { useEffect, useRef, useState } from "react";
import { apiMyTasks, apiUpdateTaskItem } from "../lib/api";

export default function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  async function load() {
    try {
      const { tasks } = await apiMyTasks();
      setTasks(tasks || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    // Polling كل 20 ثانية
    pollRef.current = setInterval(load, 20000);

    // تحديث عند رجوع التركيز
    const onFocus = () => load();
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(pollRef.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // optimistic toggle + comment save
  async function saveItemChange(taskId, itemId, data) {
    // 1) optimistic
    const prev = tasks;
    setTasks((tasks) =>
      tasks.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          items: t.items.map((it) =>
            it.id === itemId ? { ...it, ...data } : it
          ),
        };
      })
    );

    try {
      await apiUpdateTaskItem(itemId, data); // الباك-إند متعدل للتفويض
    } catch (e) {
      alert(e.message || "Failed to update");
      // 2) rollback
      setTasks(prev);
    }
  }

  if (loading)
    return <div className="text-sm text-slate-500">Loading tasks...</div>;

  return (
    <div className="space-y-4">
      {tasks.length === 0 ? (
        <div className="text-sm text-slate-400">No tasks yet.</div>
      ) : (
        tasks.map((t) => (
          <div key={t.id} className="border rounded-lg p-3 bg-white">
            <div className="font-semibold text-slate-800 text-sm">
              {t.title}
            </div>
            <div className="mt-2 space-y-2">
              {t.items.map((it) => (
                <div key={it.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-emerald-600"
                    checked={!!it.done}
                    onChange={() =>
                      saveItemChange(t.id, it.id, { done: !it.done })
                    }
                  />
                  <div
                    className={`flex-1 ${
                      it.done ? "line-through text-slate-400" : "text-slate-700"
                    }`}
                  >
                    {it.text}
                  </div>
                  <input
                    className="border rounded-md text-xs px-2 py-1"
                    placeholder="note..."
                    defaultValue={it.comment || ""}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== (it.comment || "")) {
                        saveItemChange(t.id, it.id, { comment: v });
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
