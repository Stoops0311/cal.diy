import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { PanelCard } from "@calcom/ui/components/card";
import { Switch } from "@calcom/ui/components/form";
import { List, ListItem, ListItemText, ListItemTitle } from "@calcom/ui/components/list";
import { showToast } from "@calcom/ui/components/toast";
import { useState } from "react";
import { AssignFeatureSheet } from "./AssignFeatureSheet";

export const FlagAdminList = () => {
  const { t } = useLocale();
  const [data] = trpc.viewer.features.list.useSuspenseQuery();
  const [selectedFlag, setSelectedFlag] = useState<Flag | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const groupedFlags = data.reduce(
    (acc, flag) => {
      const type = flag.type || "OTHER";
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(flag);
      return acc;
    },
    {} as Record<string, typeof data>
  );

  const sortedTypes = Object.keys(groupedFlags).sort();

  const handleAssignClick = (flag: Flag) => {
    setSelectedFlag(flag);
    setSheetOpen(true);
  };

  return (
    <>
      <div className="stack-y-4">
        {sortedTypes.map((type) => (
          <PanelCard
            key={type}
            title={
              <span className="font-mono text-[11px] text-subtle uppercase tracking-[0.18em]">
                {type.replace(/_/g, " ")}
              </span>
            }
            collapsible
            defaultCollapsed={false}>
            <List roundContainer noBorderTreatment>
              {groupedFlags[type].map((flag: Flag, index: number) => (
                <ListItem key={flag.slug} rounded={index === 0 || index === groupedFlags[type].length - 1}>
                  <div className="flex flex-1 flex-col">
                    <ListItemTitle component="h3">{flag.slug}</ListItemTitle>
                    <ListItemText component="p">{flag.description}</ListItemText>
                  </div>
                  <div className="flex items-center gap-2 py-2">
                    <FlagToggle flag={flag} />
                    <Button
                      color="secondary"
                      size="sm"
                      variant="icon"
                      aria-label={t("assign_feature", { feature: flag.slug })}
                      onClick={() => handleAssignClick(flag)}
                      StartIcon="users"></Button>
                  </div>
                </ListItem>
              ))}
            </List>
          </PanelCard>
        ))}
      </div>
      {selectedFlag && (
        <AssignFeatureSheet flag={selectedFlag} open={sheetOpen} onOpenChange={setSheetOpen} />
      )}
    </>
  );
};

type Flag = RouterOutputs["viewer"]["features"]["list"][number];

const FlagToggle = (props: { flag: Flag }) => {
  const { t } = useLocale();
  const {
    flag: { slug, enabled },
  } = props;
  const utils = trpc.useUtils();
  const mutation = trpc.viewer.admin.toggleFeatureFlag.useMutation({
    onSuccess: () => {
      showToast(t("feature_flag_updated"), "success");
      utils.viewer.features.list.invalidate();
      utils.viewer.features.map.invalidate();
    },
  });
  return (
    <Switch
      defaultChecked={enabled}
      aria-label={t("toggle_feature", { feature: slug })}
      onCheckedChange={(checked) => {
        mutation.mutate({ slug, enabled: checked });
      }}
    />
  );
};
