import Loader from "@components/Loader";
import AuthShell from "../../modules/auth/components/AuthShell";

interface Props {
  footerText?: React.ReactNode | string;
  /** Kept for API compatibility; the Convenio wordmark is part of AuthShell. */
  showLogo?: boolean;
  heading?: string;
  loading?: boolean;
}

export default function AuthContainer(props: React.PropsWithChildren<Props>) {
  return (
    <AuthShell>
      {props.loading && (
        <div className="bg-cal-muted absolute inset-0 z-50 flex items-center">
          <Loader />
        </div>
      )}
      {props.heading && <h2 className="font-cal text-emphasis mb-8 text-3xl">{props.heading}</h2>}
      {props.children}
      {props.footerText && (
        <div className="text-default border-subtle mt-8 border-t pt-6 text-sm">{props.footerText}</div>
      )}
    </AuthShell>
  );
}
