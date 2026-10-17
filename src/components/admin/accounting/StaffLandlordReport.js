"use client";

import { defaultReportYear } from "@/lib/accounting";
import LandlordYearReport from "@/components/LandlordYearReport";

export default function StaffLandlordReport({ ownerId, year }) {
  return <LandlordYearReport ownerId={ownerId} year={year || defaultReportYear()} staff />;
}
