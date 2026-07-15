"use client";

import type { UserAdminTeams } from "@calcom/features/users/repositories/UserRepository";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { AppCategories } from "@calcom/prisma/client";
import type { AppFrontendPayload as App } from "@calcom/types/App";
import type { CredentialFrontendPayload as Credential } from "@calcom/types/Credential";
import classNames from "@calcom/ui/classNames";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { ChevronLeftIcon, ChevronRightIcon } from "@coss/ui/icons";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { UIEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { AppCard } from "./AppCard";

export function useShouldShowArrows() {
  const ref = useRef<HTMLUListElement>(null);
  const [showArrowScroll, setShowArrowScroll] = useState({
    left: false,
    right: false,
  });

  useEffect(() => {
    const appCategoryList = ref.current;
    if (appCategoryList) {
      const isAtStart = appCategoryList.scrollLeft <= 0;
      const isAtEnd = appCategoryList.scrollWidth <= appCategoryList.clientWidth + appCategoryList.scrollLeft;
      setShowArrowScroll({
        left: !isAtStart,
        right: !isAtEnd,
      });
    }
  }, [ref.current?.scrollWidth, ref.current?.clientWidth]);

  const calculateScroll = (e: UIEvent<HTMLUListElement>) => {
    const target = e.currentTarget;
    const isAtEnd = target.scrollWidth <= target.clientWidth + target.scrollLeft + 1;
    setShowArrowScroll({
      left: target.scrollLeft > 0,
      right: !isAtEnd,
    });
  };

  return { ref, calculateScroll, leftVisible: showArrowScroll.left, rightVisible: showArrowScroll.right };
}

type AllAppsPropsType = {
  apps: (App & { credentials?: Credential[] })[];
  searchText?: string;
  categories: string[];
  userAdminTeams?: UserAdminTeams;
};

interface CategoryTabProps {
  selectedCategory: string | null;
  categories: string[];
  searchText?: string;
  onCategoryChange: (category: string | null) => void;
}

function CategoryTab({ selectedCategory, categories, searchText, onCategoryChange }: CategoryTabProps) {
  const { t } = useLocale();
  const { ref, calculateScroll, leftVisible, rightVisible } = useShouldShowArrows();

  const handleLeft = () => {
    if (ref.current) {
      ref.current.scrollLeft -= 100;
    }
  };

  const handleRight = () => {
    if (ref.current) {
      ref.current.scrollLeft += 100;
    }
  };

  return (
    <div className="relative mb-4 flex flex-col justify-between lg:flex-row lg:items-center">
      <h2 className="text-emphasis hidden text-base font-semibold leading-none sm:block">
        {searchText
          ? t("search")
          : t("category_apps", {
              category:
                (selectedCategory && selectedCategory[0].toUpperCase() + selectedCategory.slice(1)) ||
                t("all"),
            })}
      </h2>
      {leftVisible && (
        <button
          type="button"
          aria-label={t("previous")}
          onClick={handleLeft}
          className="absolute bottom-0 flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis lg:left-1/2">
          <div className="bg-default flex h-10 w-5 items-center justify-end">
            <ChevronLeftIcon className="text-subtle h-4 w-4" />
          </div>
          <div className="to-default flex h-10 w-5 bg-linear-to-l from-transparent" />
        </button>
      )}
      <ul
        className="no-scrollbar mt-3 flex max-w-full space-x-1 overflow-x-auto lg:mt-0 lg:max-w-[50%]"
        onScroll={(e) => calculateScroll(e)}
        ref={ref}>
        <li className="min-w-max">
          <button
            type="button"
            aria-pressed={selectedCategory === null}
            onClick={() => onCategoryChange(null)}
            className={classNames(
              selectedCategory === null ? "bg-inverted text-inverted" : "bg-subtle text-emphasis",
              "rounded-lg px-4 py-2.5 font-medium text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis"
            )}>
            {t("all")}
          </button>
        </li>
        {categories.map((cat, pos) => (
          <li key={pos} className="min-w-max">
            <button
              type="button"
              aria-pressed={selectedCategory === cat}
              onClick={() => onCategoryChange(selectedCategory === cat ? null : cat)}
              className={classNames(
                selectedCategory === cat ? "bg-inverted text-inverted" : "bg-subtle text-emphasis",
                "rounded-lg px-4 py-2.5 font-medium text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis"
              )}>
              {cat === "crm" ? cat.toUpperCase() : cat[0].toUpperCase() + cat.slice(1)}
            </button>
          </li>
        ))}
      </ul>
      {rightVisible && (
        <button
          type="button"
          aria-label={t("next")}
          onClick={handleRight}
          className="absolute right-0 bottom-0 flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emphasis">
          <div className="to-default flex h-10 w-5 bg-linear-to-r from-transparent" />
          <div className="bg-default flex h-10 w-5 items-center justify-end">
            <ChevronRightIcon className="text-subtle h-4 w-4" />
          </div>
        </button>
      )}
    </div>
  );
}

export function AllApps({ apps, searchText, categories, userAdminTeams }: AllAppsPropsType) {
  const { t } = useLocale();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [appsContainerRef, enableAnimation] = useAutoAnimate<HTMLDivElement>();

  const handleCategoryChange = (category: string | null) => {
    const validCategory =
      category && typeof category === "string" && categories.includes(category) ? category : null;
    setSelectedCategory(validCategory);
  };

  const filteredApps = apps
    .filter((app) =>
      selectedCategory !== null
        ? app.categories
          ? app.categories.includes(selectedCategory as AppCategories)
          : app.category === selectedCategory
        : true
    )
    .filter((app) =>
      searchText
        ? app.name
            .toLowerCase()
            .replace(/[\s\-_]/g, "")
            .includes(searchText.toLowerCase().replace(/[\s\-_]/g, ""))
        : true
    )
    .sort((a, b) => {
      if (a.name < b.name) return -1;
      else if (a.name > b.name) return 1;
      return 0;
    });

  return (
    <div>
      <CategoryTab
        selectedCategory={selectedCategory}
        searchText={searchText}
        categories={categories}
        onCategoryChange={handleCategoryChange}
      />
      {filteredApps.length ? (
        <div className="border-subtle divide-subtle divide-y border-b border-t" ref={appsContainerRef}>
          {filteredApps.map((app) => (
            <AppCard
              key={app.name}
              app={app}
              searchText={searchText}
              credentials={app.credentials}
              userAdminTeams={userAdminTeams}
            />
          ))}
        </div>
      ) : (
        <EmptyScreen
          Icon="search"
          headline={t("no_results")}
          description={searchText ? searchText?.toString() : ""}
        />
      )}
    </div>
  );
}
