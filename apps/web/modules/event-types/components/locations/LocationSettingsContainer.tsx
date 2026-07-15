const LocationSettingsContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="mt-2 stack-y-2 rounded-2xl border border-subtle bg-subtle p-4">
      <div className="w-full">
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
};

export default LocationSettingsContainer;
