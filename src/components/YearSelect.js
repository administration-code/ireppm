"use client";

import { useId } from "react";
import { usePathname, useRouter } from "next/navigation";
import { reportYears } from "@/lib/accounting";

export default function YearSelect({ year }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const years = reportYears();
  if (!years.includes(year)) years.push(year);
  return (
    <div className="field acct-picker no-print">
      <label htmlFor={id}>Year</label>
      <select id={id} value={year} onChange={(e) => router.push(`${pathname}?year=${e.target.value}`, { scroll: false })}>
        {years
          .sort((a, b) => b - a)
          .map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
      </select>
    </div>
  );
}
