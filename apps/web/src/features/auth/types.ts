export interface TrackAuthConfig {
  track: "commercial" | "government";
  loginPath: string;
  signupPath?: string;
  dashboardPath: string;
  allowDemoAccess: boolean;
  altPrompt: {
    text: string;
    label: string;
    to: string;
    hash?: string;
  };
  copy: {
    subtitle?: string;
    note?: string;
  };
}
