import { SkeletonAvatar, SkeletonButton, SkeletonText } from "@calcom/ui/components/skeleton";

export function StepConnectionLoader() {
  return (
    <ul className="divide-subtle rounded-2xl border border-subtle bg-default p-0 divide-y">
      {Array.from({ length: 4 }).map((_item, index) => {
        return (
          <li className="flex w-full flex-row justify-center border-b-0 py-6" key={index}>
            <SkeletonAvatar className="mx-6 h-8 w-8 px-4" />
            <SkeletonText className="ml-1 mr-4 mt-3 h-5 w-full" />
            <SkeletonButton className="mr-6 h-8 w-20 rounded-md p-5" />
          </li>
        );
      })}
    </ul>
  );
}
