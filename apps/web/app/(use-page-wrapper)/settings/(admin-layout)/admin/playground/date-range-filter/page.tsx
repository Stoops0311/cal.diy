"use client";

import type { DateRangeFilterOptions } from "@calcom/features/data-table/lib/types";
import { ColumnFilterType } from "@calcom/features/data-table/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { DateRangeFilter } from "~/data-table/components/filters/DateRangeFilter";
import { DataTableProvider } from "~/data-table/DataTableProvider";

type DemoRow = {
  id: number;
  name: string;
  date: string;
};

const columnHelper = createColumnHelper<DemoRow>();

type ScenarioProps = {
  id: string;
  title: string;
  description: string;
  expected: string;
  range: DateRangeFilterOptions["range"];
};

const scenarios: ScenarioProps[] = [
  {
    id: "past",
    title: "date_range_playground_past_title",
    description: "date_range_playground_past_description",
    expected: "date_range_playground_past_expected",
    range: "past",
  },
  {
    id: "future",
    title: "date_range_playground_future_title",
    description: "date_range_playground_future_description",
    expected: "date_range_playground_future_expected",
    range: "future",
  },
  {
    id: "any",
    title: "date_range_playground_any_title",
    description: "date_range_playground_any_description",
    expected: "date_range_playground_any_expected",
    range: "any",
  },
  {
    id: "customOnly",
    title: "date_range_playground_custom_title",
    description: "date_range_playground_custom_description",
    expected: "date_range_playground_custom_expected",
    range: "customOnly",
  },
];

function ScenarioCard({ scenario }: { scenario: ScenarioProps }) {
  const { t } = useLocale();
  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t("name"),
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("date", {
        id: "dateRange",
        header: t("date_range"),
        cell: (info) => info.getValue(),
        enableColumnFilter: true,
        meta: {
          filter: {
            type: ColumnFilterType.DATE_RANGE,
            dateRangeOptions: {
              range: scenario.range,
            },
          },
        },
      }),
    ],
    [scenario.range, t]
  );

  const data = useMemo<DemoRow[]>(
    () => [
      { id: 1, name: t("date_range_playground_demo_item", { number: 1 }), date: "2024-01-15" },
      { id: 2, name: t("date_range_playground_demo_item", { number: 2 }), date: "2024-02-20" },
    ],
    [t]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const dateRangeColumn = table.getAllColumns().find((col) => col.id === "dateRange");
  const columnMeta = dateRangeColumn?.columnDef.meta as
    | { filter?: { type: string; dateRangeOptions?: DateRangeFilterOptions } }
    | undefined;
  const dateRangeOptions = columnMeta?.filter?.dateRangeOptions;

  return (
    <section
      className="border-subtle bg-subtle mb-6 rounded-2xl border p-6 shadow-sm"
      data-testid={`drf-scenario-${scenario.id}`}>
      <h2 className="font-cal text-emphasis mb-2 text-xl font-semibold">{t(scenario.title)}</h2>
      <p className="text-default mb-2 text-sm">{t(scenario.description)}</p>
      <p className="text-subtle mb-4 text-xs">
        <strong>{t("expected")}:</strong> {t(scenario.expected)}
      </p>

      <div className="mt-4">
        <DataTableProvider tableIdentifier={`playground-date-range-${scenario.id}`}>
          {dateRangeColumn && (
            <DateRangeFilter
              column={{
                id: dateRangeColumn.id,
                title: dateRangeColumn.columnDef.header as string,
                type: "dr",
              }}
              options={dateRangeOptions}
              showColumnName={false}
              showClearButton={false}
            />
          )}
        </DataTableProvider>
      </div>
    </section>
  );
}

export default function DateRangeFilterPlayground() {
  const { t } = useLocale();

  return (
    <main className="mx-auto max-w-4xl space-y-8 pb-12">
      <header className="border-subtle border-b pb-6">
        <p className="font-mono text-subtle mb-2 text-xs uppercase tracking-[0.18em]">
          {t("admin_playground")}
        </p>
        <h1 className="font-cal text-emphasis text-3xl font-semibold tracking-tight">
          {t("date_range_playground_title")}
        </h1>
        <p className="text-default mt-2">{t("date_range_playground_description")}</p>
        <p className="text-subtle mt-1 text-sm">{t("date_range_playground_explanation")}</p>
      </header>

      {scenarios.map((scenario) => (
        <ScenarioCard key={scenario.id} scenario={scenario} />
      ))}
    </main>
  );
}
