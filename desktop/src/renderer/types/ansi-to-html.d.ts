declare module 'ansi-to-html' {
  export interface AnsiToHtmlOptions {
    fg?: string;
    bg?: string;
    newline?: boolean;
    escapeXML?: boolean;
    stream?: boolean;
    colors?: Record<number, string> | string[];
  }
  export default class Convert {
    constructor(options?: AnsiToHtmlOptions);
    toHtml(input: string): string;
  }
}
