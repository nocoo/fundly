export type Bindings = {
  ASSETS: Fetcher;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ENVIRONMENT?: string;
};

export type Variables = {
  accessAuthenticated?: boolean;
  accessEmail?: string;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
