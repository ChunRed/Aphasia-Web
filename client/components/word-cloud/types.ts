import type cloud from "d3-cloud";

export interface WordItem {
  text: string;
  size: number;
}

export interface PlacedWord extends cloud.Word {
  text: string;
  size: number;
  x: number;
  y: number;
  rotate: number;
}

export interface WordCloudProps {
  words: WordItem[];
  width?: number;
  height?: number;
  fontFamily?: string;
  className?: string;
}
