interface Window {
  queryLocalFonts?: () => Promise<{ family: string }[]>;
}
