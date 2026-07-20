export function collectDeviceMeta() {
  if (typeof window === "undefined") {
    return { userAgent: "", platform: "", language: "", timezone: "", screen: "" };
  }
  const nav = window.navigator;
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {}
  return {
    userAgent: nav.userAgent ?? "",
    platform: (nav as any).userAgentData?.platform ?? nav.platform ?? "",
    language: nav.language ?? "",
    timezone,
    screen:
      typeof window.screen !== "undefined"
        ? `${window.screen.width}x${window.screen.height}`
        : "",
  };
}
