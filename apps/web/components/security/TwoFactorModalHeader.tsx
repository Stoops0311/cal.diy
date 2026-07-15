import { ShieldIcon } from "@coss/ui/icons";

const TwoFactorModalHeader = ({ title, description }: { title: string; description: string }) => {
  return (
    <div className="mb-4 sm:flex sm:items-start">
      <div className="border-subtle bg-default mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full border sm:mx-0 sm:h-10 sm:w-10">
        <ShieldIcon className="text-emphasis h-5 w-5" />
      </div>
      <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
        <h2 className="font-cal text-emphasis text-xl leading-tight">{title}</h2>
        <p className="text-subtle mt-1 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
};

export default TwoFactorModalHeader;
