import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Download,
  FileDown,
  Printer,
  Search,
  BarChart2,
  Users,
  Truck,
  MapPin,
  Clock4,
} from "lucide-react";
import * as XLSX from "xlsx";
import { apiGetState } from "../lib/api";
import useServerEventRefetch from "../hooks/useServerEventRefetch";

/* ---------- Helpers ---------- */
function monthKey(isoDate) {
  return String(isoDate || "").slice(0, 7);
}
function distinct(arr) {
  return [...new Set(arr)].filter(Boolean);
}
function niceMonthLabel(ym) {
  if (!ym) return "—";
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m || 1) - 1, 1);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}
function safeArr(a) {
  return Array.isArray(a) ? a : [];
}
function slotLabel(job) {
  const s = job?.slot;
  if (typeof s === "string" && s.trim()) return s.toUpperCase();
  if (typeof s === "number" && Number.isFinite(s)) {
    // Keep it simple: 0=DAY, 1=NIGHT, else show SLOT n
    if (s === 0) return "DAY";
    if (s === 1) return "NIGHT";
    return `SLOT ${s}`;
  }
  return "DAY";
}
function fmtTimeRange(job) {
  const s = job.start || (slotLabel(job) === "NIGHT" ? "20:00" : "08:00");
  const dur = Number(job.durationHours || 0);
  if (!dur) return s;
  const [hh, mm] = s.split(":").map((n) => parseInt(n || "0", 10));
  const start = new Date(2000, 0, 1, hh, mm || 0, 0, 0);
  const end = new Date(start.getTime() + dur * 3600 * 1000);
  const eH = String(end.getHours()).padStart(2, "0");
  const eM = String(end.getMinutes()).padStart(2, "0");
  return `${s} → ${eH}:${eM}`;
}

/* ---------- Small UI ---------- */
function SummaryCard({ icon, label, value }) {
  return (
    <div className="card p-4 flex items-center justify-between bg-white border border-gray-200 rounded-xl shadow-sm">
      <div>
        <p className="text-xs font-medium text-gray-600">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
      <div className="p-2 bg-gray-100 rounded-lg">{icon}</div>
    </div>
  );
}

function Modal({ open, onClose, title, children, widthClass = "max-w-3xl" }) {
  const ref = useRef(null);
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={ref}
          className={`w-full ${widthClass} bg-white rounded-xl shadow-lg border`}
        >
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <button
              onClick={onClose}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Close
            </button>
          </div>
          <div className="p-4 max-h-[70vh] overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

function JobList({ jobs, tractors, drivers, trailers }) {
  if (!jobs?.length)
    return <div className="text-sm text-gray-500">No events.</div>;

  return (
    <div className="space-y-2">
      {jobs.map((j) => {
        const tractor = tractors.find(
          (t) => String(t.id) === String(j.tractorId)
        );
        const driverLabels = safeArr(j.driverIds).map((id) => {
          const d = drivers.find((x) => String(x.id) === String(id));
          return d?.name || d?.code || String(id);
        });
        const trailer = trailers.find(
          (t) => String(t.id) === String(j.trailerId)
        );

        const from = j.pickup || j.startPoint || "—";
        const to = j.dropoff || j.endPoint || "—";

        return (
          <div
            key={j.id}
            className="border rounded-lg p-3 bg-white hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm text-gray-900">
                {j.client || "(No client)"} • {j.date}
              </div>
              <div className="text-xs text-gray-500">{fmtTimeRange(j)}</div>
            </div>

            <div className="mt-1 text-xs text-gray-600 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1">
                <Clock4 size={14} />
                {slotLabel(j)}
              </span>

              {tractor && (
                <span className="inline-flex items-center gap-1">
                  🚚 {tractor.code || tractor.plate || tractor.id}
                </span>
              )}
              {trailer && <span>🛞 {trailer.code || trailer.id}</span>}
              {driverLabels.length > 0 && (
                <span>👤 {driverLabels.join(", ")}</span>
              )}

              {(j.pickup || j.dropoff || j.startPoint || j.endPoint) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={14} />
                  {from} → {to}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Main ---------- */
export default function Reports() {
  const [state, setState] = useState({
    drivers: [],
    tractors: [],
    trailers: [],
    jobs: [],
  });
  const [loading, setLoading] = useState(true);

  const [clientQuery, setClientQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const printRef = useRef(null);

  const [hoverCard, setHoverCard] = useState({
    show: false,
    x: 0,
    y: 0,
    title: "",
    jobs: [],
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalJobs, setModalJobs] = useState([]);

  const refetch = useCallback(async () => {
    try {
      const s = await apiGetState();
      setState({
        drivers: safeArr(s.drivers),
        tractors: safeArr(s.tractors),
        trailers: safeArr(s.trailers),
        jobs: safeArr(s.jobs),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useServerEventRefetch(["state:updated"], refetch);

  const allClients = useMemo(() => {
    return distinct(safeArr(state.jobs).map((j) => j.client)).sort((a, b) =>
      (a || "").localeCompare(b || "")
    );
  }, [state.jobs]);

  const filteredJobs = useMemo(() => {
    let jobs = safeArr(state.jobs);
    if (clientQuery.trim()) {
      const q = clientQuery.trim().toLowerCase();
      jobs = jobs.filter((j) =>
        String(j.client || "")
          .toLowerCase()
          .includes(q)
      );
    }
    if (fromDate) jobs = jobs.filter((j) => (j.date || "") >= fromDate);
    if (toDate) jobs = jobs.filter((j) => (j.date || "") <= toDate);
    return jobs;
  }, [state.jobs, clientQuery, fromDate, toDate]);

  const clientGroups = useMemo(() => {
    const map = new Map();
    for (const j of filteredJobs) {
      const c = j.client || "(No client)";
      const mk = monthKey(j.date);
      if (!map.has(c)) map.set(c, new Map());
      const byMonth = map.get(c);
      if (!byMonth.has(mk)) byMonth.set(mk, { count: 0, dates: [] });
      const bucket = byMonth.get(mk);
      bucket.count += 1;
      if (j.date) bucket.dates.push(j.date);
    }
    const out = [];
    for (const [client, months] of map.entries()) {
      const arr = [...months.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mon, v]) => ({
          month: mon,
          count: v.count,
          dates: v.dates.sort(),
        }));
      out.push({ client, months: arr });
    }
    out.sort((a, b) => {
      const q = clientQuery.trim().toLowerCase();
      const aHit = a.client.toLowerCase().includes(q);
      const bHit = b.client.toLowerCase().includes(q);
      if (aHit !== bHit) return aHit ? -1 : 1;
      return (a.client || "").localeCompare(b.client || "");
    });
    return out;
  }, [filteredJobs, clientQuery]);

  const util = useMemo(() => {
    const tractorCount = new Map();
    const driverCount = new Map();

    for (const j of filteredJobs) {
      if (j.tractorId)
        tractorCount.set(j.tractorId, (tractorCount.get(j.tractorId) || 0) + 1);
      if (Array.isArray(j.driverIds)) {
        for (const d of j.driverIds) {
          if (!d) continue;
          driverCount.set(d, (driverCount.get(d) || 0) + 1);
        }
      }
    }

    const tractors = [...tractorCount.entries()]
      .map(([id, c]) => {
        const t = safeArr(state.tractors).find(
          (x) => String(x.id) === String(id)
        );
        return { id, count: c, code: t?.code || t?.plate || String(id) };
      })
      .sort((a, b) => b.count - a.count);

    const drivers = [...driverCount.entries()]
      .map(([id, c]) => {
        const d = safeArr(state.drivers).find(
          (x) => String(x.id) === String(id)
        );
        return { id, count: c, name: d?.name || d?.code || String(id) };
      })
      .sort((a, b) => b.count - a.count);

    return { tractors, drivers };
  }, [filteredJobs, state.tractors, state.drivers]);

  function exportExcel() {
    const clientRows = [];
    for (const g of clientGroups) {
      for (const m of g.months) {
        clientRows.push({
          client: g.client,
          month: m.month,
          monthLabel: niceMonthLabel(m.month),
          visits: m.count,
          dates: m.dates.join(", "),
        });
      }
    }

    const tractorRows = util.tractors.map((t) => ({
      tractor: t.code,
      tractorId: t.id,
      jobs: t.count,
    }));

    const driverRows = util.drivers.map((d) => ({
      driver: d.name,
      driverId: d.id,
      jobs: d.count,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(clientRows),
      "Client Report"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(tractorRows),
      "Top Tractors"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(driverRows),
      "Top Drivers"
    );
    XLSX.writeFile(wb, "reports-export.xlsx");
  }

  function exportCSV() {
    const rows = [["Client", "Month", "MonthLabel", "Visits", "Dates"]];
    for (const g of clientGroups) {
      for (const m of g.months) {
        rows.push([
          g.client,
          m.month,
          niceMonthLabel(m.month),
          String(m.count),
          m.dates.join("|"),
        ]);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "client-report.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    window.print();
  }

  function openModal(title, jobs) {
    setModalTitle(title);
    setModalJobs(jobs);
    setModalOpen(true);
  }

  return (
    <div
      className="min-h-screen bg-gray-50 p-6 print:p-0 relative"
      ref={printRef}
    >
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporting</h1>
            <p className="text-gray-600 text-sm mt-1">
              Live reports generated from the shared database snapshot. Use
              filters and export buttons.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm font-semibold"
            >
              <Download size={16} /> Export Excel
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-semibold"
            >
              <FileDown size={16} /> Export CSV
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-800 text-sm font-semibold"
            >
              <Printer size={16} /> Export PDF
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-gray-500 font-semibold">
                Client
              </label>
              <div className="relative">
                <input
                  className="input-field w-full pl-8"
                  placeholder="Type client name (or pick from suggestions below)"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                <Search
                  size={16}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {allClients.slice(0, 12).map((c) => (
                  <button
                    key={c}
                    onClick={() => setClientQuery(c)}
                    className="text-[11px] px-2 py-1 rounded-full border border-gray-300 hover:bg-gray-50"
                    title="Use this client"
                  >
                    {c || "(No client)"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] text-gray-500 font-semibold">
                From
              </label>
              <input
                type="date"
                className="input-field w-full"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-semibold">
                To
              </label>
              <input
                type="date"
                className="input-field w-full"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
          <SummaryCard
            icon={<BarChart2 className="h-5 w-5 text-indigo-600" />}
            label="Jobs (filtered)"
            value={filteredJobs.length}
          />
          <SummaryCard
            icon={<Truck className="h-5 w-5 text-blue-600" />}
            label="Active Tractors (filtered)"
            value={distinct(filteredJobs.map((j) => j.tractorId)).length}
          />
          <SummaryCard
            icon={<Users className="h-5 w-5 text-purple-600" />}
            label="Active Drivers (filtered)"
            value={
              distinct(filteredJobs.flatMap((j) => safeArr(j.driverIds))).length
            }
          />
        </div>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 break-inside-avoid relative">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Client Report
            </h2>
            <div className="text-[11px] text-gray-500">
              Click any date to open events.
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : clientGroups.length === 0 ? (
            <div className="text-sm text-gray-400 italic">
              No data for current filters.
            </div>
          ) : (
            clientGroups.map((g) => (
              <div key={g.client} className="mb-6">
                <div className="text-sm font-semibold text-gray-800 mb-2">
                  Client: <span className="text-blue-700">{g.client}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-700 border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 font-semibold border-b">
                          Month
                        </th>
                        <th className="px-3 py-2 font-semibold border-b w-24 text-right">
                          Visits
                        </th>
                        <th className="px-3 py-2 font-semibold border-b">
                          Dates
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.months.map((m) => (
                        <tr
                          key={`${g.client}-${m.month}`}
                          className="border-b last:border-b-0"
                        >
                          <td className="px-3 py-2">
                            {niceMonthLabel(m.month)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {m.count}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {m.dates.map((d) => (
                                <span
                                  key={`${g.client}-${m.month}-${d}`}
                                  className="px-2 py-0.5 rounded-full bg-gray-100 border text-[10px] cursor-pointer hover:bg-gray-200"
                                  onClick={() =>
                                    openModal(
                                      `${g.client} — ${d}`,
                                      filteredJobs
                                        .filter(
                                          (j) =>
                                            (j.client || "(No client)") ===
                                              g.client && j.date === d
                                        )
                                        .sort((a, b) =>
                                          (a.start || "").localeCompare(
                                            b.start || ""
                                          )
                                        )
                                    )
                                  }
                                  title="View events"
                                >
                                  {d}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 break-inside-avoid">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Utilization</h2>
            <div className="text-[11px] text-gray-500">
              Click a number to open its events.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">
                Top Tractors
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-700 border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 font-semibold border-b">
                        Tractor
                      </th>
                      <th className="px-3 py-2 font-semibold border-b w-24 text-right">
                        Jobs
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {util.tractors.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-2 text-gray-400 italic"
                          colSpan={2}
                        >
                          No data.
                        </td>
                      </tr>
                    ) : (
                      util.tractors.map((t) => {
                        const jobs = filteredJobs
                          .filter((j) => String(j.tractorId) === String(t.id))
                          .sort((a, b) =>
                            (a.date || "").localeCompare(b.date || "")
                          );
                        return (
                          <tr
                            key={`t-${t.id}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="px-3 py-2">{t.code}</td>
                            <td className="px-3 py-2 text-right font-semibold">
                              <button
                                className="underline decoration-dotted hover:text-blue-700"
                                onClick={() =>
                                  openModal(`Tractor ${t.code} — events`, jobs)
                                }
                                title="View events"
                              >
                                {t.count}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">
                Top Drivers
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-700 border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 font-semibold border-b">
                        Driver
                      </th>
                      <th className="px-3 py-2 font-semibold border-b w-24 text-right">
                        Jobs
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {util.drivers.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-2 text-gray-400 italic"
                          colSpan={2}
                        >
                          No data.
                        </td>
                      </tr>
                    ) : (
                      util.drivers.map((d) => {
                        const jobs = filteredJobs
                          .filter((j) =>
                            safeArr(j.driverIds).some(
                              (id) => String(id) === String(d.id)
                            )
                          )
                          .sort((a, b) =>
                            (a.date || "").localeCompare(b.date || "")
                          );
                        return (
                          <tr
                            key={`d-${d.id}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="px-3 py-2">{d.name}</td>
                            <td className="px-3 py-2 text-right font-semibold">
                              <button
                                className="underline decoration-dotted hover:text-blue-700"
                                onClick={() =>
                                  openModal(`Driver ${d.name} — events`, jobs)
                                }
                                title="View events"
                              >
                                {d.count}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <div className="hidden print:block p-4 text-[10px] text-gray-500">
          © Fleet Planner — Generated {new Date().toLocaleString()}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
      >
        <JobList
          jobs={modalJobs}
          tractors={state.tractors}
          drivers={state.drivers}
          trailers={state.trailers}
        />
      </Modal>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .print\\:hidden { display: none !important; }
          .break-inside-avoid { break-inside: avoid; }
          .shadow-sm, .border, .rounded-xl { box-shadow: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
