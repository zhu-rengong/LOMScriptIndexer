interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
}

interface Window {
  queryLocalFonts?: () => Promise<LocalFontData[]>;
}
