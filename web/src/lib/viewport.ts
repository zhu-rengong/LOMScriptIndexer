import { useBreakpoints } from "@vueuse/core";

export const breakpoints = useBreakpoints({ md: 768, lg: 1024, xl: 1200 });

export const sheetMode = breakpoints.smaller("md");

export const overlayRail = breakpoints.smaller("lg");
