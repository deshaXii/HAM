// back/src/scripts/migrateFromFleetState.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // ناخد آخر نسخة قديمة متخزنة JSON
  const old = await prisma.fleetState.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!old) {
    console.log("No FleetState JSON found.");
    return;
  }

  const data = old.data || {};
  const { jobs = [], drivers = [], tractors = [], trailers = [] } = data;

  // نمسح الجداول اللي هنملاها من الأول
  await prisma.job.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.trailer.deleteMany();
  await prisma.tractor.deleteMany();

  // هنخزن هنا الماب: oldId -> newId
  const tractorIdMap = new Map();

  // ===== 1) ترحيل التراكتورز =====
  for (const t of tractors) {
    const created = await prisma.tractor.create({
      data: {
        // لازم code
        code: t.code
          ? String(t.code)
          : t.name
          ? String(t.name)
          : `TR-${t.id ?? "X"}`,
        plate: t.plate ?? null,
        currentLocation: t.currentLocation ?? null,
        doubleManned:
          typeof t.doubleManned === "boolean" ? t.doubleManned : false,
      },
    });

    // لو كان في الداتا القديمة id هنربطه بالجديد
    if (t.id !== undefined && t.id !== null) {
      const oldNum = Number(t.id);
      if (!Number.isNaN(oldNum)) {
        tractorIdMap.set(oldNum, created.id);
      }
    }
  }

  // ===== 2) ترحيل التريلرز =====
  for (const tr of trailers) {
    const trailerId = String(tr.id);
    await prisma.trailer.create({
      data: {
        id: trailerId,
        code: tr.code ? String(tr.code) : `TL-${tr.id}`,
        plate: tr.plate ?? null,
        type: tr.type ?? null,
      },
    });
  }

  // ===== 3) ترحيل السواقين =====
  for (const d of drivers) {
    await prisma.driver.create({
      data: {
        id: String(d.id),
        name: d.name || "Driver",
        canNight: typeof d.canNight === "boolean" ? d.canNight : true,
        sleepsInCab: typeof d.sleepsInCab === "boolean" ? d.sleepsInCab : false,
        doubleMannedEligible:
          typeof d.doubleMannedEligible === "boolean"
            ? d.doubleMannedEligible
            : true,
        weekAvailability: d.weekAvailability ?? null,
        leaves: d.leaves ?? null,
        photoUrl: d.photoUrl ?? null,
      },
    });
  }

  // ===== 4) ترحيل الجوبز =====
  for (const j of jobs) {
    // نحل الـ tractorId القديم للجديد
    let tractorId = null;
    if (
      j.tractorId !== undefined &&
      j.tractorId !== null &&
      j.tractorId !== ""
    ) {
      const oldTid = Number(j.tractorId);
      if (!Number.isNaN(oldTid) && tractorIdMap.has(oldTid)) {
        tractorId = tractorIdMap.get(oldTid);
      }
    }

    // التريلر عندك String في الاسكيم
    const trailerId = j.trailerId ? String(j.trailerId) : null;

    // الداتا القديمة كان فيها pricing كـ object
    const pricingType =
      j.pricing?.type !== undefined ? j.pricing.type : j.pricingType ?? null;
    const pricingValueRaw =
      j.pricing?.value !== undefined ? j.pricing.value : j.pricingValue ?? null;
    const pricingValue =
      pricingValueRaw !== null && pricingValueRaw !== undefined
        ? Number(pricingValueRaw)
        : null;

    await prisma.job.create({
      data: {
        id: String(j.id),
        date: j.date ? String(j.date) : "", // عندك في الاسكيم String
        slot: j.slot ? String(j.slot) : "day",
        start: j.start ? String(j.start) : "",
        durationHours:
          j.durationHours !== undefined && j.durationHours !== null
            ? Number(j.durationHours)
            : 8,
        client: j.client ?? null,
        pickup: j.pickup ?? null,
        dropoff: j.dropoff ?? null,
        notes: j.notes ?? null,
        pricingType,
        pricingValue,
        tractorId,
        trailerId,
        driverIds: Array.isArray(j.driverIds) ? j.driverIds : null,
        revenueIncome:
          j.revenueIncome !== undefined ? Number(j.revenueIncome) : null,
        costDriver: j.costDriver !== undefined ? Number(j.costDriver) : null,
        costTruck: j.costTruck !== undefined ? Number(j.costTruck) : null,
        costDiesel: j.costDiesel !== undefined ? Number(j.costDiesel) : null,
      },
    });
  }

  console.log("✅ Migration finished successfully.");
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
