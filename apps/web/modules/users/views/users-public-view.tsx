"use client";

import {
  sdkActionManager,
  useEmbedNonStylesConfig,
  useEmbedStyles,
  useIsEmbed,
} from "@calcom/embed-core/embed-iframe";
import { useRouterQuery } from "@calcom/lib/hooks/useRouterQuery";
import useTheme from "@calcom/lib/hooks/useTheme";
import { UserAvatar } from "@calcom/ui/components/avatar";
import { Icon } from "@calcom/ui/components/icon";
import { OrgBanner } from "@calcom/ui/components/organization-banner";
import { UnpublishedEntity } from "@calcom/ui/components/unpublished-entity";
import { EventTypeDescriptionLazy as EventTypeDescription } from "@calcom/web/modules/event-types/components";
import EmptyPage from "@calcom/web/modules/event-types/components/EmptyPage";
import type { getServerSideProps } from "@server/lib/[user]/getServerSideProps";
import classNames from "classnames";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { Toaster } from "sonner";

export type PageProps = InferGetServerSidePropsType<typeof getServerSideProps>;
export function UserPage(props: PageProps) {
  const { users, profile, eventTypes, entity } = props;

  const [user] = users; //To be used when we only have a single user, not dynamic group
  useTheme(profile.theme);

  const isBioEmpty = !user.bio || !user.bio.replace("<p><br></p>", "").length;

  const isEmbed = useIsEmbed(props.isEmbed);
  const eventTypeListItemEmbedStyles = useEmbedStyles("eventTypeListItem");
  const shouldAlignCentrallyInEmbed = useEmbedNonStylesConfig("align") !== "left";
  const shouldAlignCentrally = !isEmbed || shouldAlignCentrallyInEmbed;
  const {
    // So it doesn't display in the Link (and make tests fail)
    user: _user,
    orgSlug: _orgSlug,
    redirect: _redirect,
    ...query
  } = useRouterQuery();

  if (entity.considerUnpublished) {
    return (
      <div className="flex h-full min-h-[calc(100dvh)] items-center justify-center">
        <UnpublishedEntity {...entity} />
      </div>
    );
  }

  const isEventListEmpty = eventTypes.length === 0;
  const isOrg = !!user?.profile?.organization;

  return (
    <>
      <div
        className={classNames(
          "min-h-dvh bg-default",
          shouldAlignCentrally ? "mx-auto" : "",
          isEmbed ? "max-w-5xl" : ""
        )}>
        <main
          className={classNames(
            shouldAlignCentrally ? "mx-auto" : "",
            isEmbed ? "border-booker border-booker-width rounded-3xl" : "",
            "max-w-5xl px-4 py-8 md:py-16"
          )}>
          <div className="grid overflow-hidden rounded-3xl border border-subtle md:min-h-[560px] md:grid-cols-[minmax(16rem,0.82fr)_minmax(0,1.18fr)]">
            <section
              className="relative flex flex-col justify-between overflow-hidden bg-inverted p-8 text-inverted md:p-10"
              data-testid="profile-plane">
              <div>
                {isOrg && user.profile.organization?.bannerUrl && (
                  <OrgBanner
                    alt={user.profile.organization.name ?? "Organization banner"}
                    imageSrc={user.profile.organization.bannerUrl}
                    className="w-full rounded-2xl border border-inverted/20 object-cover p-1"
                  />
                )}
                <UserAvatar
                  size="lg"
                  user={{
                    avatarUrl: user.avatarUrl,
                    profile: user.profile,
                    name: profile.name,
                    username: profile.username,
                  }}
                  className={classNames(
                    "ring-2 ring-inverted/15",
                    isOrg && user.profile.organization?.bannerUrl ? "-mt-10" : ""
                  )}
                />
                <h1
                  className={classNames(
                    "mb-2 font-cal text-3xl leading-none text-inverted",
                    isOrg && user.profile.organization?.bannerUrl ? "mt-6" : "mt-8"
                  )}
                  data-testid="name-title">
                  {profile.name}
                  {(user.verified || isOrg) && (
                    <Icon name="badge-check" className="mx-1 -mt-1 inline h-5 w-5 text-inverted" />
                  )}
                </h1>
                {!isBioEmpty && (
                  <>
                    {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via safeBio */}
                    <div
                      className="wrap-break-word text-sm text-inverted/70 [&_a]:text-inverted [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: props.safeBio }}
                    />
                  </>
                )}
              </div>
              <span className="mt-16 font-mono text-[10px] uppercase tracking-[0.2em] text-inverted/45">
                Convenio
              </span>
            </section>

            <section className="bg-subtle p-3 md:p-5" data-testid="event-types">
              <div className={classNames(!isEventListEmpty && "divide-y divide-muted border-muted border-y")}>
                {eventTypes.map((type) => (
                  <Link
                    key={type.id}
                    style={{ display: "flex", ...eventTypeListItemEmbedStyles }}
                    prefetch={false}
                    href={{
                      pathname: `/${user.profile.username}/${type.slug}`,
                      query,
                    }}
                    passHref
                    onClick={async () => {
                      sdkActionManager?.fire("eventTypeSelected", {
                        eventType: type,
                      });
                    }}
                    className="group relative rounded-xl transition-colors hover:bg-default"
                    data-testid="event-type-link">
                    <Icon
                      name="arrow-right"
                      className="absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-emphasis opacity-40 transition-[transform,opacity] group-hover:translate-x-1 group-hover:opacity-100"
                    />
                    {/* Don't prefetch till the time we drop the amount of javascript in [user][type] page which is impacting score for [user] page */}
                    <div className="block w-full px-5 py-6 pr-12">
                      <div className="flex flex-wrap items-center">
                        <h2 className="pr-2 font-cal text-base text-emphasis">{type.title}</h2>
                      </div>
                      <EventTypeDescription eventType={type} isPublic={true} shortenDescription />
                    </div>
                  </Link>
                ))}
              </div>

              {isEventListEmpty && <EmptyPage name={profile.name || "User"} />}
            </section>
          </div>
        </main>
        <Toaster position="bottom-right" />
      </div>
    </>
  );
}

export default UserPage;
