const StepCard: React.FC<{ children: React.ReactNode }> = (props) => {
  return (
    <div className="bg-subtle border-subtle mt-10 rounded-2xl border p-4 shadow-sm sm:p-8">
      {props.children}
    </div>
  );
};

export { StepCard };
