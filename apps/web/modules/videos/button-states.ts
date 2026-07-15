import {
  RECORDING_DEFAULT_ICON,
  RECORDING_IN_PROGRESS_ICON,
  TRANSCRIPTION_STARTED_ICON,
  TRANSCRIPTION_STOPPED_ICON,
} from "@calcom/lib/constants";

type TranslateFn = (key: string) => string;

export const getButtons = (t: TranslateFn) => ({
  STOP_TRANSCRIPTION: {
    label: t("stop"),
    tooltip: t("stop_transcription"),
    iconPath: TRANSCRIPTION_STARTED_ICON,
    iconPathDarkMode: TRANSCRIPTION_STARTED_ICON,
  },
  START_TRANSCRIPTION: {
    label: t("transcribe"),
    tooltip: t("transcription_powered_by_ai"),
    iconPath: TRANSCRIPTION_STOPPED_ICON,
    iconPathDarkMode: TRANSCRIPTION_STOPPED_ICON,
  },
  WAIT_FOR_TRANSCRIPTION_TO_START: {
    label: t("starting"),
    tooltip: t("wait_for_transcription_to_start"),
    iconPath: TRANSCRIPTION_STOPPED_ICON,
    iconPathDarkMode: TRANSCRIPTION_STOPPED_ICON,
  },
  WAIT_FOR_TRANSCRIPTION_TO_STOP: {
    label: t("stopping"),
    tooltip: t("wait_for_transcription_to_stop"),
    iconPath: TRANSCRIPTION_STOPPED_ICON,
    iconPathDarkMode: TRANSCRIPTION_STOPPED_ICON,
  },
  START_RECORDING: {
    label: t("record"),
    tooltip: t("start_recording"),
    iconPath: RECORDING_DEFAULT_ICON,
    iconPathDarkMode: RECORDING_DEFAULT_ICON,
  },
  WAIT_FOR_RECORDING_TO_START: {
    label: t("starting"),
    tooltip: t("wait_for_recording_to_start"),
    iconPath: RECORDING_DEFAULT_ICON,
    iconPathDarkMode: RECORDING_DEFAULT_ICON,
  },
  WAIT_FOR_RECORDING_TO_STOP: {
    label: t("stopping"),
    tooltip: t("wait_for_recording_to_stop"),
    iconPath: RECORDING_DEFAULT_ICON,
    iconPathDarkMode: RECORDING_DEFAULT_ICON,
  },
  STOP_RECORDING: {
    label: t("stop"),
    tooltip: t("stop_recording"),
    iconPath: RECORDING_IN_PROGRESS_ICON,
    iconPathDarkMode: RECORDING_IN_PROGRESS_ICON,
  },
});
