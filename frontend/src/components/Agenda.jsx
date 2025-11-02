import React, { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

// ===== Helpers =====

// yyyy-mm-dd
function ymd(dateObj) {
  return dateObj.toISOString().split("T")[0];
}

// بداية أسبوع (نعتبر الاثنين هو أول يوم)
function startOfWeek(d) {
  const date = new Date(d);
  const weekday = date.getDay(); // 0 = Sun
  const diff = weekday === 0 ? -6 : 1 - weekday; // علشان الاثنين يبقى البداية
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// array of 7 days for current week
function getWeekDays(d) {
  const start = startOfWeek(d);
  return [...Array(7)].map((_, i) => {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    return dt;
  });
}

// month grid (6 أسابيع = 42 خانة) يبدأ من أول أسبوع يلمس الشهر
function getMonthGrid(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const firstWeekStart = startOfWeek(first);
  return [...Array(42)].map((_, i) => {
    const dt = new Date(firstWeekStart);
    dt.setDate(firstWeekStart.getDate() + i);
    return dt;
  });
}

// ===== Small visual helpers =====

function eventColorClasses(etype) {
  const isEmergency = etype === "emergency";
  return isEmergency
    ? "bg-red-100 border-red-300 text-red-700"
    : "bg-blue-100 border-blue-300 text-blue-700";
}

function EventPill({ ev, onClick }) {
  return (
    <button
      className={`text-xs border rounded-md px-2 py-1 leading-snug w-full text-left ${eventColorClasses(
        ev.type
      )} hover:opacity-80 transition-opacity`}
      onClick={(e) => {
        e.stopPropagation(); // مهم عشان ما يغيرش اليوم لو كليك داخل cell
        onClick && onClick(ev);
      }}
    >
      <div className="font-semibold truncate">
        {ev.start}-{ev.end} {ev.title}
      </div>
    </button>
  );
}

// ===== Add New Event Modal =====
// مودال إضافة (create)
function NewEventModal({ onClose, onSave, defaultDay }) {
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(defaultDay || ymd(new Date()));
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [etype, setEtype] = useState("normal"); // normal | emergency
  const [details, setDetails] = useState("");

  const handleSave = () => {
    if (!title) return;
    onSave({
      id: crypto.randomUUID(),
      title,
      day,
      start: startTime,
      end: endTime,
      type: etype,
      details,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-gray-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="text-base font-semibold text-gray-900">
            New Agenda Item
          </div>
          <button
            className="text-gray-500 text-sm border border-gray-300 rounded-lg px-3 py-1 hover:bg-gray-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="p-4 text-sm space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              className="input-field w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Emergency Delivery / Meeting with client..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Day
              </label>
              <input
                type="date"
                className="input-field w-full"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                className="input-field w-full"
                value={etype}
                onChange={(e) => setEtype(e.target.value)}
              >
                <option value="normal">Normal (Blue)</option>
                <option value="emergency">Emergency (Red)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start
              </label>
              <input
                type="time"
                className="input-field w-full"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End
              </label>
              <input
                type="time"
                className="input-field w-full"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Details / Notes
            </label>
            <textarea
              className="input-field w-full min-h-[80px]"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Full instructions, addresses, contacts, etc..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== View / Edit Existing Event Modal =====
// لو أدمن: يقدر يعدل و يحذف
// لو مش أدمن: يقرأ فقط
function EditEventModal({ ev, isAdmin, onClose, onUpdate, onDelete }) {
  const [title, setTitle] = useState(ev.title || "");
  const [day, setDay] = useState(ev.day || ymd(new Date()));
  const [startTime, setStartTime] = useState(ev.start || "08:00");
  const [endTime, setEndTime] = useState(ev.end || "10:00");
  const [etype, setEtype] = useState(ev.type || "normal");
  const [details, setDetails] = useState(ev.details || "");

  const handleSave = () => {
    if (!isAdmin) return;
    onUpdate({
      ...ev,
      title,
      day,
      start: startTime,
      end: endTime,
      type: etype,
      details,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!isAdmin) return;
    if (confirm("Delete this event?")) {
      onDelete(ev.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-gray-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-start justify-between">
          <div className="flex flex-col">
            <div className="text-base font-semibold text-gray-900">
              {isAdmin ? "Edit Agenda Item" : "Agenda Item"}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(day + "T00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                className="flex items-center gap-1 text-red-600 text-xs border border-red-300 rounded-lg px-2 py-1 hover:bg-red-50"
                onClick={handleDelete}
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            )}
            <button
              className="text-gray-500 text-sm border border-gray-300 rounded-lg px-3 py-1 hover:bg-gray-100"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 text-sm space-y-4 overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              className={`input-field w-full ${
                !isAdmin ? "bg-gray-100 cursor-not-allowed" : ""
              }`}
              disabled={!isAdmin}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Day + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Day
              </label>
              <input
                type="date"
                className={`input-field w-full ${
                  !isAdmin ? "bg-gray-100 cursor-not-allowed" : ""
                }`}
                disabled={!isAdmin}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                className={`input-field w-full ${
                  !isAdmin ? "bg-gray-100 cursor-not-allowed" : ""
                }`}
                disabled={!isAdmin}
                value={etype}
                onChange={(e) => setEtype(e.target.value)}
              >
                <option value="normal">Normal (Blue)</option>
                <option value="emergency">Emergency (Red)</option>
              </select>
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start
              </label>
              <input
                type="time"
                className={`input-field w-full ${
                  !isAdmin ? "bg-gray-100 cursor-not-allowed" : ""
                }`}
                disabled={!isAdmin}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End
              </label>
              <input
                type="time"
                className={`input-field w-full ${
                  !isAdmin ? "bg-gray-100 cursor-not-allowed" : ""
                }`}
                disabled={!isAdmin}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Details */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Details / Notes
            </label>
            <textarea
              className={`input-field w-full min-h-[100px] leading-relaxed ${
                !isAdmin ? "bg-gray-100 cursor-not-allowed" : ""
              }`}
              disabled={!isAdmin}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Full content, long notes, addresses, instructions, etc..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          {isAdmin && (
            <button
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              onClick={handleSave}
            >
              Save changes
            </button>
          )}

          <button
            className="text-gray-600 text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Month View =====
function MonthView({ currentDate, eventsByDay, onSelectDay, onSelectEvent }) {
  const days = getMonthGrid(currentDate);
  const month = currentDate.getMonth();

  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-300 rounded-lg overflow-hidden text-xs">
      {days.map((d, i) => {
        const key = ymd(d);
        const isDim = d.getMonth() !== month;
        const dayEvents = eventsByDay[key] || [];
        return (
          <div
            key={i}
            className={`bg-white p-2 min-h-[120px] cursor-pointer ${
              isDim ? "bg-gray-50 text-gray-400" : ""
            }`}
            onClick={() => onSelectDay(d)}
          >
            <div className="text-[11px] font-semibold mb-1 flex items-center justify-between">
              <span>
                {d.toLocaleDateString("en-US", {
                  day: "numeric",
                })}
              </span>
            </div>

            <div className="space-y-1">
              {dayEvents.slice(0, 3).map((ev) => (
                <EventPill
                  key={ev.id}
                  ev={ev}
                  onClick={(eventObj) => onSelectEvent(eventObj)}
                />
              ))}
              {dayEvents.length > 3 && (
                <div className="text-[10px] text-gray-500">
                  +{dayEvents.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== Week View =====
function WeekView({ currentDate, eventsByDay, onSelectDay, onSelectEvent }) {
  const weekDays = getWeekDays(currentDate);

  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${weekDays.length}, minmax(0,1fr))`,
      }}
    >
      {weekDays.map((d) => {
        const key = ymd(d);
        const dayEvents = eventsByDay[key] || [];
        return (
          <div
            key={key}
            className="bg-white border border-gray-300 rounded-lg p-3 cursor-pointer"
            onClick={() => onSelectDay(d)}
          >
            <div className="text-xs text-gray-500 leading-tight">
              {d.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </div>

            <div className="mt-2 space-y-2">
              {dayEvents.map((ev) => (
                <EventPill
                  key={ev.id}
                  ev={ev}
                  onClick={(eventObj) => onSelectEvent(eventObj)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===== Day View =====
function DayView({ currentDate, dayEvents, onSelectEvent }) {
  // sort by start
  const sorted = [...dayEvents].sort((a, b) => a.start.localeCompare(b.start));

  // خطوط الساعات (دي بس شكل بصري زي screenshot)
  const hours = [
    "08:00",
    "09:00",
    "10:00",
    "12:00",
    "13:00",
    "15:00",
    "16:00",
    "18:00",
  ];

  return (
    <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="text-lg font-semibold text-gray-900">
          {currentDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </div>

      <div className="p-4 text-sm relative">
        {/* خطوط التايملاين */}
        <div className="space-y-6 relative">
          {hours.map((h, i) => (
            <div key={i} className="relative pl-16">
              <div className="absolute left-0 top-1 text-[11px] text-gray-400 w-14 text-right pr-2">
                {h}
              </div>
              <div className="border-t border-gray-200 h-0" />
            </div>
          ))}
        </div>

        {/* اللييرات اللي فوق الخطوط */}
        <div className="absolute inset-0 pointer-events-none">
          {sorted.map((ev, idx) => (
            <div
              key={ev.id}
              className="absolute left-[5rem] right-4"
              style={{
                top: `${idx * 60 + 10}px`, // توزيع بسيط عمودي
              }}
            >
              <div className="pointer-events-auto">
                <EventPill
                  ev={ev}
                  onClick={(eventObj) => onSelectEvent(eventObj)}
                />
              </div>
            </div>
          ))}
        </div>

        {sorted.length === 0 && (
          <div className="text-center text-gray-400 text-xs mt-8">
            No events for this day.
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Main Agenda Component =====
export default function Agenda() {
  // معرفة صلاحيات الأدمن
  const { user } = useAuth() || { user: null };
  const isAdmin = user?.role === "ADMIN";

  // الحالة (ممكن بعدين نحفظها في الـ backend كجزء من FleetState أو موديل AgendaEvent)
  const [events, setEvents] = useState([
    {
      id: "1",
      title: "FaceTime with grandma",
      day: ymd(new Date()),
      start: "08:30",
      end: "09:30",
      type: "normal",
      details: "Quick catch-up.",
    },
    {
      id: "2",
      title: "Emergency delivery - TRK-203",
      day: ymd(new Date()),
      start: "10:00",
      end: "11:00",
      type: "emergency",
      details:
        "High priority load to DHL Hub. Must be delivered before noon. Driver: Marius.",
    },
  ]);

  const [viewMode, setViewMode] = useState("month"); // "day" | "week" | "month"
  const [currentDate, setCurrentDate] = useState(new Date());

  const [showNewModal, setShowNewModal] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null); // ev object for edit/view modal

  // build index by day
  const eventsByDay = events.reduce((acc, ev) => {
    acc[ev.day] = acc[ev.day] || [];
    acc[ev.day].push(ev);
    return acc;
  }, {});

  const currentDayKey = ymd(currentDate);
  const todayEvents = eventsByDay[currentDayKey] || [];

  // التنقل بين الأيام / الأسابيع / الشهور
  const goPrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "day") {
      d.setDate(d.getDate() - 1);
    } else if (viewMode === "week") {
      d.setDate(d.getDate() - 7);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    setCurrentDate(d);
  };

  const goNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "day") {
      d.setDate(d.getDate() + 1);
    } else if (viewMode === "week") {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    setCurrentDate(d);
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  // لما المستخدم يختار يوم من month/week
  const onSelectDay = (d) => {
    setCurrentDate(d);
    setViewMode("day");
  };

  // إضافة إيفنت جديد
  const addNewEvent = (ev) => {
    setEvents((prev) => [...prev, ev]);
  };

  // لما يدوس على EventPill -> افتح مودال العرض/التعديل
  const onSelectEvent = (ev) => {
    setActiveEvent(ev);
  };

  // حفظ تعديل من المودال
  const updateEvent = (updatedEv) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === updatedEv.id ? updatedEv : e))
    );
  };

  // مسح إيفنت من المودال
  const deleteEvent = (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        {/* Left side: date nav + info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 border border-gray-200"
              onClick={goPrev}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 border border-gray-200"
              onClick={goNext}
            >
              <ChevronRight size={16} />
            </button>

            <div className="text-left">
              <div className="text-lg font-semibold text-gray-900 leading-tight">
                {currentDate.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <div className="text-xs text-gray-500">
                {currentDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>

            <button
              className="text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg"
              onClick={goToday}
            >
              Today
            </button>
          </div>
        </div>

        {/* Right side: View switch + New */}
        <div className="flex items-center gap-2">
          {["day", "week", "month"].map((mode) => (
            <button
              key={mode}
              className={`text-xs font-medium px-3 py-1 rounded-lg border transition-colors ${
                viewMode === mode
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => setViewMode(mode)}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}

          <button
            className="flex items-center gap-1 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            onClick={() => setShowNewModal(true)}
            disabled={!isAdmin}
            title={isAdmin ? "Add new agenda item" : "Admin only"}
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Body view */}
      <div className="text-sm">
        {viewMode === "month" && (
          <MonthView
            currentDate={currentDate}
            eventsByDay={eventsByDay}
            onSelectDay={onSelectDay}
            onSelectEvent={onSelectEvent}
          />
        )}

        {viewMode === "week" && (
          <WeekView
            currentDate={currentDate}
            eventsByDay={eventsByDay}
            onSelectDay={onSelectDay}
            onSelectEvent={onSelectEvent}
          />
        )}

        {viewMode === "day" && (
          <DayView
            currentDate={currentDate}
            dayEvents={todayEvents}
            onSelectEvent={onSelectEvent}
          />
        )}
      </div>

      {/* Modal: إنشاء عنصر جديد */}
      {showNewModal && (
        <NewEventModal
          onClose={() => setShowNewModal(false)}
          onSave={addNewEvent}
          defaultDay={ymd(currentDate)}
        />
      )}

      {/* Modal: عرض/تعديل/حذف عنصر موجود */}
      {activeEvent && (
        <EditEventModal
          ev={activeEvent}
          isAdmin={isAdmin}
          onClose={() => setActiveEvent(null)}
          onUpdate={updateEvent}
          onDelete={deleteEvent}
        />
      )}
    </div>
  );
}
