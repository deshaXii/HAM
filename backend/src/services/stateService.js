// backend/src/services/stateService.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/* ===== helpers ===== */
function toStr(x) {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  if (typeof x === "object") return x.name || x.id || JSON.stringify(x);
  return String(x);
}
function toIntOrNull(x) {
  if (x === "" || x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isNaN(n) ? null : n;
}
function toNumOrNull(x) {
  if (x === "" || x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isNaN(n) ? null : n;
}

export async function getFleetState() {
  const [drivers, tractors, trailers, jobs, locations] = await Promise.all([
    prisma.driver.findMany(),
    prisma.tractor.findMany(),
    prisma.trailer.findMany(),
    prisma.job.findMany(),
    prisma.location.findMany(),
  ]);

  return {
    drivers,
    tractors,
    trailers,
    jobs,
    locations,
  };
}

export async function saveFleetState(incomingState) {
  // نضمن وجود Arrays
  const rawDrivers = Array.isArray(incomingState.drivers)
    ? incomingState.drivers
    : [];
  const rawTractors = Array.isArray(incomingState.tractors)
    ? incomingState.tractors
    : [];
  const rawTrailers = Array.isArray(incomingState.trailers)
    ? incomingState.trailers
    : [];
  const rawLocations = Array.isArray(incomingState.locations)
    ? incomingState.locations
    : [];
  const rawJobs = Array.isArray(incomingState.jobs) ? incomingState.jobs : [];

  // 0) هنجيب الجوبات اللي في الداتا بيز دلوقتي عشان نعرف نمسح إيه في الآخر
  const existingJobs = await prisma.job.findMany();
  const existingJobIds = new Set(existingJobs.map((j) => j.id));

  // هنلم IDs اللي جت من الفرونت
  const incomingJobIds = new Set(rawJobs.map((j) => j.id));

  // نشتغل في ترانزاكشن واحدة كبيرة
  await prisma.$transaction(
    async (tx) => {
      /* 1) LOCATIONS */
      for (let i = 0; i < rawLocations.length; i++) {
        const loc = rawLocations[i];
        const id = loc.id || `loc-${i}`;
        await tx.location.upsert({
          where: { id },
          update: {
            name: loc.name || "",
            lat: typeof loc.lat === "number" ? loc.lat : null,
            lng: typeof loc.lng === "number" ? loc.lng : null,
          },
          create: {
            id,
            name: loc.name || "",
            lat: typeof loc.lat === "number" ? loc.lat : null,
            lng: typeof loc.lng === "number" ? loc.lng : null,
          },
        });
      }

      /* 2) DRIVERS (من غير code علشان السكيمة مفيهاش) */
      for (const d of rawDrivers) {
        const base = {
          name: d.name || "",
          canNight: !!d.canNight,
          weekAvailability: Array.isArray(d.weekAvailability)
            ? d.weekAvailability
            : [],
          leaves: Array.isArray(d.leaves) ? d.leaves : [],
        };
        if (typeof d.sleepsInCab === "boolean")
          base.sleepsInCab = d.sleepsInCab;
        if (typeof d.doubleMannedEligible === "boolean")
          base.doubleMannedEligible = d.doubleMannedEligible;
        if (typeof d.photoUrl === "string") base.photoUrl = d.photoUrl;

        await tx.driver.upsert({
          where: { id: d.id },
          update: base,
          create: {
            id: d.id,
            ...base,
          },
        });
      }

      /* 3) TRACTORS */
      for (const t of rawTractors) {
        await tx.tractor.upsert({
          where: { id: t.id },
          update: {
            code: t.code || "",
            plate: t.plate || "",
            doubleManned: !!t.doubleManned,
          },
          create: {
            id: t.id,
            code: t.code || "",
            plate: t.plate || "",
            doubleManned: !!t.doubleManned,
          },
        });
      }

      /* 4) TRAILERS */
      for (const tr of rawTrailers) {
        await tx.trailer.upsert({
          where: { id: tr.id },
          update: {
            code: tr.code || "",
            type: tr.type || "",
          },
          create: {
            id: tr.id,
            code: tr.code || "",
            type: tr.type || "",
          },
        });
      }

      // هنجيب IDs بعد ما عملنا upsert علشان الـ FK
      const tractorsInDb = await tx.tractor.findMany();
      const trailersInDb = await tx.trailer.findMany();
      const tractorIdsSet = new Set(tractorsInDb.map((x) => String(x.id)));
      const trailerIdsSet = new Set(trailersInDb.map((x) => String(x.id)));

      /* 5) JOBS (upsert واحد واحد) */
      for (const job of rawJobs) {
        const pickupStr = toStr(job.pickup);
        const dropoffStr = toStr(job.dropoff);

        // tractor (غالباً رقم)
        let tractorId =
          job.tractorId === "" || job.tractorId === null ? null : job.tractorId;
        if (tractorId !== null) {
          const asStr = String(tractorId);
          if (!tractorIdsSet.has(asStr)) {
            tractorId = null; // ما تحطش FK بايظ
          } else {
            // حوّله رقم لو هو رقم
            const n = toIntOrNull(tractorId);
            tractorId = n;
          }
        }

        // trailer (غالباً UUID)
        let trailerId =
          job.trailerId === "" || job.trailerId === null
            ? null
            : String(job.trailerId);
        if (trailerId !== null && !trailerIdsSet.has(trailerId)) {
          trailerId = null;
        }

        // فلوس
        const revenueIncomeRaw =
          job.revenueTrip !== undefined ? job.revenueTrip : job.revenueIncome;
        const revenueIncome = toNumOrNull(revenueIncomeRaw);
        const costDriver = toNumOrNull(job.costDriver);
        const costTruck = toNumOrNull(job.costTruck);
        const costDiesel = toNumOrNull(job.costDiesel);

        await tx.job.upsert({
          where: { id: job.id },
          update: {
            date: job.date,
            slot: job.slot || "day",
            start: job.start || "08:00",
            durationHours:
              typeof job.durationHours === "number" ? job.durationHours : 4,
            client: job.client || "",
            pickup: pickupStr,
            dropoff: dropoffStr,
            pricingType: job.pricing?.type || "per_km",
            pricingValue:
              typeof job.pricing?.value === "number"
                ? job.pricing.value
                : Number(job.pricing?.value || 0),
            tractorId,
            trailerId,
            driverIds: Array.isArray(job.driverIds) ? job.driverIds : [],
            revenueIncome,
            costDriver,
            costTruck,
            costDiesel,
            notes: job.notes || "",
          },
          create: {
            id: job.id,
            date: job.date,
            slot: job.slot || "day",
            start: job.start || "08:00",
            durationHours:
              typeof job.durationHours === "number" ? job.durationHours : 4,
            client: job.client || "",
            pickup: pickupStr,
            dropoff: dropoffStr,
            pricingType: job.pricing?.type || "per_km",
            pricingValue:
              typeof job.pricing?.value === "number"
                ? job.pricing.value
                : Number(job.pricing?.value || 0),
            tractorId,
            trailerId,
            driverIds: Array.isArray(job.driverIds) ? job.driverIds : [],
            revenueIncome,
            costDriver,
            costTruck,
            costDiesel,
            notes: job.notes || "",
          },
        });
      }

      /* 6) امسح بس الجوبات اللي مكانش ليها أثر في الـ state الجديد */
      for (const oldId of existingJobIds) {
        if (!incomingJobIds.has(oldId)) {
          await tx.job.delete({ where: { id: oldId } });
        }
      }
    },
    {
      // لو عايز تزود السمّاعة
      timeout: 20000,
    }
  );

  return { ok: true };
}
